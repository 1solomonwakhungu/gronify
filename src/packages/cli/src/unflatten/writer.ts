import type { OutputBuffer } from "./output.js";

const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const QUOTE = 0x22;
const COMMA = 0x2c;
const COLON = 0x3a;
const SPACE = 0x20;
const NEWLINE = 0x0a;

/**
 * Writes JSON tokens for a stack of open containers. The output matches
 * `JSON.stringify(value)` or, with `pretty`, `JSON.stringify(value, null, 2)`,
 * including `{}` and `[]` for empty containers.
 */
export class JsonWriter {
  /** Number of open containers. Members of the innermost one sit at indent level `depth`. */
  depth = 0;
  /** 1 when the container at that depth is an array. */
  isArray = new Uint8Array(64);
  /** Members (array slots) written so far in the container at that depth. */
  counts = new Float64Array(64);
  nullsLeft = 0;

  constructor(
    private readonly out: OutputBuffer,
    private readonly pretty: boolean
  ) {}

  open(array: boolean): void {
    const out = this.out;
    out.reserve(1);
    out.buf[out.pos++] = array ? OPEN_BRACKET : OPEN_BRACE;
    if (this.depth === this.isArray.length) this.grow();
    this.isArray[this.depth] = array ? 1 : 0;
    this.counts[this.depth] = 0;
    this.depth += 1;
  }

  closeTo(target: number): void {
    while (this.depth > target) this.close();
  }

  close(): void {
    this.depth -= 1;
    const depth = this.depth;
    const out = this.out;
    out.reserve(2 * depth + 3);
    if (this.pretty && (this.counts[depth] as number) > 0) this.newline(depth);
    out.buf[out.pos++] = this.isArray[depth] ? CLOSE_BRACKET : CLOSE_BRACE;
  }

  /** Writes the separator and indentation that precede the next member of the innermost container. */
  memberPrefix(): void {
    const top = this.depth - 1;
    const count = this.counts[top] as number;
    const out = this.out;
    out.reserve(2 * this.depth + 3);
    if (count > 0) out.buf[out.pos++] = COMMA;
    if (this.pretty) this.newline(this.depth);
    this.counts[top] = count + 1;
  }

  /** Writes `"key":` for an object member; `key` holds already-escaped JSON string content. */
  key(source: Uint8Array, offset: number, length: number): void {
    const out = this.out;
    out.reserve(length + 4);
    const buf = out.buf;
    let pos = out.pos;
    buf[pos++] = QUOTE;
    for (let index = 0; index < length; index += 1) buf[pos++] = source[offset + index] as number;
    buf[pos++] = QUOTE;
    buf[pos++] = COLON;
    if (this.pretty) buf[pos++] = SPACE;
    out.pos = pos;
  }

  keyLatin1(key: string): void {
    const out = this.out;
    out.reserve(key.length + 4);
    out.buf[out.pos++] = QUOTE;
    out.pos += out.buf.write(key, out.pos, "latin1");
    out.buf[out.pos++] = QUOTE;
    out.buf[out.pos++] = COLON;
    if (this.pretty) out.buf[out.pos++] = SPACE;
  }

  raw(source: Uint8Array, start: number, end: number): void {
    const length = end - start;
    const out = this.out;
    out.reserve(length);
    if (length > 32) {
      (source as Buffer).copy(out.buf, out.pos, start, end);
      out.pos += length;
      return;
    }
    const buf = out.buf;
    let pos = out.pos;
    for (let index = start; index < end; index += 1) buf[pos++] = source[index] as number;
    out.pos = pos;
  }

  rawLatin1(text: string): void {
    const out = this.out;
    out.reserve(text.length);
    out.pos += out.buf.write(text, out.pos, "latin1");
  }

  /** Writes pending `null` array slots. Returns false when output backed up and the caller must flush first. */
  fillNulls(): boolean {
    const out = this.out;
    while (this.nullsLeft > 0) {
      if (out.saturated) return false;
      this.memberPrefix();
      out.reserve(4);
      const buf = out.buf;
      let pos = out.pos;
      buf[pos++] = 0x6e;
      buf[pos++] = 0x75;
      buf[pos++] = 0x6c;
      buf[pos++] = 0x6c;
      out.pos = pos;
      this.nullsLeft -= 1;
    }
    return true;
  }

  /** Closes every open container and ends the document with a newline. */
  finish(): void {
    this.closeTo(0);
    this.out.reserve(1);
    this.out.buf[this.out.pos++] = NEWLINE;
  }

  private newline(level: number): void {
    const out = this.out;
    const buf = out.buf;
    let pos = out.pos;
    buf[pos++] = NEWLINE;
    for (let index = 0; index < level; index += 1) {
      buf[pos++] = SPACE;
      buf[pos++] = SPACE;
    }
    out.pos = pos;
  }

  private grow(): void {
    const size = this.isArray.length * 2;
    const isArray = new Uint8Array(size);
    isArray.set(this.isArray);
    const counts = new Float64Array(size);
    counts.set(this.counts);
    this.isArray = isArray;
    this.counts = counts;
  }
}
