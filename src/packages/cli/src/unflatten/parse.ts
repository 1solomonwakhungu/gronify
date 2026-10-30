import { isUtf8 } from "node:buffer";
import { isJsonSpace, parseCompound } from "./compound.js";
import type { TreeNode } from "./node.js";

/** Value kinds produced by `LineParser`. */
export const VALUE_SCALAR = 0;
export const VALUE_EMPTY_OBJECT = 1;
export const VALUE_EMPTY_ARRAY = 2;
/** A non-empty `{...}` or `[...]` written on one line; `LineParser.inline` holds the parsed value. */
export const VALUE_INLINE = 3;

/** Highest index a JavaScript array can hold. */
const MAX_ARRAY_INDEX = 4294967294;

// ASCII whitespace as `String.prototype.trim` and the regex `\s` see it. Inside values only isJsonSpace applies.
const WHITESPACE = new Uint8Array(256);
for (const code of [0x20, 0x09, 0x0a, 0x0b, 0x0c, 0x0d]) WHITESPACE[code] = 1;

const IDENT_START = new Uint8Array(256);
const IDENT_PART = new Uint8Array(256);
for (let code = 0; code < 128; code += 1) {
  const letter = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f || code === 0x24;
  const digit = code >= 0x30 && code <= 0x39;
  if (letter) IDENT_START[code] = 1;
  if (letter || digit) IDENT_PART[code] = 1;
}

// 0 plain, 1 quote, 2 backslash, 3 control character, 4 non-ASCII
const STRING_CLASS = new Uint8Array(256);
for (let code = 0; code < 0x20; code += 1) STRING_CLASS[code] = 3;
STRING_CLASS[0x22] = 1;
STRING_CLASS[0x5c] = 2;
for (let code = 0x80; code < 0x100; code += 1) STRING_CLASS[code] = 4;

// Escapes that `JSON.stringify` itself writes: \" \\ \b \f \n \r \t
const CANONICAL_ESCAPE = new Uint8Array(256);
for (const char of '"\\bfnrt') CANONICAL_ESCAPE[char.charCodeAt(0)] = 1;

function isWhitespace(code: number | undefined): boolean {
  return code !== undefined && WHITESPACE[code] === 1;
}

/**
 * Length in bytes of the non-ASCII character at `at` that `String.prototype.trim` strips (U+00A0, U+1680,
 * U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF), or 0 if it is none of them.
 */
function wideSpaceLength(buf: Buffer, at: number, end: number): number {
  const first = buf[at];
  if (first === 0xc2) return at + 1 < end && buf[at + 1] === 0xa0 ? 2 : 0;
  if (at + 2 >= end) return 0;
  const second = buf[at + 1] as number;
  const third = buf[at + 2] as number;
  switch (first) {
    case 0xe1:
      return second === 0x9a && third === 0x80 ? 3 : 0;
    case 0xe2:
      if (second === 0x80) return (third >= 0x80 && third <= 0x8a) || third === 0xa8 || third === 0xa9 || third === 0xaf ? 3 : 0;
      return second === 0x81 && third === 0x9f ? 3 : 0;
    case 0xe3:
      return second === 0x80 && third === 0x80 ? 3 : 0;
    case 0xef:
      return second === 0xbb && third === 0xbf ? 3 : 0;
    default:
      return 0;
  }
}

/** First index in `[start, end)` that is not whitespace in the sense of `String.prototype.trim`. */
function trimStart(buf: Buffer, start: number, end: number): number {
  let index = start;
  while (index < end) {
    const code = buf[index] as number;
    if (WHITESPACE[code] === 1) {
      index += 1;
    } else if (code >= 0xc2) {
      const width = wideSpaceLength(buf, index, end);
      if (width === 0) break;
      index += width;
    } else {
      break;
    }
  }
  return index;
}

/** Index just past the last byte of `[start, end)` that is not whitespace in the sense of `String.prototype.trim`. */
function trimEnd(buf: Buffer, start: number, end: number): number {
  let last = end;
  while (last > start) {
    const code = buf[last - 1] as number;
    if (WHITESPACE[code] === 1) {
      last -= 1;
    } else if (code < 0x80) {
      break;
    } else if (last - 3 >= start && wideSpaceLength(buf, last - 3, last) === 3) {
      last -= 3;
    } else if (last - 2 >= start && buf[last - 2] === 0xc2 && code === 0xa0) {
      last -= 2;
    } else {
      break;
    }
  }
  return last;
}

