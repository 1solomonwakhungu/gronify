import type { Writable } from "node:stream";
import type { LineMatcher } from "./matcher.js";

export interface OutputOptions {
  /** Creates the destination on the first flush, so nothing is created (or truncated) when there is no output. */
  open: () => Writable;
  /** End the stream when finished. Leave false for process.stdout, which cannot be closed. */
  ownsStream?: boolean;
  blockSize?: number;
  /** Keep only lines the matcher accepts (or rejects, with `invert`). */
  matcher?: LineMatcher | null;
  invert?: boolean;
  /** Count matching lines without writing them. */
  countOnly?: boolean;
  /** Rewrites each kept line, for color and pretty output. */
  format?: ((line: string) => string) | null;
}

const NEWLINE = 0x0a;
const DEFAULT_BLOCK_SIZE = 1 << 20;
const MAX_SPARE_BLOCKS = 4;

/**
 * Collects gron lines into large byte blocks and hands them to a stream. Producers call `reserve`, write bytes at
 * `pos`, then call `lineDone`; lines that a matcher rejects are rewound without ever being copied. When the stream
 * pushes back, `blocked` turns true and the producer should stop and `await drain()`.
 */
export class GronOutput {
  buf: Buffer;
  pos = 0;
  blocked = false;
  /** Number of lines kept by the matcher (only counted when a matcher is set). */
  matched = 0;

  private stream: Writable | null = null;
  private spare: Buffer[] = [];
  private failure: Error | null = null;
  private waiters: Array<() => void> = [];
  private finished = false;

  private readonly open: () => Writable;
  private readonly ownsStream: boolean;
  private readonly blockSize: number;
  private readonly matcher: LineMatcher | null;
  private readonly invert: boolean;
  private readonly countOnly: boolean;
  private readonly format: ((line: string) => string) | null;

  constructor(options: OutputOptions) {
    this.open = options.open;
    this.ownsStream = options.ownsStream ?? false;
    this.blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
    this.matcher = options.matcher ?? null;
    this.invert = options.invert ?? false;
    this.countOnly = options.countOnly ?? false;
    this.format = options.format ?? null;
    this.buf = Buffer.allocUnsafe(this.blockSize);
  }

  /** Ensures `n` more bytes fit at `pos`. May flush earlier, completed lines, so call it before starting a line. */
  reserve(n: number): void {
    if (this.pos + n > this.buf.length) this.makeRoom(n);
  }

  /** Finishes the line that started at `start`: filters, formats and terminates it. Needs one reserved byte. */
  lineDone(start: number): void {
    const matcher = this.matcher;
    if (matcher !== null) {
      if (matcher.test(this.buf, start, this.pos) === this.invert) {
        this.pos = start;
        return;
      }
      this.matched += 1;
      if (this.countOnly) {
        this.pos = start;
        return;
      }
    }
    if (this.format !== null) {
      const formatted = this.format(this.buf.toString("utf8", start, this.pos));
      this.pos = start;
      this.reserve(Buffer.byteLength(formatted) + 1);
      this.pos += this.buf.write(formatted, this.pos, "utf8");
    }
    this.buf[this.pos++] = NEWLINE;
  }

  /** Hands everything written so far to the stream. */
  flush(): void {
    if (this.pos === 0) return;
    if (this.pos * 2 > this.buf.length) {
      // The stream takes the block as is, with no copy.
      const block = this.buf;
      const chunk = block.subarray(0, this.pos);
      this.buf = this.spare.pop() ?? Buffer.allocUnsafe(this.blockSize);
      this.pos = 0;
      this.send(chunk, block);
    } else {
      // A mostly empty block is copied out so the large buffer can keep filling.
      const chunk = Buffer.from(this.buf.subarray(0, this.pos));
      this.pos = 0;
      this.send(chunk, null);
    }
  }

  /** Resolves once the stream has caught up; rejects if it failed. */
  async drain(): Promise<void> {
    if (this.failure) throw this.failure;
    if (!this.blocked) return;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.failure) throw this.failure;
  }

  /**
   * Flushes (unless `flushPending` is false, which drops the unwritten tail) and, for owned streams, closes the
   * destination. Output already handed to the stream is kept either way.
   */
  async finish(flushPending: boolean): Promise<void> {
    if (flushPending) this.flush();
    this.pos = 0;
    this.finished = true;
    const stream = this.stream;
    if (stream === null) return;
    if (this.failure) throw this.failure;
    if (!this.ownsStream) {
      await this.drain();
      return;
    }
    await new Promise<void>((resolve) => {
      stream.once("close", resolve);
      stream.end();
    });
    if (this.failure) throw this.failure;
  }

  private makeRoom(n: number): void {
    this.flush();
    if (n > this.buf.length) this.buf = Buffer.allocUnsafe(Math.max(n, this.buf.length * 2));
  }

  private send(chunk: Buffer, block: Buffer | null): void {
    if (this.failure) return;
    const stream = this.stream ?? this.attach();
    if (!stream.write(chunk)) this.blocked = true;
    // A synchronous destination (a file or /dev/null as stdout) has consumed the chunk by now. Reusing the block
    // avoids allocating, and page-faulting, a fresh one per flush. Asynchronous streams keep theirs.
    if (block !== null && block.length === this.blockSize && stream.writableLength === 0 && this.spare.length < MAX_SPARE_BLOCKS) {
      this.spare.push(block);
    }
  }

  private attach(): Writable {
    const stream = this.open();
    stream.on("drain", () => {
      if (!this.failure) this.blocked = false;
      this.release();
    });
    stream.on("error", (error: Error) => {
      this.failure = error;
      this.blocked = true;
      this.release();
    });
    stream.on("close", () => {
      if (!this.finished && !this.failure) {
        this.failure = new Error("output stream closed unexpectedly");
        this.blocked = true;
      }
      this.release();
    });
    this.stream = stream;
    return stream;
  }

  private release(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }
}
