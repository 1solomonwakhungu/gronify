import type { LineSink } from "./lines.js";
import type { OutputBuffer } from "./output.js";
import { LineParser, VALUE_EMPTY_ARRAY, VALUE_EMPTY_OBJECT, VALUE_INLINE, lineError } from "./parse.js";
import { TreeSerializer } from "./tree.js";
import { JsonWriter } from "./writer.js";

/**
 * The input needs a container that the streaming pass has already closed, an
 * array index that does not increase, or a synthesized parent that could
 * duplicate a key written earlier. The tree builder accepts such input.
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
 *
 * Parents that were never assigned (gron filtered with `grep` or `search`) are
 * synthesized as the path opens them: a property segment implies an object,
 * an index an array. A synthesized container must not be a second copy of one
 * written earlier, since the two would not merge. For arrays the ascending
 * index already rules that out. For objects, the emitter records the member
 * keys of every object it synthesized, or synthesized into while it was still
 * empty, and treats a repeated key as out of order. Explicitly assigned
 * objects that already have members are not tracked, so unfiltered gron costs
 * nothing extra, and a missing parent inside one goes to the in-memory builder.
 */
export class StreamEmitter implements LineSink {
  rootSeen = false;

  private readonly writer: JsonWriter;
  private readonly parser: LineParser;
  private readonly out: OutputBuffer;
  // Entry key of the container at each depth (index 0, the root, has none).
  private frameIsIndex = new Uint8Array(64);
  private frameIndex = new Float64Array(64);
  private frameOffset = new Int32Array(64);
  private frameLength = new Int32Array(64);
  private keys = new Uint8Array(1024);
  /** Parent segments of the last line this emitter accepted, all of which matched open containers. */
  private verifiedParents = 0;
  /** Member keys of the open object at each depth, for objects whose every member is known (see the class comment). */
  private readonly tracked: Array<Set<string> | undefined> = [];
  /** Set once anything is tracked; until then `tracked` is empty and never consulted. */
  private tracking = false;
  /** The path segment being placed when a line pauses, and that line's number for errors. */
  private step = 0;
  private lineNumber = 0;

  constructor(parser: LineParser, out: OutputBuffer, pretty: boolean) {
    this.parser = parser;
    this.out = out;
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
    const parent = segments - 1;
    let matched: number;
    if (this.rootSeen) {
      // A scalar root has no members; the in-memory builder reports the conflict.
      if (writer.depth === 0) throw new OutOfOrderError(lineNumber, "the root is not a container");
      // Parent segments the parser copied from the previous line already matched the open containers then, and
      // those containers are still open: only the rest of the path needs checking.
      const reused = parser.reusedSegments;
      matched = reused < this.verifiedParents ? reused : this.verifiedParents;
      const open = writer.depth - 1;
      const limit = open < parent ? open : parent;
      while (matched < limit && this.matchesFrame(matched)) matched += 1;
    } else {
      // Filtered gron without its `json = ...` line: the first segment says what the root is.
      this.rootSeen = true;
      const array = parser.segIsIndex[0] === 1;
      writer.open(array);
      this.track(0, array);
      matched = 0;
    }
    this.verifiedParents = parent;
    this.lineNumber = lineNumber;

    if (matched < parent) {
      writer.closeTo(matched + 1);
      this.step = matched;
      return this.synthesize();
    }
    writer.closeTo(segments);
    this.step = parent;
    if (!this.placeMember(parent, false)) return false;
    this.finishLine();
    return true;
  }

  /** Continues a line that paused while writing a long run of `null` array slots. */
  resume(): boolean {
    if (!this.writer.fillNulls()) return false;
    const step = this.step;
    if (step === this.parser.segCount - 1) {
      this.finishLine();
      return true;
    }
    this.openSynthesized(step);
    this.step = step + 1;
    return this.synthesize();
  }

  finish(): void {
    if (!this.rootSeen) throw new Error("input contains no gron assignments");
    this.writer.finish();
  }

  /**
   * Places path segments from `step` on, opening a synthesized container for each parent segment, then writes the
   * value. Returns false if it paused while padding an array; `resume` carries on from `step`.
   */
  private synthesize(): boolean {
    const last = this.parser.segCount - 1;
    for (;;) {
      const segment = this.step;
      if (!this.placeMember(segment, segment < last)) return false;
      if (segment === last) {
        this.finishLine();
        return true;
      }
      this.openSynthesized(segment);
      this.step = segment + 1;
    }
  }

