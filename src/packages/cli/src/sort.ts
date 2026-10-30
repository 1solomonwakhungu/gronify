import { randomBytes } from "node:crypto";
import { closeSync, openSync, readSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LineSink } from "./flatten-stream.js";
import type { GronOutput } from "./output.js";
import type { JsonGate, JsonSink } from "./tokenizer.js";

const NEWLINE = 0x0a;
const EMPTY = Buffer.alloc(0);

const DEFAULT_MEMORY_LIMIT = 64 << 20;
/** A closed block at most this big is written to the output at once; bigger ones wait for the async pump. */
const SYNC_EMIT_LIMIT = 1 << 20;
/** A closed child at most this big is copied into its parent's buffer; bigger ones are kept and read in place. */
const INLINE_LIMIT = 4096;
const READ_CHUNK = 1 << 20;
/** The first spill pass skips buffers smaller than this, since writing a few bytes to disk frees nothing. */
const MIN_SPILL = 64 << 10;

export interface SortOptions {
  /** Bytes of line data kept in memory before the largest-ancestor buffers are written to a temp file. */
  memoryLimit?: number | undefined;
}

const MEMORY_UNITS: Record<string, number> = {
  "": 1,
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
};

/** Parses `GRONIFY_SORT_MEMORY`: a byte count, or a number with a KB/MB/GB (powers of 1000) or KiB/MiB/GiB suffix. */
export function parseMemoryLimit(text: string): number {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*([a-z]*)\s*$/i.exec(text);
  const unit = match === null ? undefined : MEMORY_UNITS[match[2]!.toLowerCase()];
  const bytes = match === null || unit === undefined ? NaN : Math.floor(Number(match[1]) * unit);
  if (!Number.isSafeInteger(bytes) || bytes < 1) {
    throw new Error(
      `GRONIFY_SORT_MEMORY must be a positive size such as 67108864, 64MiB or 64MB (bytes, or KB/MB/GB, or KiB/MiB/GiB); got '${text}'`,
    );
  }
  return bytes;
}

function defaultMemoryLimit(): number {
  const configured = process.env.GRONIFY_SORT_MEMORY;
  return configured === undefined || configured.trim() === "" ? DEFAULT_MEMORY_LIMIT : parseMemoryLimit(configured);
}

/** A view of bytes holding whole lines. The object is reused between yields, so consume it before resuming. */
interface Chunk {
  buf: Buffer;
  start: number;
  end: number;
  /** Number of lines in the range, or -1 when unknown. */
  lines: number;
}

/** Spilled bytes `[virt, virt + length)` of an arena live at `offset` in the spill file. */
interface Piece {
  virt: number;
  offset: number;
  length: number;
}

/** An anonymous temp file: unlinked right after it is opened, so a crash or a kill cannot leave it behind. */
class SpillFile {
  private fd: number;
  private size = 0;
  private path: string | null;

