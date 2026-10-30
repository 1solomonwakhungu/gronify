import { isUtf8 } from "node:buffer";

/**
 * Receives structural events and raw token bytes. `start`/`end` index into `buf`; string and key ranges include the
 * surrounding quotes and are only valid for the duration of the call.
 */
export interface JsonSink {
  startObject(): void;
  endObject(): void;
  startArray(): void;
  endArray(): void;
  /** `escaped` is true when the raw bytes contain a backslash escape. */
  key(buf: Buffer, start: number, end: number, escaped: boolean): void;
  string(buf: Buffer, start: number, end: number, escaped: boolean): void;
  number(buf: Buffer, start: number, end: number): void;
  /** `true`, `false` or `null`. */
  literal(buf: Buffer, start: number, end: number): void;
}

/** Lets the sink ask the tokenizer to stop between tokens (for example while waiting on output backpressure). */
export interface JsonGate {
  blocked: boolean;
}

export class JsonSyntaxError extends SyntaxError {
  readonly offset: number;
  readonly line: number;
  readonly column: number;

  constructor(detail: string, offset: number, line: number, column: number) {
    super(`${detail} at byte offset ${offset} (line ${line}, column ${column})`);
    this.name = "JsonSyntaxError";
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}

const OBJECT = 0;
const ARRAY = 1;

// Grammar states. The last three are mid-token states that survive chunk boundaries.
const TOP_VALUE = 0;
const DONE = 1;
const ARRAY_FIRST = 2;
const ARRAY_VALUE = 3;
const ARRAY_NEXT = 4;
const OBJECT_FIRST = 5;
const OBJECT_KEY = 6;
const OBJECT_COLON = 7;
const OBJECT_VALUE = 8;
const OBJECT_NEXT = 9;
const IN_STRING = 10;
const IN_KEY = 11;
const IN_BARE = 12;

const NUMBER = 0;
const LITERAL = 1;

// String escape sub-states.
const ESC_NONE = 0;
const ESC_BACKSLASH = 1;
const ESC_HEX = 2;

const MAX_LITERAL_LENGTH = 5;
const MAX_TOKEN_PREVIEW = 40;

const EMPTY = Buffer.alloc(0);

/** 1 for bytes that may appear in a number token. */
const NUMBER_BYTE = new Uint8Array(256);
for (const character of "0123456789+-.eE") NUMBER_BYTE[character.charCodeAt(0)] = 1;

/** 1 for bytes that are valid after a backslash (other than `u`). */
const SIMPLE_ESCAPE = new Uint8Array(256);
for (const character of '"\\/bfnrt') SIMPLE_ESCAPE[character.charCodeAt(0)] = 1;

function isHexDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

function digitAt(buf: Buffer, index: number, end: number): boolean {
  return index < end && buf[index]! >= 0x30 && buf[index]! <= 0x39;
}

/** Checks `-? (0 | [1-9][0-9]*) (. [0-9]+)? ([eE] [+-]? [0-9]+)?` over `buf[start, end)`. */
function isValidNumber(buf: Buffer, start: number, end: number): boolean {
  let i = start;
  if (buf[i] === 0x2d) i += 1;
  if (i < end && buf[i] === 0x30) {
    i += 1;
  } else if (digitAt(buf, i, end)) {
    while (digitAt(buf, i, end)) i += 1;
  } else {
    return false;
  }
  if (i < end && buf[i] === 0x2e) {
    i += 1;
    if (!digitAt(buf, i, end)) return false;
    while (digitAt(buf, i, end)) i += 1;
  }
  if (i < end && (buf[i] === 0x65 || buf[i] === 0x45)) {
    i += 1;
    if (i < end && (buf[i] === 0x2b || buf[i] === 0x2d)) i += 1;
    if (!digitAt(buf, i, end)) return false;
    while (digitAt(buf, i, end)) i += 1;
  }
  return i === end;
}

function describeByte(c: number): string {
  if (c >= 0x20 && c < 0x7f) return `'${String.fromCharCode(c)}'`;
  return `byte 0x${c.toString(16).padStart(2, "0")}`;
}

/**
 * Incremental, strict (RFC 8259) JSON tokenizer over raw bytes. Feed it chunks with `write` and finish with `end`.
 * Nothing is buffered except the bytes of a scalar token that straddles a chunk boundary, and a stack with one byte
 * per open container, so memory does not depend on document size or nesting depth.
 */
export class JsonTokenizer {
  private state = TOP_VALUE;
  private containers = new Uint8Array(256);
  private depth = 0;

