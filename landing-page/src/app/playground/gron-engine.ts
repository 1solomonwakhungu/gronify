/**
 * Browser port of `gronify flatten` and `gronify search`.
 *
 * It mirrors the CLI in `src/packages/cli/src` (tokenizer.ts, flatten-stream.ts, sort.ts, matcher.ts, output.ts and
 * the messages in index.ts) closely enough to give byte-identical stdout and the same stderr messages for the same
 * flags, with `--no-color`. The input is one in-memory string, so there is no chunking, backpressure or temp file:
 * the tokenizer runs over the UTF-8 bytes of the whole input in one pass, and `--sort` keeps the whole tree.
 *
 * Only standard ECMAScript and `TextEncoder`/`TextDecoder` are used, so the module runs in a browser and in Node
 * (`scripts/verify-playground.mjs` loads it directly). It imports nothing, which keeps that possible.
 */

/** Largest input the playground processes, in UTF-8 bytes. The CLI streams files of any size. */
export const MAX_INPUT_BYTES = 2 * 1024 * 1024;

/**
 * Most output the playground generates, in UTF-16 code units, counting every line before it is filtered. Each line
 * repeats its full path, so output can grow with the square of the nesting depth: 40 KB of `[[[...]]]` would print
 * 600 million characters. The CLI streams that to disk; a browser tab cannot hold it.
 */
export const MAX_OUTPUT_CHARS = 16 * 1024 * 1024;

/** The output passed `MAX_OUTPUT_CHARS`. A playground limit only; the CLI has no such limit. */
export class OutputTooLargeError extends Error {
  constructor(command: string) {
    super(
      `the output is larger than the playground's ${MAX_OUTPUT_CHARS / (1024 * 1024)} MB limit ` +
        `(deeply nested or very large JSON); run 'gronify ${command}' in a terminal instead`,
    );
    this.name = "OutputTooLargeError";
  }
}

/** A strict JSON syntax error, worded and positioned exactly as the CLI reports it. */
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

export interface FlattenOptions {
  /** `--sort`: object keys in UTF-16 code unit order at every level; arrays keep their order. */
  sort?: boolean;
  /** `--limit <n>`: stop after n lines. */
  limit?: number | null;
}

export interface SearchOptions {
  term: string;
  /** `-r, --regex` */
  regex?: boolean;
  /** `-c, --case-sensitive` */
  caseSensitive?: boolean;
  /** `-v, --invert-match` */
  invert?: boolean;
  /** `--count` */
  count?: boolean;
  /** `-m, --max-count <n>` */
  maxCount?: number | null;
  /** `--sort` (ignored with `--count`, as in the CLI) */
  sort?: boolean;
}

export interface GronResult {
  /** Lines the CLI writes to stdout, without their newlines. Empty when `error` is set. */
  lines: string[];
  /** Lines the CLI writes to stderr (warnings, notices, the error and its tip). */
  messages: string[];
  /** The error message without the `Error: <context>: ` prefix, or null. */
  error: string | null;
  /** Lines kept: printed lines, or matches for search. */
  matched: number;
  /** A `--limit`/`-m` cap ended the run before the input did. */
  stoppedEarly: boolean;
  /** The error is the playground's output limit, not a problem with the input. */
  limitExceeded: boolean;
}

