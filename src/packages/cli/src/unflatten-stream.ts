import { Writable } from "node:stream";
import { getHeapStatistics } from "node:v8";
import type { OutputSink } from "./output.js";
import { OutOfOrderError, StreamEmitter } from "./unflatten/emitter.js";
import { LineSplitter } from "./unflatten/lines.js";
import { OutputBuffer } from "./unflatten/output.js";
import { LineParser } from "./unflatten/parse.js";
import { TreeBuilder, type TreeSerializer } from "./unflatten/tree.js";
import { JsonWriter } from "./unflatten/writer.js";

const MIB = 1024 * 1024;
/** Share of the V8 heap the out-of-order fallback may fill before it gives up with an error. */
const HEAP_LIMIT_SHARE = 0.75;

export interface UnflattenOptions {
  /** Indent with two spaces, exactly like `JSON.stringify(value, null, 2)`. */
  pretty?: boolean;
  /**
   * Bytes of input kept (and of output held back) while streaming begins. Out-of-order
   * gron seen before either limit is reached is rebuilt in memory; after that it is an error.
   */
  budgetBytes?: number;
}

type Chunk = Uint8Array | string;

/**
 * Converts gron read from `input` to JSON written to `output`, which is committed once everything has been
 * written and aborted when anything fails, so a file target is only ever replaced by a complete document.
 *
 * Document-order gron (what `gronify flatten` writes) is converted in a single
 * pass with constant memory. Output is held back, and the raw input kept, until
 * `budgetBytes` of either has accumulated. If the input turns out not to be in
 * document order before that point, everything is dropped and rebuilt with an
 * in-memory tree; afterwards, out-of-order input is an error because earlier
 * output may already have been written.
 *
 * Rejects with `line N: ...` errors for invalid gron, with the same messages as before.
 */
export async function unflattenStream(
  input: AsyncIterable<Chunk>,
  output: OutputSink,
  options: UnflattenOptions = {}
): Promise<void> {
  const budget = options.budgetBytes ?? 16 * MIB;
  const run = new Unflattener(output, options.pretty ?? false, budget);
  try {
    for await (const chunk of input) {
      await run.consume(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : toBuffer(chunk));
    }
    await run.finish();
    await output.commit();
  } catch (error) {
    await output.abort();
    throw error;
  } finally {
    run.dispose();
  }
}

function toBuffer(chunk: Uint8Array): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

class Unflattener {
  private readonly out: OutputBuffer;
  private readonly parser = new LineParser();
  private readonly emitter: StreamEmitter;
  private splitter = new LineSplitter();
  private tree: TreeBuilder | undefined;
  /** Raw input since the start, kept only while the streaming pass can still be abandoned. */
  private retained: Buffer[] | undefined = [];
  private retainedBytes = 0;

  constructor(
    output: OutputSink,
    private readonly pretty: boolean,
    private readonly budget: number
  ) {
    this.out = new OutputBuffer(output, budget);
    this.emitter = new StreamEmitter(this.parser, this.out, pretty);
  }

  async consume(chunk: Buffer): Promise<void> {
    if (chunk.length === 0) return;
    if (this.tree) {
      this.splitter.feed(chunk);
      this.splitter.run(this.tree);
      this.checkHeap();
      return;
    }
    if (this.retained) {
      this.retained.push(chunk);
      this.retainedBytes += chunk.length;
    }
    try {
      this.splitter.feed(chunk);
      let done = this.splitter.run(this.emitter);
      while (!done) {
        await this.relieve();
        done = this.emitter.resume() && this.splitter.run(this.emitter);
      }
    } catch (error) {
      if (!(error instanceof OutOfOrderError)) throw error;
      this.rebuildInMemory(error);
      return;
    }
    if (this.retained && (this.retainedBytes >= this.budget || this.out.overBudget)) this.commit();
    await this.out.flush();
  }

  async finish(): Promise<void> {
    // Terminates a last line that has no newline.
    await this.consume(Buffer.from("\n"));
    if (this.tree) {
      if (!this.tree.hasRoot) throw new Error("input contains no gron assignments");
      this.commit();
      const writer = new JsonWriter(this.out, this.pretty);
      const serializer: TreeSerializer = this.tree.serializer(writer, this.out);
      while (!serializer.run()) await this.out.flush();
      writer.finish();
    } else {
      this.emitter.finish();
    }
    await this.out.finish();
  }

  dispose(): void {
    this.out.dispose();
  }

  /** Releases held output once the budget is spent; later out-of-order input can no longer be recovered. */
  private commit(): void {
    this.retained = undefined;
    this.out.commit();
  }

  private async relieve(): Promise<void> {
    if (this.out.overBudget) this.commit();
    await this.out.flush();
  }

  private rebuildInMemory(cause: OutOfOrderError): void {
    const retained = this.retained;
    if (!retained) {
      const size = this.budget >= MIB ? `${Math.round(this.budget / MIB)} MiB` : `${this.budget} bytes`;
      throw new Error(
        `${cause.message}. Once ${size} of input has been read or ${size} ` +
          `of output produced (a large array gap counts as output), gron must be in document order: a container before its ` +
          `children, siblings together, array indexes ascending. ` +
          `Regenerate it with 'gronify flatten' instead of sorting or reordering it`
      );
    }
    this.out.discard();
    this.retained = undefined;
    const tree = new TreeBuilder(this.parser);
    this.tree = tree;
    this.splitter = new LineSplitter();
    for (const chunk of retained) {
      this.splitter.feed(chunk);
      this.splitter.run(tree);
    }
    this.checkHeap();
  }

  private checkHeap(): void {
    const { used_heap_size: used, heap_size_limit: limit } = getHeapStatistics();
    if (used > limit * HEAP_LIMIT_SHARE) {
      throw new Error(
        "out-of-order gron is too large to rebuild in memory; regenerate it in document order with 'gronify flatten'"
      );
    }
  }
}

/** In-memory output, for terminal colouring that has to see the whole document. */
export function createMemoryOutput(): { sink: OutputSink; text: () => string } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });
  const sink: OutputSink = {
    open: () => stream,
    commit: async () => {},
    abort: async () => {}
  };
  return { sink, text: () => Buffer.concat(chunks).toString("utf8") };
}
