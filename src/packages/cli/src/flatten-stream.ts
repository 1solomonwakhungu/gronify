import { Readable } from "node:stream";
import type { GronOutput } from "./output.js";
import { SortingSink } from "./sort.js";
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

function isIdentifier(buf: Buffer, start: number, end: number): boolean {
  if (end <= start || (IDENTIFIER_BYTE[buf[start]!]! & 1) === 0) return false;
  for (let i = start + 1; i < end; i += 1) {
    if ((IDENTIFIER_BYTE[buf[i]!]! & 2) === 0) return false;
  }
  return true;
}

/** Copies `src[start, end)` to `dst` at `at`. Short copies skip the native call. */
function copyBytes(src: Uint8Array, start: number, end: number, dst: Buffer, at: number): number {
  const length = end - start;
  if (length > 48) {
    dst.set(src.subarray(start, end), at);
  } else {
    for (let i = 0; i < length; i += 1) dst[at + i] = src[start + i]!;
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
  private indexes = new Float64Array(256);
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
      if (isIdentifier(buf, start + 1, end - 1)) {
        this.ensurePath(base + end - start);
        this.path[base] = DOT;
        this.pathLength = copyBytes(buf, start + 1, end - 1, this.path, base + 1);
      } else {
        // Without escapes the raw bytes are exactly what JSON.stringify would produce for the decoded key.
        this.ensurePath(base + end - start + 2);
        this.path[base] = OPEN_BRACKET;
        const next = copyBytes(buf, start, end, this.path, base + 1);
        this.path[next] = CLOSE_BRACKET;
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

  /** Extends the path for array elements. Object members were already extended by `key`. */
  private beginValue(): void {
    const top = this.top;
    if (top < 0 || this.kinds[top] !== ARRAY) return;
    const index = this.indexes[top]!;
    this.indexes[top] = index + 1;
    const base = this.bases[top]!;
    this.ensurePath(base + 24);
    const path = this.path;
    path[base] = OPEN_BRACKET;
    let digits = 1;
    for (let rest = Math.floor(index / 10); rest > 0; rest = Math.floor(rest / 10)) digits += 1;
    let remaining = index;
    for (let at = base + digits; at > base; at -= 1) {
      const quotient = Math.floor(remaining / 10);
      path[at] = ZERO + (remaining - quotient * 10);
      remaining = quotient;
    }
    path[base + digits + 1] = CLOSE_BRACKET;
    this.pathLength = base + digits + 2;
  }

  private endValue(): void {
    this.pathLength = this.top < 0 ? ROOT.length : this.bases[this.top]!;
  }

  private push(kind: number): void {
    const depth = this.top + 1;
    if (depth === this.kinds.length) this.grow();
    this.kinds[depth] = kind;
    this.bases[depth] = this.pathLength;
    this.indexes[depth] = 0;
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
    const indexes = new Float64Array(size);
    indexes.set(this.indexes);
    this.kinds = kinds;
    this.bases = bases;
    this.indexes = indexes;
  }

  private ensurePath(needed: number): void {
    if (needed <= this.path.length) return;
    const grown = Buffer.allocUnsafe(Math.max(needed, this.path.length * 2));
    this.path.copy(grown, 0, 0, this.pathLength);
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
    out.pos = copyBytes(value, start, end, buf, copyBytes(EQUALS, 0, EQUALS.length, buf, at));
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
  const sorter = options.sort ? new SortingSink(out, (lines) => new GronFlattener(lines), { memoryLimit: options.sortMemory }) : null;
  try {
    const gate: JsonGate = sorter ?? out;
    const tokenizer = new JsonTokenizer(sorter ?? new GronFlattener(out), gate);
    reading: for await (const piece of input) {
      const chunk = typeof piece === "string" ? Buffer.from(piece, "utf8") : piece;
      let pos = 0;
      do {
        pos = tokenizer.write(chunk, pos);
        if (sorter !== null) await sorter.settle();
        if (out.stopped) break reading;
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
    }
  } catch (error) {
    await out.finish(false).catch(() => undefined);
    throw error;
  } finally {
    sorter?.dispose();
  }
  await out.finish(true);
}