/** Everything the CLI writes to stdout for `result`. */
export function stdoutOf(result: GronResult): string {
  return result.lines.length === 0 ? "" : `${result.lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Tokenizer (tokenizer.ts)

interface JsonSink {
  startObject(): void;
  endObject(): void;
  startArray(): void;
  endArray(): void;
  /** `start`/`end` include the quotes. `escaped` is true when the token contains a backslash. */
  key(buf: Uint8Array, start: number, end: number, escaped: boolean): void;
  string(buf: Uint8Array, start: number, end: number, escaped: boolean): void;
  /** Numbers and the literals `true`, `false` and `null`, as written. */
  bare(buf: Uint8Array, start: number, end: number): void;
}

const OBJECT = 0;
const ARRAY = 1;

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
const IN_BARE = 10;

const MAX_LITERAL_LENGTH = 5;
const MAX_TOKEN_PREVIEW = 40;

const NUMBER_BYTE = new Uint8Array(256);
for (const character of "0123456789+-.eE") NUMBER_BYTE[character.charCodeAt(0)] = 1;

const SIMPLE_ESCAPE = new Uint8Array(256);
for (const character of '"\\/bfnrt') SIMPLE_ESCAPE[character.charCodeAt(0)] = 1;

const utf8 = new TextDecoder("utf-8");
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

function isHexDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

function isDigit(buf: Uint8Array, index: number, end: number): boolean {
  return index < end && buf[index] >= 0x30 && buf[index] <= 0x39;
}

/** `-? (0 | [1-9][0-9]*) (. [0-9]+)? ([eE] [+-]? [0-9]+)?` over `buf[start, end)`. */
function isValidNumber(buf: Uint8Array, start: number, end: number): boolean {
  let i = start;
  if (buf[i] === 0x2d) i += 1;
  if (i < end && buf[i] === 0x30) {
    i += 1;
  } else if (isDigit(buf, i, end)) {
    while (isDigit(buf, i, end)) i += 1;
  } else {
    return false;
  }
  if (i < end && buf[i] === 0x2e) {
    i += 1;
    if (!isDigit(buf, i, end)) return false;
    while (isDigit(buf, i, end)) i += 1;
  }
  if (i < end && (buf[i] === 0x65 || buf[i] === 0x45)) {
    i += 1;
    if (i < end && (buf[i] === 0x2b || buf[i] === 0x2d)) i += 1;
    if (!isDigit(buf, i, end)) return false;
    while (isDigit(buf, i, end)) i += 1;
  }
  return i === end;
}

function latin1(buf: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let i = start; i < end; i += 1) text += String.fromCharCode(buf[i]);
  return text;
}

function isLiteral(buf: Uint8Array, start: number, end: number): boolean {
  const text = latin1(buf, start, end);
  return text === "true" || text === "false" || text === "null";
}

function describeByte(c: number): string {
  if (c >= 0x20 && c < 0x7f) return `'${String.fromCharCode(c)}'`;
  return `byte 0x${c.toString(16).padStart(2, "0")}`;
}

/** Lets the sink stop the tokenizer between tokens once a result cap is reached. */
interface Gate {
  blocked: boolean;
}

/** Strict (RFC 8259) JSON tokenizer over the bytes of one complete input. */
class JsonTokenizer {
  private state = TOP_VALUE;
  private readonly containers: number[] = [];
  private line = 1;
  private lineStart = 0;
  private tokenOffset = 0;

  private readonly buf: Uint8Array;
  private readonly sink: JsonSink;
  private readonly gate: Gate;

  constructor(buf: Uint8Array, sink: JsonSink, gate: Gate) {
    this.buf = buf;
    this.sink = sink;
    this.gate = gate;
  }

  /**
   * Consumes the input. Returns the index of the first byte left unread when the gate stopped it, or the input
   * length when everything was read (call `end` next).
   */
  write(): number {
    const { buf, gate } = this;
    const len = buf.length;
    let pos = 0;

    while (pos < len) {
      const state = this.state;
      const c = buf[pos];
      if (c === 0x20 || c === 0x0d || c === 0x09) {
        pos += 1;
        continue;
      }
      if (c === 0x0a) {
        pos += 1;
        this.line += 1;
        this.lineStart = pos;
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
            pos = this.scanString(pos, true);
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
          pos = this.startValue(pos, c, state);
      }
    }
    return pos;
  }

  /** Throws unless exactly one complete JSON value was read. */
  end(): void {
    if (this.state === IN_BARE) this.completeBare(this.tokenOffset, this.buf.length);
    if (this.state !== DONE) {
      this.failAt(
        this.containers.length === 0 ? "Unexpected end of input (empty document)" : "Unexpected end of input",
        this.buf.length,
      );
    }
  }

  /**
   * Whether the input from `pos` holds nothing but whitespace and the closing brackets that finish the document, so
   * the rest of it cannot add a line. It does not validate the closers.
   */
  finishesAt(pos: number): boolean {
    if (this.state === IN_BARE) return false;
    const buf = this.buf;
    let open = this.containers.length;
    for (; pos < buf.length; pos += 1) {
      const c = buf[pos];
      if (c === 0x20 || c === 0x0d || c === 0x09 || c === 0x0a) continue;
      if ((c !== 0x5d && c !== 0x7d) || open === 0) return false;
      open -= 1;
    }
    return open === 0;
  }

  private startValue(pos: number, c: number, state: number): number {
    switch (c) {
      case 0x7b:
        this.containers.push(OBJECT);
        this.state = OBJECT_FIRST;
        this.sink.startObject();
        return pos + 1;
      case 0x5b:
        this.containers.push(ARRAY);
        this.state = ARRAY_FIRST;
        this.sink.startArray();
        return pos + 1;
      case 0x22:
        return this.scanString(pos, false);
      case 0x5d:
        if (state === ARRAY_FIRST) {
          this.closeContainer(ARRAY);
          return pos + 1;
        }
        if (state === ARRAY_VALUE) this.fail("Unexpected ']' after ',' (trailing commas are not allowed)", pos);
        break;
      case 0x74:
      case 0x66:
      case 0x6e:
      case 0x2d:
        this.state = IN_BARE;
        this.tokenOffset = pos;
        return this.scanBare(pos + 1);
      default:
        if (c >= 0x30 && c <= 0x39) {
          this.state = IN_BARE;
          this.tokenOffset = pos;
          return this.scanBare(pos + 1);
        }
    }
    return this.fail(`Unexpected ${describeByte(c)}, expected a value`, pos);
  }

  private closeContainer(kind: number): void {
    this.containers.pop();
    this.state = this.nextState();
    if (kind === OBJECT) this.sink.endObject();
    else this.sink.endArray();
  }

  private nextState(): number {
    const depth = this.containers.length;
    if (depth === 0) return DONE;
    return this.containers[depth - 1] === ARRAY ? ARRAY_NEXT : OBJECT_NEXT;
  }

  private scanString(start: number, isKey: boolean): number {
    const buf = this.buf;
    const len = buf.length;
    this.tokenOffset = start;
    let escaped = false;
    let high = false;
    let i = start + 1;
    for (;;) {
      if (i >= len) this.failAt("Unterminated string", start);
      const c = buf[i];
      if (c === 0x22) break;
      if (c === 0x5c) {
        escaped = true;
        i += 1;
        if (i >= len) this.failAt("Unterminated string", start);
        const escape = buf[i];
        if (escape === 0x75) {
          for (let digit = 0; digit < 4; digit += 1) {
            i += 1;
            if (i >= len) this.failAt("Unterminated string", start);
            if (!isHexDigit(buf[i])) this.fail(`Invalid \\u escape: ${describeByte(buf[i])} is not a hex digit`, i);
          }
        } else if (SIMPLE_ESCAPE[escape] !== 1) {
          this.fail(`Invalid escape sequence '\\${String.fromCharCode(escape)}' in string`, i);
        }
        i += 1;
        continue;
      }
      if (c < 0x20) this.fail(`Unescaped control character ${describeByte(c)} in string`, i);
      if (c >= 0x80) high = true;
      i += 1;
    }
    const end = i + 1;
    if (high) {
      try {
        strictUtf8.decode(buf.subarray(start, end));
      } catch {
        this.failAt("Invalid UTF-8 in string", start);
      }
    }
    if (isKey) {
      this.sink.key(buf, start, end, escaped);
      if (end < len && buf[end] === 0x3a) {
        this.state = OBJECT_VALUE;
        return end + 1;
      }
      this.state = OBJECT_COLON;
      return end;
    }
    this.state = this.nextState();
    this.sink.string(buf, start, end, escaped);
    return end;
  }

  /** Scans the rest of a number or literal that began at `tokenOffset`. Stops at the input end without completing it. */
  private scanBare(i: number): number {
    const buf = this.buf;
    const len = buf.length;
    const start = this.tokenOffset;
    const isNumber = buf[start] === 0x2d || (buf[start] >= 0x30 && buf[start] <= 0x39);
    if (isNumber) {
      while (i < len && NUMBER_BYTE[buf[i]] === 1) i += 1;
    } else {
      while (i < len && buf[i] >= 0x61 && buf[i] <= 0x7a) i += 1;
      if (i - start > MAX_LITERAL_LENGTH) this.failAt("Unexpected token, expected true, false or null", start);
    }
    if (i >= len) return len;
    this.completeBare(start, i);
    return i;
  }

  private completeBare(start: number, end: number): void {
    const buf = this.buf;
    this.state = this.nextState();
    const isNumber = buf[start] === 0x2d || (buf[start] >= 0x30 && buf[start] <= 0x39);
    if (isNumber) {
      if (!isValidNumber(buf, start, end)) this.failAt(`Invalid number '${this.preview(start, end)}'`, start);
    } else if (!isLiteral(buf, start, end)) {
      this.failAt(`Unexpected token '${this.preview(start, end)}', expected true, false or null`, start);
    }
    this.sink.bare(buf, start, end);
  }

  private preview(start: number, end: number): string {
    const text = latin1(this.buf, start, Math.min(end, start + MAX_TOKEN_PREVIEW));
    return end - start > MAX_TOKEN_PREVIEW ? `${text}...` : text;
  }

  private fail(detail: string, offset: number): never {
    return this.failAt(detail, offset);
  }

  private failAt(detail: string, offset: number): never {
    throw new JsonSyntaxError(detail, offset, this.line, offset - this.lineStart + 1);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Matching (matcher.ts) and output (output.ts)

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the line test the CLI uses. A plain term is a substring match; without `-c` it is case-insensitive the way a
 * non-Unicode `/i` RegExp is, which is what the CLI's byte matcher does too. Throws a SyntaxError for a bad `--regex`.
 */
export function createLineMatcher(
  term: string,
  options: { regex?: boolean; caseSensitive?: boolean } = {},
): (line: string) => boolean {
  const flags = options.caseSensitive ? "" : "i";
  if (options.regex) {
    const pattern = new RegExp(term, flags);
    return (line) => pattern.test(line);
  }
  if (options.caseSensitive) return (line) => line.includes(term);
  const pattern = new RegExp(escapeRegex(term), flags);
  return (line) => pattern.test(line);
}

/** Filters, counts and caps lines, like `GronOutput`. */
class LineOutput implements Gate {
  readonly lines: string[] = [];
  matched = 0;
  stopped = false;
  blocked = false;

  private readonly matcher: ((line: string) => boolean) | null;
  private readonly invert: boolean;
  private readonly countOnly: boolean;
  private readonly limit: number;
  private readonly command: string;
  /** Characters of every line generated so far, kept or not. */
  private size = 0;

  constructor(
    matcher: ((line: string) => boolean) | null,
    invert: boolean,
    countOnly: boolean,
    limit: number,
    command: string,
  ) {
    this.matcher = matcher;
    this.invert = invert;
    this.countOnly = countOnly;
    this.limit = limit;
    this.command = command;
  }

  /**
   * Every generated line passes through here, including `--sort` lines that are buffered before they are kept, so
   * this is where the output budget is charged. It is charged before matching, since a regex over a long line costs
   * time whether or not it matches.
   */
  accepts(line: string): boolean {
    this.size += line.length + 1;
    if (this.size > MAX_OUTPUT_CHARS) throw new OutputTooLargeError(this.command);
    return this.matcher === null || this.matcher(line) !== this.invert;
  }

  /** Takes one line that `accepts` already passed. */
  keep(line: string): void {
    if (this.stopped) return;
    this.matched += 1;
    if (!this.countOnly) this.lines.push(line);
    if (this.matched >= this.limit) this.stopped = this.blocked = true;
  }

  line(line: string): void {
    if (this.accepts(line)) this.keep(line);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Flattening (flatten-stream.ts) and sorting (sort.ts)

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The decoded key, and the token as `JSON.stringify` would spell it. */
function decodeStringToken(buf: Uint8Array, start: number, end: number, escaped: boolean): [string, string] {
  const token = utf8.decode(buf.subarray(start, end));
  if (!escaped) return [token.slice(1, -1), token];
  // The tokenizer already validated the token, so this cannot throw. JSON.stringify writes `\/` as `/`, a lone
  // surrogate as lowercase `\udxxx`, and control characters in their short form, exactly as the CLI does.
  const value = JSON.parse(token) as string;
  return [value, JSON.stringify(value)];
}

/** A line target that also hears about structure, so `--sort` can regroup lines. */
interface LineTarget {
  open(isArray: boolean, ownLine: string, key: string | null): void;
  close(): void;
  scalar(text: string, key: string | null): void;
}

/** Turns tokenizer events into `path = value` lines. */
class GronFlattener implements JsonSink {
  private path = "json";
  private readonly bases: string[] = [];
  private readonly kinds: number[] = [];
  private readonly indexes: number[] = [];
  /** The decoded key of the member being read, when its parent is an object. */
  private memberKey: string | null = null;

  private readonly target: LineTarget;

  constructor(target: LineTarget) {
    this.target = target;
  }

  startObject(): void {
    this.open(OBJECT, "{}");
  }

  startArray(): void {
    this.open(ARRAY, "[]");
  }

  endObject(): void {
    this.close();
  }

  endArray(): void {
    this.close();
  }

  key(buf: Uint8Array, start: number, end: number, escaped: boolean): void {
    const [key, quoted] = decodeStringToken(buf, start, end, escaped);
    const base = this.bases[this.bases.length - 1];
    this.path = IDENTIFIER.test(key) ? `${base}.${key}` : `${base}[${quoted}]`;
    this.memberKey = key;
  }

  string(buf: Uint8Array, start: number, end: number, escaped: boolean): void {
    this.scalar(decodeStringToken(buf, start, end, escaped)[1]);
  }

  bare(buf: Uint8Array, start: number, end: number): void {
    // Numbers are printed exactly as written: no rounding of 12345678901234567890, no trimming of 1.10.
    this.scalar(latin1(buf, start, end));
  }

  private scalar(value: string): void {
    const key = this.beginValue();
    this.target.scalar(`${this.path} = ${value}`, key);
    this.endValue();
  }

  private open(kind: number, empty: string): void {
    const key = this.beginValue();
    this.target.open(kind === ARRAY, `${this.path} = ${empty}`, key);
    this.bases.push(this.path);
    this.kinds.push(kind);
    this.indexes.push(-1);
  }

  private close(): void {
    this.bases.pop();
    this.kinds.pop();
    this.indexes.pop();
    this.target.close();
    this.endValue();
  }

  /** Extends the path for an array element. Returns the member key when the parent is an object. */
  private beginValue(): string | null {
    const top = this.kinds.length - 1;
    if (top < 0) return null;
    if (this.kinds[top] !== ARRAY) return this.memberKey;
    const index = this.indexes[top] + 1;
    this.indexes[top] = index;
    this.path = `${this.bases[top]}[${index}]`;
    return null;
  }

  private endValue(): void {
    const top = this.bases.length - 1;
    this.path = top < 0 ? "json" : this.bases[top];
  }
}

/** Document-order output: every line goes straight to the output. */
class DirectTarget implements LineTarget {
  private readonly out: LineOutput;

  constructor(out: LineOutput) {
    this.out = out;
  }

  open(_isArray: boolean, ownLine: string): void {
    this.out.line(ownLine);
  }

  close(): void {}

  scalar(text: string): void {
    this.out.line(text);
  }
}

/** A buffered container: its own line, then its members (object members are sorted by key when written). */
interface SortFrame {
  isArray: boolean;
  /** Arrays at the root, or directly inside such arrays, write as they go instead of buffering. */
  streaming: boolean;
  /** Own line, if it passed the filter. */
  own: string | null;
  members: SortMember[];
}

interface SortMember {
  key: string;
  /** A scalar line that passed the filter, or a closed child container. */
  item: string | SortFrame | null;
}

/**
 * `--sort`: object keys in UTF-16 code unit order (like JS `sort()`), duplicate keys in document order, arrays in
 * document order. As in the CLI, an array at the top level (and arrays directly inside it) streams element by
 * element, while everything under an object waits until that object's outermost buffered ancestor closes. Lines are
 * filtered before they are kept, and the output cap applies to the sorted order.
 */
class SortingTarget implements LineTarget {
  private readonly stack: SortFrame[] = [];
  private readonly out: LineOutput;

  constructor(out: LineOutput) {
    this.out = out;
  }

  open(isArray: boolean, ownLine: string, key: string | null): void {
    const parent = this.stack[this.stack.length - 1];
    const streaming = isArray && (parent === undefined || parent.streaming);
    const own = this.out.accepts(ownLine) ? ownLine : null;
    const frame: SortFrame = { isArray, streaming, own, members: [] };
    if (streaming) {
      if (own !== null) this.out.keep(own);
      frame.own = null;
    }
    this.stack.push(frame);
    if (parent !== undefined && !parent.streaming) parent.members.push({ key: key ?? "", item: frame });
  }

  close(): void {
    const frame = this.stack.pop();
    if (frame === undefined) return;
    const parent = this.stack[this.stack.length - 1];
    // A buffered frame is written when it closes directly under a streaming array, or at the root.
    if (!frame.streaming && (parent === undefined || parent.streaming)) this.emit(frame);
  }

  scalar(text: string, key: string | null): void {
    const accepted = this.out.accepts(text);
    const parent = this.stack[this.stack.length - 1];
    if (parent === undefined || parent.streaming) {
      if (accepted) this.out.keep(text);
      return;
    }
    parent.members.push({ key: key ?? "", item: accepted ? text : null });
  }

  /** Writes a closed frame in sorted order, without recursion. */
  private emit(root: SortFrame): void {
    const out = this.out;
    const pending: Array<string | SortFrame> = [root];
    while (pending.length > 0 && !out.stopped) {
      const next = pending.pop()!;
      if (typeof next === "string") {
        out.keep(next);
        continue;
      }
      if (next.own !== null) out.keep(next.own);
      let members = next.members;
      if (!next.isArray) {
        // Array.prototype.sort is stable, so duplicate keys keep their document order.
        members = members.slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      }
      for (let i = members.length - 1; i >= 0; i -= 1) {
        const item = members[i].item;
        if (item !== null) pending.push(item);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Commands (index.ts)

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function encodeInput(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

interface RunState {
  out: LineOutput;
  exhausted: boolean;
}

/** Runs the tokenizer over `bytes` into `out`, honoring the cap the way `flattenStream` does. */
function runFlatten(bytes: Uint8Array, out: LineOutput, sort: boolean): RunState {
  const target = sort ? new SortingTarget(out) : new DirectTarget(out);
  const tokenizer = new JsonTokenizer(bytes, new GronFlattener(target), out);
  const pos = tokenizer.write();
  if (out.stopped) {
    // Sorted output may still be held back, so only a document-order run can tell nothing is left.
    return { out, exhausted: !sort && tokenizer.finishesAt(pos) };
  }
  tokenizer.end();
  return { out, exhausted: out.stopped && !sort };
}

/** A second value in single-document mode, which usually means JSON Lines input. */
function isTrailingValueError(error: unknown): boolean {
  return error instanceof SyntaxError && error.message.includes("after the top-level value");
}

const STREAM_TIP = "Tip: For JSON Lines / NDJSON (one value per line), pass --stream (or --jsonl)";

function failure(context: string, error: unknown, tip: string | null): GronResult {
  const message = error instanceof Error ? error.message : String(error);
  const messages = [`Error: ${context}: ${message}`];
  if (tip !== null) messages.push(tip);
  return { lines: [], messages, error: message, matched: 0, stoppedEarly: false, limitExceeded: error instanceof OutputTooLargeError };
}

/** `gronify --no-color flatten [--sort] [--limit n]` */
export function flatten(input: string, options: FlattenOptions = {}): GronResult {
  const limit = options.limit ?? Infinity;
  try {
    const { out, exhausted } = runFlatten(encodeInput(input), new LineOutput(null, false, false, limit, "flatten"), Boolean(options.sort));
    const messages: string[] = [];
    const stoppedEarly = out.stopped && !exhausted;
    if (stoppedEarly) messages.push(`Stopped after ${plural(limit, "line", "lines")} (--limit); there may be more`);
    return { lines: out.lines, messages, error: null, matched: out.matched, stoppedEarly, limitExceeded: false };
  } catch (error) {
    return failure(
      "flattening JSON",
      error,
      isTrailingValueError(error)
        ? STREAM_TIP
        : error instanceof SyntaxError
          ? "Tip: Validate your JSON with a linter like https://jsonlint.com"
          : null,
    );
  }
}

/** `gronify --no-color search <term> [-r] [-c] [-v] [--count] [-m n] [--sort]` */
export function search(input: string, options: SearchOptions): GronResult {
  const limit = options.maxCount ?? Infinity;
  const context = options.regex ? "searching JSON (invalid regex or JSON)" : "searching JSON";
  try {
    const matcher = createLineMatcher(options.term, options);
    const out = new LineOutput(matcher, Boolean(options.invert), Boolean(options.count), limit, "search");
    // Counting needs no order, so --sort is skipped with --count.
    const { exhausted } = runFlatten(encodeInput(input), out, Boolean(options.sort) && !options.count);
    const messages: string[] = [];
    const stoppedEarly = out.stopped && !exhausted;
    if (options.count) {
      if (stoppedEarly) messages.push(`Stopped counting at ${plural(limit, "match", "matches")} (--max-count)`);
      return { lines: [String(out.matched)], messages, error: null, matched: out.matched, stoppedEarly, limitExceeded: false };
    }
    if (stoppedEarly) {
      const what = options.invert ? plural(limit, "line", "lines") : plural(limit, "match", "matches");
      messages.push(`Stopped after ${what} (--max-count); there may be more`);
    }
    if (out.matched === 0) {
      if (options.invert) {
        messages.push(`Warning: All lines matched '${options.term}' (nothing to invert)`);
      } else {
        messages.push(`Warning: No matches found for '${options.term}'`);
        messages.push("Tip: Search is a case-insensitive substring match; use --regex for patterns");
      }
    }
    return { lines: out.lines, messages, error: null, matched: out.matched, stoppedEarly, limitExceeded: false };
  } catch (error) {
    return failure(context, error, isTrailingValueError(error) ? STREAM_TIP : null);
  }
}

/** UTF-8 size of `text` in bytes, without allocating a copy. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) {
      bytes += 1;
    } else if (unit < 0x800) {
      bytes += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