/**
 * True when `buf[start..end)` (quotes included) is a valid JSON string that
 * is already identical to what `JSON.stringify` would write for its value.
 * Anything else (other escapes, invalid UTF-8, stray quotes or control
 * characters) takes the slow path through `JSON.parse`.
 */
function isCanonicalString(buf: Buffer, start: number, end: number): boolean {
  const last = end - 1;
  let high = false;
  for (let index = start + 1; index < last; index += 1) {
    const kind = STRING_CLASS[buf[index] as number] as number;
    if (kind === 0) continue;
    if (kind === 4) {
      high = true;
    } else if (kind === 2) {
      if (index + 1 >= last || CANONICAL_ESCAPE[buf[index + 1] as number] !== 1) return false;
      index += 1;
    } else {
      return false;
    }
  }
  return !high || isUtf8(buf.subarray(start, end));
}

function isNumber(buf: Buffer, start: number, end: number): boolean {
  let index = start;
  if (buf[index] === 0x2d) index += 1;
  if (index >= end) return false;
  const first = buf[index] as number;
  if (first === 0x30) {
    index += 1;
  } else if (first >= 0x31 && first <= 0x39) {
    index += 1;
    while (index < end && (buf[index] as number) >= 0x30 && (buf[index] as number) <= 0x39) index += 1;
  } else {
    return false;
  }
  if (index < end && buf[index] === 0x2e) {
    index += 1;
    const digits = index;
    while (index < end && (buf[index] as number) >= 0x30 && (buf[index] as number) <= 0x39) index += 1;
    if (index === digits) return false;
  }
  if (index < end && (buf[index] === 0x65 || buf[index] === 0x45)) {
    index += 1;
    if (index < end && (buf[index] === 0x2b || buf[index] === 0x2d)) index += 1;
    const digits = index;
    while (index < end && (buf[index] as number) >= 0x30 && (buf[index] as number) <= 0x39) index += 1;
    if (index === digits) return false;
  }
  return index === end;
}

function hasLiteral(buf: Buffer, start: number, end: number, literal: string): boolean {
  if (end - start !== literal.length) return false;
  for (let index = 0; index < literal.length; index += 1) {
    if (buf[start + index] !== literal.charCodeAt(index)) return false;
  }
  return true;
}

export function lineError(lineNumber: number, message: string): Error {
  return new Error(`line ${lineNumber}: ${message}`);
}

/**
 * Parses one gron line into path segments and a value, without building
 * strings on the hot path.
 *
 * Path grammar matches the previous implementation: `json` followed by
 * `.identifier`, `[index]`, or `["quoted key"]` (quoted keys may contain `]`
 * and escaped quotes). Key segments are stored as canonical JSON string
 * content, i.e. the bytes `JSON.stringify(key)` writes between its quotes, so
 * two spellings of one key compare equal.
 *
 * Values are validated and left in place; only strings with non-canonical
 * escapes and one-line compound values are rewritten.
 */
export class LineParser {
  segCount = 0;
  segIsIndex = new Uint8Array(32);
  segOffset = new Int32Array(32);
  segLength = new Int32Array(32);
  segIndex = new Float64Array(32);
  /** Canonical key bytes for the current line's key segments. */
  arena = new Uint8Array(512);

  valueKind = VALUE_SCALAR;
  valueBuf: Buffer = Buffer.alloc(0);
  valueStart = 0;
  valueEnd = 0;
  /** The parsed value when `valueKind` is `VALUE_INLINE`. */
  inline: TreeNode = "";

  private arenaLength = 0;