  // Position tracking: offsets are absolute byte offsets, lines only advance on whitespace newlines.
  private consumed = 0;
  private chunkBase = 0;
  private line = 1;
  private lineStart = 0;

  // Token in progress.
  private tokenOffset = 0;
  private pending: Buffer[] = [];
  private pendingLength = 0;
  private escapeState = ESC_NONE;
  private hexLeft = 0;
  private escaped = false;
  private highBits = 0;
  private bareKind = NUMBER;

  constructor(
    private readonly sink: JsonSink,
    private readonly gate: JsonGate = { blocked: false },
  ) {}

  /**
   * Consumes `buf` from `start`. Returns the index it stopped at, which is `buf.length` unless the gate blocked.
   * Pass the same buffer again with the returned index to continue.
   */
  write(buf: Buffer, start = 0): number {
    const len = buf.length;
    if (start === 0) {
      this.chunkBase = this.consumed;
      this.consumed += len;
    }
    const gate = this.gate;
    let pos = start;

    while (pos < len) {
      const state = this.state;
      if (state >= IN_STRING) {
        pos = state === IN_BARE ? this.scanBare(buf, pos, pos, len) : this.scanString(buf, pos, pos, len);
        continue;
      }

      const c = buf[pos]!;
      if (c === 0x20 || c === 0x0d || c === 0x09) {
        pos += 1;
        continue;
      }
      if (c === 0x0a) {
        pos += 1;
        this.line += 1;
        this.lineStart = this.chunkBase + pos;
        continue;
      }
      if (gate.blocked) break;

      switch (state) {
        case ARRAY_NEXT:
          if (c === 0x2c) {
            this.state = ARRAY_VALUE;
          } else if (c === 0x5d) {
            this.closeContainer(ARRAY);
          } else {
            this.fail(`Unexpected ${describeByte(c)}, expected ',' or ']'`, pos);
          }
          pos += 1;
          break;
        case OBJECT_NEXT:
          if (c === 0x2c) {
            this.state = OBJECT_KEY;
          } else if (c === 0x7d) {
            this.closeContainer(OBJECT);
          } else {
            this.fail(`Unexpected ${describeByte(c)}, expected ',' or '}'`, pos);
          }
          pos += 1;
          break;
        case OBJECT_FIRST:
        case OBJECT_KEY:
          if (c === 0x22) {
            pos = this.beginString(buf, pos, len, IN_KEY);
          } else if (c === 0x7d && state === OBJECT_FIRST) {
            this.closeContainer(OBJECT);
            pos += 1;
          } else if (c === 0x7d) {
            this.fail("Unexpected '}' after ',' (trailing commas are not allowed)", pos);
          } else {
            this.fail(`Unexpected ${describeByte(c)}, expected a string key`, pos);
          }
          break;
        case OBJECT_COLON:
          if (c !== 0x3a) this.fail(`Unexpected ${describeByte(c)}, expected ':'`, pos);
          this.state = OBJECT_VALUE;
          pos += 1;
          break;
        case DONE:
          this.fail(`Unexpected ${describeByte(c)} after the top-level value`, pos);
          break;
        default:
          pos = this.startValue(buf, pos, len, c, state);
      }
    }
    return pos;
  }

  /**
   * Whether `buf` from `pos` holds nothing but whitespace and the closing brackets that finish the document, so the rest
   * of the input cannot add a line. Call it after `write` returned `pos`. It does not validate the closers.
   */
  finishesAt(buf: Buffer, pos: number): boolean {
    if (this.state >= IN_STRING) return false;
    let open = this.depth;
    for (; pos < buf.length; pos += 1) {
      const c = buf[pos]!;
      if (c === 0x20 || c === 0x0d || c === 0x09 || c === 0x0a) continue;
      if ((c !== 0x5d && c !== 0x7d) || open === 0) return false;
      open -= 1;
    }
    return open === 0;
  }