  constructor() {
    const path = join(tmpdir(), `gronify-sort-${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
    this.fd = openSync(path, "wx+", 0o600);
    try {
      unlinkSync(path);
      this.path = null;
    } catch {
      // Platforms that refuse to unlink an open file: remove it in close().
      this.path = path;
    }
  }

  /** Appends `buf[start, end)` and returns where it starts in the file. */
  write(buf: Buffer, start: number, end: number): number {
    const offset = this.size;
    for (let at = start; at < end; ) at += writeSync(this.fd, buf, at, end - at, offset + at - start);
    this.size += end - start;
    return offset;
  }

  read(offset: number, into: Buffer, length: number): void {
    for (let got = 0; got < length; ) {
      const n = readSync(this.fd, into, got, length - got, offset + got);
      if (n === 0) throw new Error("sort buffer file ended early");
      got += n;
    }
  }

  close(): void {
    closeSync(this.fd);
    if (this.path !== null) {
      try {
        unlinkSync(this.path);
      } catch {
        // Already gone.
      }
    }
  }
}

/** State shared by every buffer of one sort. */
class Store {
  /** Line bytes currently held in memory across all arenas. */
  resident = 0;
  scratch = Buffer.allocUnsafe(READ_CHUNK);
  readonly chunk: Chunk = { buf: EMPTY, start: 0, end: 0, lines: 0 };
  /** Closed frames that a parent (or the output queue) still has to read. They are what gets spilled. */
  readonly retained = new Set<Frame>();
  private spillFile: SpillFile | null = null;

  constructor(readonly limit: number) {}

  file(): SpillFile {
    return (this.spillFile ??= new SpillFile());
  }

  close(): void {
    this.spillFile?.close();
    this.spillFile = null;
  }
}

/**
 * An append-only byte buffer whose oldest bytes can move to the spill file. Offsets are positions in the whole
 * stream, spilled or not. Appends are whole lines, so every spilled piece starts and ends on a line boundary.
 */
class Arena {
  buf: Buffer = EMPTY;
  /** Bytes of the stream still in `buf`; they follow the `spilled` bytes. */
  used = 0;
  spilled = 0;
  private pieces: Piece[] = [];

  constructor(readonly store: Store) {}

  get length(): number {
    return this.spilled + this.used;
  }

  append(src: Buffer, start: number, end: number): void {
    const n = end - start;
    if (this.used + n > this.buf.length) {
      const grown = Buffer.allocUnsafe(Math.max(this.used + n, this.buf.length * 2, 256));
      this.buf.copy(grown, 0, 0, this.used);
      this.buf = grown;
    }
    if (n > 48) {
      src.copy(this.buf, this.used, start, end);
    } else {
      for (let i = 0; i < n; i += 1) this.buf[this.used + i] = src[start + i]!;
    }
    this.used += n;
    this.store.resident += n;
  }

  spill(): void {
    if (this.used === 0) return;
    const offset = this.store.file().write(this.buf, 0, this.used);
    this.pieces.push({ virt: this.spilled, offset, length: this.used });
    this.spilled += this.used;
    this.store.resident -= this.used;
    this.used = 0;
    // The capacity is not counted in `resident`, so give it back instead of holding it for a frame that may stay idle.
    this.buf = EMPTY;
  }

  release(): void {
    this.store.resident -= this.used;
    this.used = 0;
    this.spilled = 0;
    this.buf = EMPTY;
    this.pieces = [];
  }

  /** Yields the bytes `[from, to)`: whole lines, in slices of at most about READ_CHUNK for the spilled part. */
  *read(from: number, to: number, lines: number): Generator<Chunk, void, undefined> {
    const chunk = this.store.chunk;
    let at = from;
    while (at < to) {
      if (at >= this.spilled) {
        chunk.buf = this.buf;
        chunk.start = at - this.spilled;
        chunk.end = to - this.spilled;
        chunk.lines = at === from ? lines : -1;
        yield chunk;
        return;
      }
      const piece = this.pieceAt(at);
      const stop = Math.min(to, piece.virt + piece.length);
      const whole = at === from && stop === to && stop - at <= READ_CHUNK;
      let offset = piece.offset + (at - piece.virt);
      let left = stop - at;
      while (left > 0) {
        const scratch = this.store.scratch;
        const size = Math.min(left, scratch.length);
        this.store.file().read(offset, scratch, size);
        let cut = size;
        if (size < left) {
          // Not the last slice: end it on a line boundary.
          cut = scratch.lastIndexOf(NEWLINE, size - 1) + 1;
          if (cut === 0) {
            // A single line longer than the scratch buffer.
            this.store.scratch = Buffer.allocUnsafe(scratch.length * 2);
            continue;
          }
        }
        chunk.buf = scratch;
        chunk.start = 0;
        chunk.end = cut;
        chunk.lines = whole ? lines : -1;
        yield chunk;
        offset += cut;
        left -= cut;
      }
      at = stop;
    }
  }

  private pieceAt(at: number): Piece {
    let low = 0;
    let high = this.pieces.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.pieces[mid]!.virt <= at) low = mid;
      else high = mid - 1;
    }
    return this.pieces[low]!;
  }
}

/**
 * One container being read. Its members are entries: a range of lines in `arena` (a scalar, a small child copied in,
 * or the container's own line, which is the first entry and sorts before every key), or a reference to a closed child
 * frame that is too big to copy. Each entry has a key so the entries can be read back in key order. Entries that follow
 * each other under the same key (the lines of an array, which has no frame of its own inside an object) share one range.
 */
class Frame {
  readonly arena: Arena;
  /** Lines in all entries. */
  lines = 0;
  /** Bytes in all entries, including the referenced children. */
  total = 0;
  /** Key of the member being read. It stays "" while the container's own line is added, so that line sorts first. */
  key = "";
  /** Some entry is a reference to another frame. */
  hasRefs = false;
  /** The entries are in key order already (duplicate keys count as ordered). */
  sorted = true;
  readonly keys: string[] = [];
  readonly starts: number[] = [];
  readonly counts: number[] = [];
  /** Child frames by entry index. Shorter than `starts` when the last entries are plain ranges. */
  readonly kids: Array<Frame | undefined> = [];

  constructor(
    /** An array with no object above it: its lines go straight to the output as they complete. */
    readonly streaming: boolean,
    private readonly store: Store,
  ) {
    this.arena = new Arena(store);
  }

  /** True when the entries are plain ranges of the arena in memory, so they can be read without the walk. */
  get plain(): boolean {
    return !this.hasRefs && this.arena.spilled === 0;
  }

  /** Starts an entry of `lines` lines whose `bytes` bytes the caller appends to the arena next. */
  addRange(lines: number, bytes: number): void {
    this.lines += lines;
    this.total += bytes;
    const keys = this.keys;
    const last = keys.length - 1;
    if (last >= 0 && keys[last] === this.key && this.kids[last] === undefined) {
      this.counts[last]! += lines;
      return;
    }
    this.push(lines, undefined);
  }

  addRef(child: Frame): void {
    this.lines += child.lines;
    this.total += child.total;
    this.hasRefs = true;
    while (this.kids.length < this.starts.length) this.kids.push(undefined);
    this.push(child.lines, child);
    this.store.retained.add(child);
  }

  /** Entry indexes in output order, or null when the entries already are in order. */
  order(): Uint32Array | null {
    if (this.sorted) return null;
    const keys = this.keys;
    const count = keys.length;
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i += 1) order[i] = i;
    // Comparing the index last keeps duplicate keys in document order.
    if (count <= 16) {
      for (let i = 1; i < count; i += 1) {
        const index = order[i]!;
        const key = keys[index]!;
        let at = i - 1;
        while (at >= 0 && keys[order[at]!]! > key) {
          order[at + 1] = order[at]!;
          at -= 1;
        }
        order[at + 1] = index;
      }
      return order;
    }
    return order.sort((a, b) => (keys[a]! < keys[b]! ? -1 : keys[a]! > keys[b]! ? 1 : a - b));
  }

  /** Where the arena bytes of entry `index` end. A reference has none, so it ends where it starts. */
  rangeEnd(index: number): number {
    return index + 1 < this.starts.length ? this.starts[index + 1]! : this.arena.length;
  }

  /** Calls `write(buf, start, end, lines)` for the arena ranges of a plain frame in key order. */
  forEachRange(write: (buf: Buffer, start: number, end: number, lines: number) => boolean | void): void {
    const buf = this.arena.buf;
    const order = this.order();
    if (order === null) {
      write(buf, 0, this.arena.used, this.lines);
      return;
    }
    for (let i = 0; i < order.length; i += 1) {
      const index = order[i]!;
      if (write(buf, this.starts[index]!, this.rangeEnd(index), this.counts[index]!) === false) return;
    }
  }

  release(): void {
    this.store.retained.delete(this);
    this.arena.release();
    this.starts.length = 0;
    this.counts.length = 0;
    this.kids.length = 0;
    this.keys.length = 0;
  }

  private push(lines: number, kid: Frame | undefined): void {
    const keys = this.keys;
    if (this.sorted && keys.length > 0 && keys[keys.length - 1]! > this.key) this.sorted = false;
    keys.push(this.key);
    this.starts.push(this.arena.length);
    this.counts.push(lines);
    if (kid !== undefined) this.kids.push(kid);
  }
}

interface Cursor {
  frame: Frame;
  order: Uint32Array | null;
  next: number;
  count: number;
}

/**
 * The lines of a closed frame in output order: its entries sorted by key (its own line is the first entry), with
 * referenced children read in place. Each frame is released as soon as it has been read. The walk uses an explicit
 * stack, so nesting depth does not matter.
 */
function* walk(root: Frame): Generator<Chunk, void, undefined> {
  const stack: Cursor[] = [];
  const enter = (frame: Frame): void => {
    stack.push({ frame, order: frame.order(), next: 0, count: frame.starts.length });
  };

  enter(root);
  while (stack.length > 0) {
    const cursor = stack[stack.length - 1]!;
    const frame = cursor.frame;
    if (cursor.next >= cursor.count) {
      stack.pop();
      frame.release();
      continue;
    }
    const index = cursor.order === null ? cursor.next : cursor.order[cursor.next]!;
    cursor.next += 1;
    const kid = frame.kids[index];
    if (kid !== undefined) {
      enter(kid);
      continue;
    }
    // Neighbouring ranges are contiguous in the arena when read in document order, so read them as one.
    let lines = frame.counts[index]!;
    let last = index;
    if (cursor.order === null) {
      while (cursor.next < cursor.count && frame.kids[cursor.next] === undefined) {
        lines += frame.counts[cursor.next]!;
        last = cursor.next;
        cursor.next += 1;
      }
    }
    yield* frame.arena.read(frame.starts[index]!, frame.rangeEnd(last), lines);
  }
}

/** Collects the lines the flattener produces so the sorter can route them. Applies the search filter. */
class LineCollector implements LineSink {
  buf = Buffer.allocUnsafe(1 << 16);
  pos = 0;

  constructor(
    private readonly accepts: (buf: Buffer, start: number, end: number) => boolean,
    private readonly deliver: (buf: Buffer, start: number, end: number) => void,
  ) {}

  reserve(n: number): void {
    if (this.pos + n > this.buf.length) {
      const grown = Buffer.allocUnsafe(Math.max(this.pos + n, this.buf.length * 2));
      this.buf.copy(grown, 0, 0, this.pos);
      this.buf = grown;
    }
  }

  lineDone(start: number): void {
    if (this.accepts(this.buf, start, this.pos)) {
      this.buf[this.pos++] = NEWLINE;
      this.deliver(this.buf, start, this.pos);
    }
    this.pos = start;
  }
}

/**
 * Wraps the flattener so object keys come out sorted (UTF-16 code unit order, like JS `sort()`), arrays keep their order,
 * and duplicate keys keep their document order. Nothing is parsed into JS values: each object's lines (its own line
 * first) are kept as bytes, next to a key and two offsets per member. Small members are copied into their parent's
 * buffer; big ones stay where they are and the parent points at them, so nothing is copied twice. An array inside an
 * object has no buffer of its own: its lines are members of the object under the array's key. When the document ends,
 * one walk reads the tree in key order and writes the lines out.
 *
 * Arrays that sit directly under the root or under other such arrays are written to the output as they go, so a
 * top-level array of records needs only one record at a time. Everything under an object waits for the document (or
 * the enclosing array element) to end. When more than `memoryLimit` bytes are held, buffers move to an anonymous temp
 * file, closed ones first. What stays in memory per member is a key string and a few numbers, however big the member is.
 *
 * Lines are filtered (search, `-v`) before they are kept, so a search only keeps what it prints. The output's line
 * limit applies to the sorted order, so a limit cannot end the read early while an object is still open.
 */
export class SortingSink implements JsonSink, JsonGate {
  private readonly store: Store;
  private readonly flattener: JsonSink;
  private readonly stack: Frame[] = [];
  /** One flag per open container, innermost last: whether it has a frame on `stack`. */
  private readonly framed: boolean[] = [];
  private readonly queue: Frame[] = [];
  private opening: Frame | null = null;

  constructor(
    private readonly out: GronOutput,
    makeFlattener: (lines: LineSink) => JsonSink,
    options: SortOptions = {},
  ) {
    this.store = new Store(options.memoryLimit ?? defaultMemoryLimit());
    this.flattener = makeFlattener(
      new LineCollector(
        (buf, start, end) => out.accepts(buf, start, end),
        (buf, start, end) => this.line(buf, start, end),
      ),
    );
  }

  /** True while the output pushes back or sorted blocks wait to be written: the tokenizer pauses and `settle` runs. */
  get blocked(): boolean {
    return this.queue.length > 0 || this.out.blocked;
  }

  startObject(): void {
    this.open(false);
  }

  startArray(): void {
    this.open(true);
  }

  endObject(): void {
    this.flattener.endObject();
    this.close();
  }

  endArray(): void {
    this.flattener.endArray();
    this.close();
  }

  key(buf: Buffer, start: number, end: number, escaped: boolean): void {
    const frame = this.stack[this.stack.length - 1]!;
    frame.key = escaped ? (JSON.parse(buf.toString("utf8", start, end)) as string) : buf.toString("utf8", start + 1, end - 1);
    this.flattener.key(buf, start, end, escaped);
  }

  string(buf: Buffer, start: number, end: number, escaped: boolean): void {
    this.flattener.string(buf, start, end, escaped);
  }

  number(buf: Buffer, start: number, end: number): void {
    this.flattener.number(buf, start, end);
  }

  literal(buf: Buffer, start: number, end: number): void {
    this.flattener.literal(buf, start, end);
  }

  /** Writes the blocks that were too big to write inside a tokenizer event, waiting out output backpressure. */
  async settle(): Promise<void> {
    const out = this.out;
    while (this.queue.length > 0) {
      const frame = this.queue[0]!;
      if (!out.stopped) {
        for (const chunk of walk(frame)) {
          out.appendLines(chunk.buf, chunk.start, chunk.end, chunk.lines);
          if (out.stopped) break;
          if (out.blocked) await out.drain();
        }
      }
      this.queue.shift();
      frame.release();
    }
  }

  /** Drops everything that is buffered and deletes the temp file. Safe to call more than once. */
  dispose(): void {
    for (const frame of this.stack) frame.release();
    for (const frame of [...this.store.retained]) frame.release();
    this.stack.length = 0;
    this.queue.length = 0;
    this.store.close();
  }

  private open(array: boolean): void {
    const parent = this.stack[this.stack.length - 1];
    // An array inside an object keeps its order, so it needs no frame: its lines are entries of the nearest frame, all
    // under the key the array has there, and equal keys keep document order.
    const framed = !array || parent === undefined || parent.streaming;
    this.framed.push(framed);
    if (framed) {
      const frame = new Frame(array, this.store);
      this.opening = frame;
      this.startFlattener(array);
      this.opening = null;
      this.stack.push(frame);
    } else {
      this.startFlattener(array);
    }
  }

  private startFlattener(array: boolean): void {
    if (array) this.flattener.startArray();
    else this.flattener.startObject();
  }

  private close(): void {
    if (!this.framed.pop()) return;
    const frame = this.stack.pop()!;
    if (frame.streaming) return;
    if (frame.lines === 0) {
      frame.release();
      return;
    }
    const parent = this.stack[this.stack.length - 1];
    if (parent === undefined || parent.streaming) {
      this.emitFrame(frame);
      return;
    }
    if (frame.total > INLINE_LIMIT || !frame.plain) {
      // Too big to copy again: the parent reads it in place when its own turn comes.
      parent.addRef(frame);
      return;
    }
    parent.addRange(frame.lines, frame.total);
    frame.forEachRange((buf, start, end) => parent.arena.append(buf, start, end));
    frame.release();
    this.spillIfNeeded();
  }

  /** Receives each line that passed the filter, newline included. */
  private line(buf: Buffer, start: number, end: number): void {
    const opening = this.opening;
    if (opening !== null) {
      if (opening.streaming) {
        this.emitLine(buf, start, end);
      } else {
        // The container's own line is its first entry, so it is counted and spilled like the rest.
        opening.addRange(1, end - start);
        opening.arena.append(buf, start, end);
        this.spillIfNeeded();
      }
      return;
    }
    const parent = this.stack[this.stack.length - 1];
    if (parent === undefined || parent.streaming) {
      this.emitLine(buf, start, end);
      return;
    }
    parent.addRange(1, end - start);
    parent.arena.append(buf, start, end);
    this.spillIfNeeded();
  }

  /** A line for the output, behind any block that is still waiting to be written. */
  private emitLine(buf: Buffer, start: number, end: number): void {
    if (this.queue.length === 0) {
      this.out.appendLines(buf, start, end, 1);
      return;
    }
    const frame = new Frame(false, this.store);
    frame.addRange(1, end - start);
    frame.arena.append(buf, start, end);
    this.queue.push(frame);
  }

  private emitFrame(frame: Frame): void {
    if (this.queue.length > 0 || frame.total > SYNC_EMIT_LIMIT) {
      this.store.retained.add(frame);
      this.queue.push(frame);
      return;
    }
    const out = this.out;
    if (frame.plain) {
      frame.forEachRange((buf, start, end, lines) => {
        out.appendLines(buf, start, end, lines);
        return !out.stopped;
      });
    } else {
      for (const chunk of walk(frame)) {
        out.appendLines(chunk.buf, chunk.start, chunk.end, chunk.lines);
        if (out.stopped) break;
      }
    }
    frame.release();
  }

  private spillIfNeeded(): void {
    const store = this.store;
    if (store.resident <= store.limit) return;
    // Closed frames first: they no longer grow, so what moves to disk stays there. Then the open ones, outermost first.
    const holders = [...store.retained, ...this.stack];
    for (const minimum of [MIN_SPILL, 1]) {
      for (const frame of holders) {
        if (frame.arena.used >= minimum) frame.arena.spill();
        if (store.resident <= store.limit / 2) return;
      }
    }
  }
}