  /**
   * Returns false for blank lines. Throws `line N: ...` errors for invalid ones.
   */
  parse(buf: Buffer, start: number, end: number, lineNumber: number): boolean {
    const index = trimStart(buf, start, end);
    let last = trimEnd(buf, index, end);
    if (last > index && buf[last - 1] === 0x3b) last = trimEnd(buf, index, last - 1);
    if (index >= last) return false;

    if (last - index < 4 || buf[index] !== 0x6a || buf[index + 1] !== 0x73 || buf[index + 2] !== 0x6f || buf[index + 3] !== 0x6e) {
      throw lineError(lineNumber, "expected a gron assignment");
    }

    this.segCount = 0;
    this.arenaLength = 0;
    let cursor = index + 4;
    while (cursor < last) {
      const code = buf[cursor] as number;
      if (code === 0x2e) {
        cursor = this.parseIdentifier(buf, cursor + 1, last, index, lineNumber);
      } else if (code === 0x5b) {
        cursor = this.parseBracket(buf, cursor, last, index, lineNumber);
      } else if (code === 0x3d) {
        break;
      } else {
        // Whitespace before `=` follows `String.prototype.trim` (like the old `\s*=\s*`), including U+00A0 and friends.
        const after = trimStart(buf, cursor, last);
        if (after === cursor || buf[after] !== 0x3d) this.pathError(buf, index, last, lineNumber, "invalid character in path");
        cursor = after;
        break;
      }
    }
    if (cursor >= last) throw lineError(lineNumber, "expected a gron assignment");

    const valueStart = trimStart(buf, cursor + 1, last);
    if (valueStart >= last) throw lineError(lineNumber, "expected a gron assignment");
    this.parseValue(buf, valueStart, last, lineNumber);
    return true;
  }

  /** Decodes the key segment at `segment` to a JS string (canonical JSON content, as bytes in a latin1 string). */
  keyAsLatin1(segment: number): string {
    const offset = this.segOffset[segment] as number;
    return Buffer.from(this.arena.buffer, this.arena.byteOffset + offset, this.segLength[segment] as number).toString("latin1");
  }

  private parseIdentifier(buf: Buffer, start: number, last: number, lineStart: number, lineNumber: number): number {
    if (start >= last || IDENT_START[buf[start] as number] !== 1) {
      this.pathError(buf, lineStart, last, lineNumber, "invalid property path");
    }
    let end = start + 1;
    while (end < last && IDENT_PART[buf[end] as number] === 1) end += 1;
    this.pushKey(buf, start, end);
    return end;
  }

  private parseBracket(buf: Buffer, open: number, last: number, lineStart: number, lineNumber: number): number {
    let close = -1;
    let inString = false;
    let escaped = false;
    for (let index = open + 1; index < last; index += 1) {
      const code = buf[index];
      if (escaped) {
        escaped = false;
      } else if (code === 0x5c && inString) {
        escaped = true;
      } else if (code === 0x22) {
        inString = !inString;
      } else if (code === 0x5d && !inString) {
        close = index;
        break;
      }
    }
    if (close === -1) this.pathError(buf, lineStart, last, lineNumber, "unclosed bracket property");

    let start = open + 1;
    let end = close;
    while (start < end && isWhitespace(buf[start])) start += 1;
    while (end > start && isWhitespace(buf[end - 1])) end -= 1;

    if (this.pushIndex(buf, start, end, lineNumber)) return close + 1;

    if (buf[start] === 0x22 && end - start >= 2 && buf[end - 1] === 0x22 && isCanonicalString(buf, start, end)) {
      this.pushKey(buf, start + 1, end - 1);
      return close + 1;
    }

    let key: unknown;
    try {
      key = JSON.parse(buf.toString("utf8", start, end));
    } catch {
      this.pathError(buf, lineStart, last, lineNumber, "invalid bracket property");
    }
    if (typeof key !== "string") {
      this.pathError(buf, lineStart, last, lineNumber, "bracket properties must be strings or indexes");
    }
    const canonical = Buffer.from(JSON.stringify(key), "utf8");
    this.pushKey(canonical, 1, canonical.length - 1);
    return close + 1;
  }