  /** Signals end of input and throws unless exactly one complete JSON value was seen. */
  end(): void {
    const state = this.state;
    if (state === IN_BARE) {
      this.completeBare(EMPTY, 0, 0);
    } else if (state === IN_STRING || state === IN_KEY) {
      this.failAt("Unterminated string", this.tokenOffset);
    }
    if (this.state !== DONE) {
      this.failAt(this.depth === 0 ? "Unexpected end of input (empty document)" : "Unexpected end of input", this.consumed);
    }
  }

  private startValue(buf: Buffer, pos: number, len: number, c: number, state: number): number {
    switch (c) {
      case 0x7b:
        this.openContainer(OBJECT);
        this.state = OBJECT_FIRST;
        this.sink.startObject();
        return pos + 1;
      case 0x5b:
        this.openContainer(ARRAY);
        this.state = ARRAY_FIRST;
        this.sink.startArray();
        return pos + 1;
      case 0x22:
        return this.beginString(buf, pos, len, IN_STRING);
      case 0x5d:
        if (state === ARRAY_FIRST) {
          this.closeContainer(ARRAY);
          return pos + 1;
        }
        if (state === ARRAY_VALUE) this.fail("Unexpected ']' after ',' (trailing commas are not allowed)", pos);
        break;
      case 0x74: // t
      case 0x66: // f
      case 0x6e: // n
        return this.beginBare(buf, pos, len, LITERAL);
      default:
        if (c === 0x2d || (c >= 0x30 && c <= 0x39)) return this.beginBare(buf, pos, len, NUMBER);
    }
    return this.fail(`Unexpected ${describeByte(c)}, expected a value`, pos);
  }

  private openContainer(kind: number): void {
    if (this.depth === this.containers.length) {
      const grown = new Uint8Array(this.containers.length * 2);
      grown.set(this.containers);
      this.containers = grown;
    }
    this.containers[this.depth] = kind;
    this.depth += 1;
  }

  private closeContainer(kind: number): void {
    this.depth -= 1;
    this.state = this.nextState();
    if (kind === OBJECT) this.sink.endObject();
    else this.sink.endArray();
  }

  /** State after a value completes, based on the enclosing container. */
  private nextState(): number {
    if (this.depth === 0) return DONE;
    return this.containers[this.depth - 1] === ARRAY ? ARRAY_NEXT : OBJECT_NEXT;
  }

  private beginString(buf: Buffer, pos: number, len: number, state: number): number {
    this.state = state;
    this.tokenOffset = this.chunkBase + pos;
    this.pending.length = 0;
    this.pendingLength = 0;
    this.escapeState = ESC_NONE;
    this.escaped = false;
    this.highBits = 0;
    return this.scanString(buf, pos, pos + 1, len);
  }

  /** `from` is where this chunk's part of the token begins; `i` is where scanning continues. */
  private scanString(buf: Buffer, from: number, i: number, len: number): number {
    let escapeState = this.escapeState;
    let high = this.highBits;

    while (i < len) {
      if (escapeState === ESC_NONE) {
        // Tight loop for the common case: plain bytes up to the next quote, backslash or control character.
        let c = buf[i]!;
        while (c !== 0x22 && c !== 0x5c && c >= 0x20) {
          high |= c;
          i += 1;
          if (i >= len) break;
          c = buf[i]!;
        }
        if (i >= len) break;
        if (c === 0x22) {
          this.highBits = high;
          return this.completeString(buf, from, i + 1);
        }
        if (c === 0x5c) {
          escapeState = ESC_BACKSLASH;
          this.escaped = true;
          i += 1;
          continue;
        }
        this.fail(`Unescaped control character ${describeByte(c)} in string`, i);
      }

      const c = buf[i]!;
      if (escapeState === ESC_BACKSLASH) {
        if (c === 0x75) {
          escapeState = ESC_HEX;
          this.hexLeft = 4;
        } else if (SIMPLE_ESCAPE[c] === 1) {
          escapeState = ESC_NONE;
        } else {
          this.fail(`Invalid escape sequence '\\${String.fromCharCode(c)}' in string`, i);
        }
      } else {
        if (!isHexDigit(c)) this.fail(`Invalid \\u escape: ${describeByte(c)} is not a hex digit`, i);
        this.hexLeft -= 1;
        if (this.hexLeft === 0) escapeState = ESC_NONE;
      }
      i += 1;
    }

    this.escapeState = escapeState;
    this.highBits = high;
    this.stash(buf, from, len);
    return len;
  }

