import { Readable } from "node:stream";
import type { GronOutput } from "./output.js";
import type { SortingSink } from "./sort.js";
import { JsonTokenizer, type JsonGate, type JsonSink } from "./tokenizer.js";

/** Where the flattener writes its lines: reserve room, write bytes at `pos`, then call `lineDone`. */
export interface LineSink {
  buf: Buffer;
  pos: number;
  reserve(n: number): void;
  lineDone(start: number): void;
}

const OBJECT = 0;
const ARRAY = 1;

const DOT = 0x2e;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const ZERO = 0x30;
const ONE = 0x31;
const NINE = 0x39;

const ROOT = Buffer.from("json");
const EQUALS = Buffer.from(" = ");
const EMPTY_OBJECT = Buffer.from("{}");
const EMPTY_ARRAY = Buffer.from("[]");

/** Bit 1: may start an identifier. Bit 2: may continue one. Matches /^[A-Za-z_$][A-Za-z0-9_$]*$/. */
const IDENTIFIER_BYTE = new Uint8Array(256);
for (let byte = 0; byte < 256; byte += 1) {
  const letter = (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || byte === 0x5f || byte === 0x24;
  const digit = byte >= 0x30 && byte <= 0x39;
  IDENTIFIER_BYTE[byte] = (letter ? 1 : 0) | (letter || digit ? 2 : 0);
}

const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Copies `src[start, end)` to `dst` at `at`. Short copies skip the native call. */
function copyBytes(src: Uint8Array, start: number, end: number, dst: Buffer, at: number): number {
  const length = end - start;
  if (length > 48) {
    dst.set(src.subarray(start, end), at);
  } else {
    let i = 0;
    for (; i + 4 <= length; i += 4) {
      dst[at + i] = src[start + i]!;
      dst[at + i + 1] = src[start + i + 1]!;
      dst[at + i + 2] = src[start + i + 2]!;
      dst[at + i + 3] = src[start + i + 3]!;
    }
    for (; i < length; i += 1) dst[at + i] = src[start + i]!;
  }
  return at + length;
}

/**
 * Turns tokenizer events into gron lines. The path of the current value lives in a byte buffer with an explicit
 * stack of container path lengths, so nothing recurses and no per-line strings are built.
 */
export class GronFlattener implements JsonSink {
  private path = Buffer.allocUnsafe(1024);
  private pathLength = ROOT.length;

  private kinds = new Uint8Array(256);
  private bases = new Uint32Array(256);
  /** For an array, where the current element's `[index]` segment ends in `path`; 0 before its first element. */
  private ends = new Uint32Array(256);
  /** Index of the innermost open container, or -1 at the root. */
  private top = -1;

  constructor(private readonly out: LineSink) {
    ROOT.copy(this.path);
  }

  startObject(): void {
    this.beginValue();
    this.writeLine(EMPTY_OBJECT, 0, EMPTY_OBJECT.length);
    this.push(OBJECT);
  }

  startArray(): void {
    this.beginValue();
    this.writeLine(EMPTY_ARRAY, 0, EMPTY_ARRAY.length);
    this.push(ARRAY);
  }

  endObject(): void {
    this.pop();
  }

  endArray(): void {
    this.pop();
  }

  key(buf: Buffer, start: number, end: number, escaped: boolean): void {
    const base = this.bases[this.top]!;
    if (!escaped) {
      // Room for the bracketed form, which is the longer one.
      this.ensurePath(base + end - start + 2);
      const path = this.path;
      // Write `.key` while checking that it matches /^[A-Za-z_$][A-Za-z0-9_$]*$/ (see IDENTIFIER_BYTE).
      const first = start + 1;
      const last = end - 1;
      let identifier = first < last && (IDENTIFIER_BYTE[buf[first]!]! & 1) !== 0 ? 2 : 0;
      path[base] = DOT;
      for (let i = first, at = base + 1; i < last; i += 1, at += 1) {
        const c = buf[i]!;
        path[at] = c;
        identifier &= IDENTIFIER_BYTE[c]!;
      }
      if (identifier !== 0) {
        this.pathLength = base + 1 + (last - first);
      } else {
        // Without escapes the raw bytes are exactly what JSON.stringify would produce for the decoded key.
        path[base] = OPEN_BRACKET;
        const next = copyBytes(buf, start, end, path, base + 1);
        path[next] = CLOSE_BRACKET;
        this.pathLength = next + 1;
      }
      return;
    }
    const decoded = JSON.parse(buf.toString("utf8", start, end)) as string;
    const segment = identifierPattern.test(decoded) ? `.${decoded}` : `[${JSON.stringify(decoded)}]`;
    this.ensurePath(base + Buffer.byteLength(segment));
    this.pathLength = base + this.path.write(segment, base, "utf8");
  }

  string(buf: Buffer, start: number, end: number, escaped: boolean): void {
    this.beginValue();
    if (!escaped) {
      this.writeLine(buf, start, end);
    } else {
      const normalized = Buffer.from(JSON.stringify(JSON.parse(buf.toString("utf8", start, end))), "utf8");
      this.writeLine(normalized, 0, normalized.length);
    }
    this.endValue();
  }

  number(buf: Buffer, start: number, end: number): void {
    this.beginValue();
    this.writeLine(buf, start, end);
    this.endValue();
  }

  literal(buf: Buffer, start: number, end: number): void {
    this.number(buf, start, end);
  }

  /**
   * Extends the path for array elements. Object members were already extended by `key`.
   *
   * The previous element's `[index]` is still in place, since anything nested in it was written after it, so the next
   * index is that one plus one, counted up in its decimal digits.
   */
  private beginValue(): void {
    const top = this.top;
    if (top < 0 || this.kinds[top] !== ARRAY) return;
    const base = this.bases[top]!;
    const end = this.ends[top]!;
    if (end === 0) {
      this.ensurePath(base + 3);
      this.path[base] = OPEN_BRACKET;
      this.path[base + 1] = ZERO;
      this.path[base + 2] = CLOSE_BRACKET;
      this.ends[top] = this.pathLength = base + 3;
      return;
    }
    const path = this.path;
    let at = end - 2;
    while (at > base && path[at] === NINE) {
      path[at] = ZERO;
      at -= 1;
    }
    if (at > base) {
      path[at] = path[at]! + 1;
      this.pathLength = end;
      return;
    }
    // Every digit was a 9 and is now a 0: the index gains a leading 1.
    this.ensurePath(end + 1);
    this.path[base + 1] = ONE;
    this.path[end - 1] = ZERO;
    this.path[end] = CLOSE_BRACKET;
    this.ends[top] = this.pathLength = end + 1;
  }

  private endValue(): void {
    this.pathLength = this.top < 0 ? ROOT.length : this.bases[this.top]!;
  }

  private push(kind: number): void {
    const depth = this.top + 1;
    if (depth === this.kinds.length) this.grow();
    this.kinds[depth] = kind;
    this.bases[depth] = this.pathLength;
    this.ends[depth] = 0;
    this.top = depth;
  }

  private pop(): void {
    this.top -= 1;
    this.endValue();
  }

  private grow(): void {
    const size = this.kinds.length * 2;
    const kinds = new Uint8Array(size);
    kinds.set(this.kinds);
    const bases = new Uint32Array(size);
    bases.set(this.bases);
    const ends = new Uint32Array(size);
    ends.set(this.ends);
    this.kinds = kinds;
    this.bases = bases;
    this.ends = ends;
  }

  private ensurePath(needed: number): void {
    if (needed <= this.path.length) return;
    const grown = Buffer.allocUnsafe(Math.max(needed, this.path.length * 2));
    // Everything, not just `pathLength`: array elements count up from the `[index]` bytes left after it.
    this.path.copy(grown);
    this.path = grown;
  }

  /** Writes `<path> = <value>` as one line. */
  private writeLine(value: Uint8Array, start: number, end: number): void {
    const out = this.out;
    const pathLength = this.pathLength;
    out.reserve(pathLength + (end - start) + EQUALS.length + 1);
    const lineStart = out.pos;
    const buf = out.buf;
    const at = copyBytes(this.path, 0, pathLength, buf, lineStart);
    buf[at] = 0x20;
    buf[at + 1] = 0x3d;
    buf[at + 2] = 0x20;
    out.pos = copyBytes(value, start, end, buf, at + 3);
    out.lineDone(lineStart);
  }
}

export interface FlattenOptions {
  /** Sort object keys at every level (see `SortingSink`). Array order is unchanged. */
  sort?: boolean | undefined;
  /** Bytes of sorted lines to hold in memory before spilling to a temp file. Defaults to 64 MiB. */
  sortMemory?: number | undefined;
}

/**
 * Feeds every chunk of `input` through the tokenizer into `out`, pausing whenever the output pushes back, then
 * commits `out`. On an error the sink is aborted: a file is left as it was, while lines already handed to stdout stay
 * written and only the unflushed tail is dropped.
 *
 * When `out` reaches its line limit the read stops there: the input is destroyed, the rest of it is never read or
 * validated, and what was kept is committed as usual.
 */
export async function flattenStream(
  input: AsyncIterable<Buffer | string>,
  out: GronOutput,
  options: FlattenOptions = {},
): Promise<void> {
  let sorter: SortingSink | null = null;
  try {
    if (options.sort) {
      // Loaded only when sorting, so unsorted runs skip its start-up cost.
      const { SortingSink } = await import("./sort.js");
      sorter = new SortingSink(out, (lines) => new GronFlattener(lines), { memoryLimit: options.sortMemory });
    }
    const gate: JsonGate = sorter ?? out;
    const tokenizer = new JsonTokenizer(sorter ?? new GronFlattener(out), gate);
    reading: for await (const piece of input) {
      const chunk = typeof piece === "string" ? Buffer.from(piece, "utf8") : piece;
      let pos = 0;
      do {
        pos = tokenizer.write(chunk, pos);
        if (sorter !== null) await sorter.settle();
        if (out.stopped) {
          // Sorted output can still be waiting to be written, so only an unsorted run can tell that nothing is left.
          out.exhausted = sorter === null && tokenizer.finishesAt(chunk, pos);
          break reading;
        }
        if (out.blocked) await out.drain();
      } while (pos < chunk.length);
      out.flush();
      if (out.blocked) await out.drain();
    }
    if (out.stopped) {
      if (input instanceof Readable) input.destroy();
    } else {
      tokenizer.end();
      await sorter?.settle();
      // The whole input was read; a limit reached on its very last line leaves nothing unprinted.
      if (out.stopped) out.exhausted = sorter === null;
    }
  } catch (error) {
    await out.finish(false).catch(() => undefined);
    if (input instanceof Readable) input.destroy();
    throw error;
  } finally {
    sorter?.dispose();
  }
  await out.finish(true);
}