  /**
   * Checks that path segment `segment` can be the next member of the innermost open container (at depth `segment`)
   * and writes any `null` slots before it. Returns false when that padding paused. `parent` is set when the segment
   * opens a synthesized container rather than taking the line's value.
   */
  private placeMember(segment: number, parent: boolean): boolean {
    const parser = this.parser;
    const writer = this.writer;
    const isIndex = parser.segIsIndex[segment] === 1;
    if (writer.isArray[segment] === 1) {
      if (!isIndex) {
        throw lineError(this.lineNumber, parent ? "path does not match its parent container" : "array path requires a numeric index");
      }
      const index = parser.segIndex[segment] as number;
      const count = writer.counts[segment] as number;
      if (index < count) {
        throw new OutOfOrderError(
          this.lineNumber,
          `array index ${index} does not follow the previous index (input is not in document order)`
        );
      }
      if (index > count) {
        writer.nullsLeft = index - count;
        return writer.fillNulls();
      }
      return true;
    }
    if (isIndex) {
      throw lineError(this.lineNumber, parent ? "path does not match its parent container" : "property does not match its parent container");
    }
    if (parent) this.claimKey(segment);
    return true;
  }

  /** Records a synthesized member of the object at depth `segment`, whose key must be new to that object. */
  private claimKey(segment: number): void {
    const key = this.parser.keyAsLatin1(segment);
    let keys = this.tracked[segment];
    if (keys === undefined) {
      // An explicitly assigned object, whose members are known only while it has none.
      if ((this.writer.counts[segment] as number) !== 0) {
        throw new OutOfOrderError(
          this.lineNumber,
          "parent path is not the container being written, and its parent already has other members (input is not in document order)"
        );
      }
      keys = new Set();
      this.tracked[segment] = keys;
      this.tracking = true;
    } else if (keys.has(key)) {
      throw new OutOfOrderError(this.lineNumber, "parent path was already written and closed (input is not in document order)");
    }
    keys.add(key);
  }

  /** Writes path segment `segment` as the next member of the innermost container and opens the container it implies. */
  private openSynthesized(segment: number): void {
    const parser = this.parser;
    const writer = this.writer;
    writer.memberPrefix();
    if (writer.isArray[segment] !== 1) {
      writer.key(parser.arena, parser.segOffset[segment] as number, parser.segLength[segment] as number);
    }
    const array = parser.segIsIndex[segment + 1] === 1;
    writer.open(array);
    this.recordFrame(segment + 1, segment);
    this.track(segment + 1, array);
  }

  /** Starts recording the members of a synthesized container at `depth`; arrays need no record. */
  private track(depth: number, array: boolean): void {
    this.tracked[depth] = array ? undefined : new Set();
    this.tracking = true;
  }

  private finishLine(): void {
    const parser = this.parser;
    const writer = this.writer;
    const segments = parser.segCount;
    const last = segments - 1;
    writer.memberPrefix();
    if (writer.isArray[last] !== 1) {
      writer.key(parser.lastKeySource, parser.lastKeyStart, parser.segLength[last] as number);
      if (this.tracking) this.tracked[last]?.add(parser.keyAsLatin1(last));
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
        this.recordFrame(depth, depth - 1);
        if (this.tracking) this.tracked[depth] = undefined;
        break;
      case VALUE_INLINE:
        new TreeSerializer(parser.inline, writer, this.out).run(true);
        break;
      default:
        writer.raw(parser.valueBuf, parser.valueStart, parser.valueEnd);
    }
  }

  /** Remembers that the container just opened at `depth` was entered by path segment `segment`. */
  private recordFrame(depth: number, segment: number): void {
    if (depth === 0) return;
    if (depth >= this.frameIsIndex.length) this.growFrames();
    const parser = this.parser;
    const isIndex = parser.segIsIndex[segment] as number;
    // Keys of open containers are packed back to back, so this one starts where its parent's ends.
    const offset = depth >= 2 ? (this.frameOffset[depth - 1] as number) + (this.frameLength[depth - 1] as number) : 0;
    this.frameIsIndex[depth] = isIndex;
    this.frameOffset[depth] = offset;
    if (isIndex === 1) {
      this.frameIndex[depth] = parser.segIndex[segment] as number;
      this.frameLength[depth] = 0;
      return;
    }
    const length = parser.segLength[segment] as number;
    if (offset + length > this.keys.length) {
      const keys = new Uint8Array(Math.max(this.keys.length * 2, offset + length));
      keys.set(this.keys.subarray(0, offset));
      this.keys = keys;
    }
    const keys = this.keys;
    // The line's last key is borrowed from the input; parent keys live in the parser's arena.
    const borrowed = segment === parser.lastKeySegment;
    const source = borrowed ? parser.lastKeySource : parser.arena;
    const from = borrowed ? parser.lastKeyStart : (parser.segOffset[segment] as number);
    for (let index = 0; index < length; index += 1) keys[offset + index] = source[from + index] as number;
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