  private completeString(buf: Buffer, from: number, end: number): number {
    let token = buf;
    let start = from;
    let stop = end;
    if (this.pendingLength > 0) {
      this.pending.push(buf.subarray(from, end));
      token = Buffer.concat(this.pending, this.pendingLength + (end - from));
      this.pending.length = 0;
      this.pendingLength = 0;
      start = 0;
      stop = token.length;
    }
    if ((this.highBits & 0x80) !== 0 && !isUtf8(token.subarray(start, stop))) {
      this.failAt("Invalid UTF-8 in string", this.tokenOffset);
    }

    const isKey = this.state === IN_KEY;
    this.state = isKey ? OBJECT_COLON : this.nextState();
    if (isKey) this.sink.key(token, start, stop, this.escaped);
    else this.sink.string(token, start, stop, this.escaped);
    return end;
  }

  private beginBare(buf: Buffer, pos: number, len: number, kind: number): number {
    this.state = IN_BARE;
    this.bareKind = kind;
    this.tokenOffset = this.chunkBase + pos;
    this.pending.length = 0;
    this.pendingLength = 0;
    return this.scanBare(buf, pos, pos + 1, len);
  }

  private scanBare(buf: Buffer, from: number, i: number, len: number): number {
    if (this.bareKind === NUMBER) {
      while (i < len && NUMBER_BYTE[buf[i]!] === 1) i += 1;
    } else {
      while (i < len && buf[i]! >= 0x61 && buf[i]! <= 0x7a) i += 1;
      if (this.pendingLength + (i - from) > MAX_LITERAL_LENGTH) {
        this.failAt("Unexpected token, expected true, false or null", this.tokenOffset);
      }
    }
    if (i >= len) {
      // The token may continue in the next chunk.
      this.stash(buf, from, len);
      return len;
    }
    this.completeBare(buf, from, i);
    return i;
  }

  private completeBare(buf: Buffer, from: number, end: number): void {
    let token = buf;
    let start = from;
    let stop = end;
    if (this.pendingLength > 0) {
      this.pending.push(buf.subarray(from, end));
      token = Buffer.concat(this.pending, this.pendingLength + (end - from));
      this.pending.length = 0;
      this.pendingLength = 0;
      start = 0;
      stop = token.length;
    }

    this.state = this.nextState();
    if (this.bareKind === NUMBER) {
      if (!isValidNumber(token, start, stop)) {
        this.failAt(`Invalid number '${this.preview(token, start, stop)}'`, this.tokenOffset);
      }
      this.sink.number(token, start, stop);
      return;
    }
    const text = token.toString("latin1", start, stop);
    if (text !== "true" && text !== "false" && text !== "null") {
      this.failAt(`Unexpected token '${this.preview(token, start, stop)}', expected true, false or null`, this.tokenOffset);
    }
    this.sink.literal(token, start, stop);
  }

  private stash(buf: Buffer, from: number, len: number): void {
    if (len > from) {
      this.pending.push(Buffer.from(buf.subarray(from, len)));
      this.pendingLength += len - from;
    }
  }

  private preview(buf: Buffer, start: number, end: number): string {
    const text = buf.toString("latin1", start, Math.min(end, start + MAX_TOKEN_PREVIEW));
    return end - start > MAX_TOKEN_PREVIEW ? `${text}...` : text;
  }

  /** `index` is a position in the current chunk. */
  private fail(detail: string, index: number): never {
    return this.failAt(detail, this.chunkBase + index);
  }

  private failAt(detail: string, offset: number): never {
    throw new JsonSyntaxError(detail, offset, this.line, offset - this.lineStart + 1);
  }
}
