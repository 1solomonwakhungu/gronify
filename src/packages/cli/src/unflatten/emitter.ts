import type { LineSink } from "./lines.js";
import type { OutputBuffer } from "./output.js";
import { LineParser, VALUE_EMPTY_ARRAY, VALUE_EMPTY_OBJECT, VALUE_INLINE, lineError } from "./parse.js";
import { JsonWriter } from "./writer.js";

/**
 * The input needs a container that the streaming pass has already closed (or
 * never opened), or an array index that does not increase. The tree builder
 * accepts such input as long as parents are assigned first.
 */
export class OutOfOrderError extends Error {
  constructor(
    readonly lineNumber: number,
    readonly reason: string
  ) {
    super(`line ${lineNumber}: ${reason}`);
    this.name = "OutOfOrderError";
  }
}

/**
 * Converts document-order gron to JSON in one pass with constant memory.
 *
 * `JsonWriter` holds the open containers. This class keeps the key each open
 * container was entered by, so the next line's parent path can be compared
 * with it: lines that continue the current path stay inside the open
 * containers, and the first mismatch closes the containers below it.
 *
 * Repeated assignments to one object key are written as they come. A JSON
 * parser keeps the last duplicate, which is what the in-memory builder does
 * too; only array indexes must increase, since each one fixes a position.
 */
export class StreamEmitter implements LineSink {
  rootSeen = false;

  private readonly writer: JsonWriter;
  private readonly parser: LineParser;
  private readonly pretty: boolean;
  // Entry key of the container at each depth (index 0, the root, has none).
  private frameIsIndex = new Uint8Array(64);
  private frameIndex = new Float64Array(64);
  private frameOffset = new Int32Array(64);
  private frameLength = new Int32Array(64);
  private keys = new Uint8Array(1024);

  constructor(parser: LineParser, out: OutputBuffer, pretty: boolean) {
    this.parser = parser;
    this.pretty = pretty;
    this.writer = new JsonWriter(out, pretty);
  }

  line(buf: Buffer, start: number, end: number, lineNumber: number): boolean {
    const parser = this.parser;
    if (!parser.parse(buf, start, end, lineNumber)) return true;
    const writer = this.writer;
    const segments = parser.segCount;

    if (segments === 0) {
      if (this.rootSeen) throw new OutOfOrderError(lineNumber, "the root is assigned more than once");
      this.rootSeen = true;
      this.writeValue(0);
      return true;
    }
    if (!this.rootSeen) throw lineError(lineNumber, "root must be assigned before child paths");
    if (writer.depth < segments) {
      throw new OutOfOrderError(lineNumber, "parent path must be assigned before its children");
    }
    for (let segment = 0; segment < segments - 1; segment += 1) {
      if (!this.matchesFrame(segment)) {
        throw new OutOfOrderError(lineNumber, "parent path is not the container being written (input is not in document order)");
      }
    }
    writer.closeTo(segments);

    const parent = segments - 1;
    const isIndex = parser.segIsIndex[parent] === 1;
    if (writer.isArray[parent] === 1) {
      if (!isIndex) throw lineError(lineNumber, "array path requires a numeric index");
      const index = parser.segIndex[parent] as number;
      const count = writer.counts[parent] as number;
      if (index < count) {
        throw new OutOfOrderError(lineNumber, `array index ${index} does not follow the previous index (input is not in document order)`);
      }
      if (index > count) {
        writer.nullsLeft = index - count;
        if (!writer.fillNulls()) return false;
      }
    } else if (isIndex) {
      throw lineError(lineNumber, "property does not match its parent container");
    }
    this.finishLine();
    return true;
  }

  /** Continues a line that paused while writing a long run of `null` array slots. */
  resume(): boolean {
    if (!this.writer.fillNulls()) return false;
    this.finishLine();
    return true;
  }

  finish(): void {
    if (!this.rootSeen) throw new Error("input contains no gron assignments");
    this.writer.finish();
  }

  private finishLine(): void {
    const parser = this.parser;
    const writer = this.writer;
    const segments = parser.segCount;
    const last = segments - 1;
    writer.memberPrefix();
    if (writer.isArray[segments - 1] !== 1) {
      writer.key(parser.arena, parser.segOffset[last] as number, parser.segLength[last] as number);
    }
    this.writeValue(segments);
  }

  /** Writes the current line's value. `depth` is the number of containers open above it. */
  private writeValue(depth: number): void {
    const parser = this.parser;
    const writer = this.writer;
    switch (parser.valueKind) {
      case VALUE_EMPTY_OBJECT:
      case VALUE_EMPTY_ARRAY:
        writer.open(parser.valueKind === VALUE_EMPTY_ARRAY);
        this.recordFrame(depth);
        break;
      case VALUE_INLINE:
        writer.rawIndented(JSON.stringify(parser.inline, null, this.pretty ? 2 : undefined));
        break;
      default:
        writer.raw(parser.valueBuf, parser.valueStart, parser.valueEnd);
    }
  }

  /** Remembers the key the container just opened at `depth` was entered by. */
  private recordFrame(depth: number): void {
    if (depth === 0) return;
    if (depth >= this.frameIsIndex.length) this.growFrames();
    const parser = this.parser;
    const last = parser.segCount - 1;
    const isIndex = parser.segIsIndex[last] as number;
    // Keys of open containers are packed back to back, so this one starts where its parent's ends.
    const offset = depth >= 2 ? (this.frameOffset[depth - 1] as number) + (this.frameLength[depth - 1] as number) : 0;
    this.frameIsIndex[depth] = isIndex;
    this.frameOffset[depth] = offset;
    if (isIndex === 1) {
      this.frameIndex[depth] = parser.segIndex[last] as number;
      this.frameLength[depth] = 0;
      return;
    }
    const length = parser.segLength[last] as number;
    if (offset + length > this.keys.length) {
      const keys = new Uint8Array(Math.max(this.keys.length * 2, offset + length));
      keys.set(this.keys.subarray(0, offset));
      this.keys = keys;
    }
    const keys = this.keys;
    const arena = parser.arena;
    const from = parser.segOffset[last] as number;
    for (let index = 0; index < length; index += 1) keys[offset + index] = arena[from + index] as number;
    this.frameLength[depth] = length;
  }

  /** True when path segment `segment` is the key the open container at depth `segment + 1` was entered by. */
  private matchesFrame(segment: number): boolean {
    const parser = this.parser;
    const frame = segment + 1;
    const isIndex = parser.segIsIndex[segment];
    if (isIndex !== this.frameIsIndex[frame]) return false;
    if (isIndex === 1) return parser.segIndex[segment] === this.frameIndex[frame];
    const length = parser.segLength[segment] as number;
    if (length !== this.frameLength[frame]) return false;
    const arena = parser.arena;
    const keys = this.keys;
    const from = parser.segOffset[segment] as number;
    const to = this.frameOffset[frame] as number;
    for (let index = 0; index < length; index += 1) {
      if (arena[from + index] !== keys[to + index]) return false;
    }
    return true;
  }

  private growFrames(): void {
    const size = this.frameIsIndex.length * 2;
    const isIndex = new Uint8Array(size);
    isIndex.set(this.frameIsIndex);
    const index = new Float64Array(size);
    index.set(this.frameIndex);
    const offset = new Int32Array(size);
    offset.set(this.frameOffset);
    const length = new Int32Array(size);
    length.set(this.frameLength);
    this.frameIsIndex = isIndex;
    this.frameIndex = index;
    this.frameOffset = offset;
    this.frameLength = length;
  }
}