  /** Records `[n]` when the token is a plain decimal index. */
  private pushIndex(buf: Buffer, start: number, end: number, lineNumber: number): boolean {
    if (start >= end) return false;
    const first = buf[start] as number;
    if (first < 0x30 || first > 0x39 || (first === 0x30 && end - start > 1)) return false;
    let value = 0;
    for (let index = start; index < end; index += 1) {
      const digit = (buf[index] as number) - 0x30;
      if (digit < 0 || digit > 9) return false;
      value = value * 10 + digit;
    }
    if (value > MAX_ARRAY_INDEX) throw lineError(lineNumber, "array index is too large");
    const segment = this.nextSegment();
    this.segIsIndex[segment] = 1;
    this.segIndex[segment] = value;
    this.segLength[segment] = 0;
    this.segOffset[segment] = this.arenaLength;
    return true;
  }

  private pushKey(source: Uint8Array, start: number, end: number): void {
    const length = end - start;
    const segment = this.nextSegment();
    if (this.arenaLength + length > this.arena.length) {
      const arena = new Uint8Array(Math.max(this.arena.length * 2, this.arenaLength + length));
      arena.set(this.arena.subarray(0, this.arenaLength));
      this.arena = arena;
    }
    const arena = this.arena;
    let offset = this.arenaLength;
    this.segIsIndex[segment] = 0;
    this.segOffset[segment] = offset;
    this.segLength[segment] = length;
    for (let index = start; index < end; index += 1) arena[offset++] = source[index] as number;
    this.arenaLength = offset;
  }

  private nextSegment(): number {
    const segment = this.segCount;
    if (segment === this.segOffset.length) {
      const size = segment * 2;
      const isIndex = new Uint8Array(size);
      isIndex.set(this.segIsIndex);
      const offset = new Int32Array(size);
      offset.set(this.segOffset);
      const length = new Int32Array(size);
      length.set(this.segLength);
      const index = new Float64Array(size);
      index.set(this.segIndex);
      this.segIsIndex = isIndex;
      this.segOffset = offset;
      this.segLength = length;
      this.segIndex = index;
    }
    this.segCount = segment + 1;
    return segment;
  }

  /**
   * Path errors keep the old precedence: a line with no `=` followed by a
   * value is "expected a gron assignment" whatever its path looks like.
   */
  private pathError(buf: Buffer, start: number, end: number, lineNumber: number, message: string): never {
    if (!/^json.*?\s*=\s*.+$/.test(buf.toString("utf8", start, end))) {
      throw lineError(lineNumber, "expected a gron assignment");
    }
    throw lineError(lineNumber, message);
  }

  private parseValue(buf: Buffer, start: number, end: number, lineNumber: number): void {
    const first = buf[start] as number;
    this.valueKind = VALUE_SCALAR;
    this.valueBuf = buf;
    this.valueStart = start;
    this.valueEnd = end;

    if (first === 0x22) {
      if (end - start >= 2 && buf[end - 1] === 0x22) {
        if (isCanonicalString(buf, start, end)) return;
        let value: unknown;
        try {
          value = JSON.parse(buf.toString("utf8", start, end));
        } catch {
          throw lineError(lineNumber, "invalid JSON value");
        }
        if (typeof value === "string") {
          const normalized = Buffer.from(JSON.stringify(value), "utf8");
          this.valueBuf = normalized;
          this.valueStart = 0;
          this.valueEnd = normalized.length;
          return;
        }
      }
    } else if (first === 0x2d || (first >= 0x30 && first <= 0x39)) {
      if (isNumber(buf, start, end)) return;
    } else if (first === 0x74) {
      if (hasLiteral(buf, start, end, "true")) return;
    } else if (first === 0x66) {
      if (hasLiteral(buf, start, end, "false")) return;
    } else if (first === 0x6e) {
      if (hasLiteral(buf, start, end, "null")) return;
    } else if (first === 0x7b || first === 0x5b) {
      let inner = start + 1;
      while (inner < end && isJsonSpace(buf[inner] as number)) inner += 1;
      if (inner === end - 1 && buf[inner] === (first === 0x7b ? 0x7d : 0x5d)) {
        this.valueKind = first === 0x7b ? VALUE_EMPTY_OBJECT : VALUE_EMPTY_ARRAY;
        return;
      }
      const inline = parseCompound(buf.toString("utf8", start, end));
      if (inline !== undefined) {
        this.inline = inline;
        this.valueKind = VALUE_INLINE;
        return;
      }
    }
    throw lineError(lineNumber, "invalid JSON value");
  }
}
