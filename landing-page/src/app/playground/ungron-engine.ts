/**
 * Browser port of `gronify unflatten`.
 *
 * It mirrors the CLI in `src/packages/cli/src/unflatten` (parse.ts, compound.ts, emitter.ts, tree.ts and writer.ts).
 * Document-order gron, which is what `flatten` writes, is converted in one pass exactly as the CLI streams it. Anything
 * else is rebuilt from an in-memory tree, as the CLI does for out-of-order input in its first 16 MiB; the playground's
 * input is far smaller, so that fallback always applies. Values are kept as written, so `12345678901234567890` and
 * `1.10` come back unchanged.
 *
 * Only standard ECMAScript and `TextEncoder`/`TextDecoder` are used, and nothing is imported, so the module runs in a
 * browser and in Node (`scripts/verify-playground.mjs`).
 */

export interface UnflattenOptions {
  /** `--pretty`: indent with two spaces, like `JSON.stringify(value, null, 2)`. */
  pretty?: boolean;
}

export interface UnflattenResult {
  /** What the CLI writes to stdout (the JSON and a trailing newline), or "" on error. */
  output: string;
  /** Lines the CLI writes to stderr: the error and its tip. */
  messages: string[];
  /** The error message without the `Error: unflattening gron: ` prefix, or null. */
  error: string | null;
}

/** Longest JSON the playground writes, in UTF-16 code units, so a sparse `json[4000000000]` cannot hang the tab. */
export const MAX_OUTPUT_CHARS = 16 * 1024 * 1024;

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

const utf8 = new TextDecoder("utf-8");
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

function decode(buf: Uint8Array, start: number, end: number): string {
  return utf8.decode(buf.subarray(start, end));
}

/** Whitespace between JSON tokens: space, tab, LF and CR. */
function isJsonSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * Length in bytes of the non-ASCII character at `at` that `String.prototype.trim` strips (U+00A0, U+1680,
 * U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF), or 0 if it is none of them.
 */
function wideSpaceLength(buf: Uint8Array, at: number, end: number): number {
  const first = buf[at];
  if (first === 0xc2) return at + 1 < end && buf[at + 1] === 0xa0 ? 2 : 0;
  if (at + 2 >= end) return 0;
  const second = buf[at + 1];
  const third = buf[at + 2];
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

function trimStart(buf: Uint8Array, start: number, end: number): number {
  let index = start;
  while (index < end) {
    const code = buf[index];
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

function trimEnd(buf: Uint8Array, start: number, end: number): number {
  let last = end;
  while (last > start) {
    const code = buf[last - 1];
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

/** True when `buf[start..end)` (quotes included) is a valid JSON string already spelled the way `JSON.stringify` writes it. */
function isCanonicalString(buf: Uint8Array, start: number, end: number): boolean {
  const last = end - 1;
  let high = false;
  for (let index = start + 1; index < last; index += 1) {
    const kind = STRING_CLASS[buf[index]];
    if (kind === 0) continue;
    if (kind === 4) {
      high = true;
    } else if (kind === 2) {
      if (index + 1 >= last || CANONICAL_ESCAPE[buf[index + 1]] !== 1) return false;
      index += 1;
    } else {
      return false;
    }
  }
  if (!high) return true;
  try {
    strictUtf8.decode(buf.subarray(start, end));
    return true;
  } catch {
    return false;
  }
}

function isNumber(buf: Uint8Array, start: number, end: number): boolean {
  let index = start;
  const digit = (at: number) => at < end && buf[at] >= 0x30 && buf[at] <= 0x39;
  if (buf[index] === 0x2d) index += 1;
  if (index >= end) return false;
  if (buf[index] === 0x30) {
    index += 1;
  } else if (buf[index] >= 0x31 && buf[index] <= 0x39) {
    while (digit(index)) index += 1;
  } else {
    return false;
  }
  if (index < end && buf[index] === 0x2e) {
    index += 1;
    const digits = index;
    while (digit(index)) index += 1;
    if (index === digits) return false;
  }
  if (index < end && (buf[index] === 0x65 || buf[index] === 0x45)) {
    index += 1;
    if (index < end && (buf[index] === 0x2b || buf[index] === 0x2d)) index += 1;
    const digits = index;
    while (digit(index)) index += 1;
    if (index === digits) return false;
  }
  return index === end;
}

function hasLiteral(buf: Uint8Array, start: number, end: number, literal: string): boolean {
  if (end - start !== literal.length) return false;
  for (let index = 0; index < literal.length; index += 1) {
    if (buf[start + index] !== literal.charCodeAt(index)) return false;
  }
  return true;
}

function lineError(lineNumber: number, message: string): Error {
  return new Error(`line ${lineNumber}: ${message}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Tree (node.ts). Scalars are kept as their JSON text; object keys as the content of their JSON string form.

class TreeObject {
  readonly entries = new Map<string, TreeNode>();
}

class TreeArray {
  readonly items: Array<TreeNode | undefined> = [];
}

type TreeNode = string | TreeObject | TreeArray;

/** One path segment: an array index, or an object key as canonical JSON string content. */
type Segment = number | { key: string };

interface ParsedLine {
  segments: Segment[];
  value: TreeNode;
}

// ---------------------------------------------------------------------------------------------------------------
// Line parser (parse.ts)

function pathError(buf: Uint8Array, start: number, end: number, lineNumber: number, message: string): never {
  // A line with no `=` followed by a value is "expected a gron assignment", whatever its path looks like.
  if (!/^json.*?\s*=\s*.+$/.test(decode(buf, start, end))) throw lineError(lineNumber, "expected a gron assignment");
  throw lineError(lineNumber, message);
}

/** Parses one line. Returns null for a blank line and throws `line N: ...` for an invalid one. */
function parseLine(buf: Uint8Array, start: number, end: number, lineNumber: number): ParsedLine | null {
  const index = trimStart(buf, start, end);
  let last = trimEnd(buf, index, end);
  if (last > index && buf[last - 1] === 0x3b) last = trimEnd(buf, index, last - 1);
  if (index >= last) return null;

  if (last - index < 4 || buf[index] !== 0x6a || buf[index + 1] !== 0x73 || buf[index + 2] !== 0x6f || buf[index + 3] !== 0x6e) {
    throw lineError(lineNumber, "expected a gron assignment");
  }

  const segments: Segment[] = [];
  let cursor = index + 4;
  while (cursor < last) {
    const code = buf[cursor];
    if (code === 0x2e) {
      const keyStart = cursor + 1;
      if (keyStart >= last || IDENT_START[buf[keyStart]] !== 1) {
        pathError(buf, index, last, lineNumber, "invalid property path");
      }
      let keyEnd = keyStart + 1;
      while (keyEnd < last && IDENT_PART[buf[keyEnd]] === 1) keyEnd += 1;
      segments.push({ key: decode(buf, keyStart, keyEnd) });
      cursor = keyEnd;
    } else if (code === 0x5b) {
      cursor = parseBracket(buf, cursor, last, index, lineNumber, segments);
    } else if (code === 0x3d) {
      break;
    } else {
      // Whitespace before `=` follows `String.prototype.trim`, including U+00A0 and friends.
      const after = trimStart(buf, cursor, last);
      if (after === cursor || buf[after] !== 0x3d) pathError(buf, index, last, lineNumber, "invalid character in path");
      cursor = after;
      break;
    }
  }
  if (cursor >= last) throw lineError(lineNumber, "expected a gron assignment");

  const valueStart = trimStart(buf, cursor + 1, last);
  if (valueStart >= last) throw lineError(lineNumber, "expected a gron assignment");
  return { segments, value: parseValue(buf, valueStart, last, lineNumber) };
}

function parseBracket(
  buf: Uint8Array,
  open: number,
  last: number,
  lineStart: number,
  lineNumber: number,
  segments: Segment[],
): number {
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
  if (close === -1) pathError(buf, lineStart, last, lineNumber, "unclosed bracket property");

  let start = open + 1;
  let end = close;
  while (start < end && WHITESPACE[buf[start]] === 1) start += 1;
  while (end > start && WHITESPACE[buf[end - 1]] === 1) end -= 1;

  // A plain decimal index: no sign, no leading zero.
  const first = buf[start];
  if (start < end && first >= 0x30 && first <= 0x39 && !(first === 0x30 && end - start > 1)) {
    let value = 0;
    let isIndex = true;
    for (let index = start; index < end; index += 1) {
      const digit = buf[index] - 0x30;
      if (digit < 0 || digit > 9) {
        isIndex = false;
        break;
      }
      value = value * 10 + digit;
    }
    if (isIndex) {
      if (value > MAX_ARRAY_INDEX) throw lineError(lineNumber, "array index is too large");
      segments.push(value);
      return close + 1;
    }
  }

  if (buf[start] === 0x22 && end - start >= 2 && buf[end - 1] === 0x22 && isCanonicalString(buf, start, end)) {
    segments.push({ key: decode(buf, start + 1, end - 1) });
    return close + 1;
  }

  let key: unknown;
  try {
    key = JSON.parse(decode(buf, start, end));
  } catch {
    pathError(buf, lineStart, last, lineNumber, "invalid bracket property");
  }
  if (typeof key !== "string") pathError(buf, lineStart, last, lineNumber, "bracket properties must be strings or indexes");
  segments.push({ key: JSON.stringify(key).slice(1, -1) });
  return close + 1;
}

function parseValue(buf: Uint8Array, start: number, end: number, lineNumber: number): TreeNode {
  const first = buf[start];
  if (first === 0x22) {
    if (end - start >= 2 && buf[end - 1] === 0x22) {
      if (isCanonicalString(buf, start, end)) return decode(buf, start, end);
      let value: unknown;
      try {
        value = JSON.parse(decode(buf, start, end));
      } catch {
        throw lineError(lineNumber, "invalid JSON value");
      }
      if (typeof value === "string") return JSON.stringify(value);
    }
  } else if (first === 0x2d || (first >= 0x30 && first <= 0x39)) {
    if (isNumber(buf, start, end)) return decode(buf, start, end);
  } else if (first === 0x74) {
    if (hasLiteral(buf, start, end, "true")) return "true";
  } else if (first === 0x66) {
    if (hasLiteral(buf, start, end, "false")) return "false";
  } else if (first === 0x6e) {
    if (hasLiteral(buf, start, end, "null")) return "null";
  } else if (first === 0x7b || first === 0x5b) {
    let inner = start + 1;
    while (inner < end && isJsonSpace(buf[inner])) inner += 1;
    if (inner === end - 1 && buf[inner] === (first === 0x7b ? 0x7d : 0x5d)) {
      return first === 0x7b ? new TreeObject() : new TreeArray();
    }
    const inline = parseCompound(decode(buf, start, end));
    if (inline !== undefined) return inline;
  }
  throw lineError(lineNumber, "invalid JSON value");
}

// ---------------------------------------------------------------------------------------------------------------
// One-line compound values (compound.ts)

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * Parses a `{...}` or `[...]` value written on one gron line, or returns undefined when it is not valid JSON. Numbers
 * stay as written, strings are normalized to what `JSON.stringify` writes, and a repeated key keeps its last value.
 */
function parseCompound(text: string): TreeNode | undefined {
  const length = text.length;
  const stack: Array<TreeObject | TreeArray> = [];
  let root: TreeNode | undefined;
  let pos = skipSpace(text, 0);

  for (;;) {
    const parent = stack[stack.length - 1];
    let key = "";
    if (parent instanceof TreeObject) {
      const end = stringEnd(text, pos);
      const quoted = end === -1 ? undefined : canonicalString(text, pos, end);
      if (quoted === undefined) return undefined;
      key = quoted.slice(1, -1);
      pos = skipSpace(text, end);
      if (text.charCodeAt(pos) !== 0x3a) return undefined;
      pos = skipSpace(text, pos + 1);
    }

    let node: TreeNode;
    let opened = false;
    const code = text.charCodeAt(pos);
    if (code === 0x7b || code === 0x5b) {
      node = code === 0x7b ? new TreeObject() : new TreeArray();
      pos = skipSpace(text, pos + 1);
      if (text.charCodeAt(pos) === (code === 0x7b ? 0x7d : 0x5d)) {
        pos += 1;
      } else {
        opened = true;
      }
    } else if (code === 0x22) {
      const end = stringEnd(text, pos);
      const quoted = end === -1 ? undefined : canonicalString(text, pos, end);
      if (quoted === undefined) return undefined;
      node = quoted;
      pos = end;
    } else if (text.startsWith("true", pos)) {
      node = "true";
      pos += 4;
    } else if (text.startsWith("false", pos)) {
      node = "false";
      pos += 5;
    } else if (text.startsWith("null", pos)) {
      node = "null";
      pos += 4;
    } else {
      NUMBER.lastIndex = pos;
      const match = NUMBER.exec(text);
      if (match === null) return undefined;
      node = match[0];
      pos += match[0].length;
    }

    if (parent === undefined) {
      root = node;
    } else if (parent instanceof TreeObject) {
      parent.entries.set(key, node);
    } else {
      parent.items.push(node);
    }
    if (opened) {
      stack.push(node as TreeObject | TreeArray);
      continue;
    }

    for (;;) {
      pos = skipSpace(text, pos);
      const open = stack[stack.length - 1];
      if (open === undefined) return pos === length ? root : undefined;
      const next = text.charCodeAt(pos);
      if (next === 0x2c) {
        pos = skipSpace(text, pos + 1);
        break;
      }
      if (next !== (open instanceof TreeObject ? 0x7d : 0x5d)) return undefined;
      stack.pop();
      pos += 1;
    }
  }
}

function skipSpace(text: string, index: number): number {
  while (index < text.length && isJsonSpace(text.charCodeAt(index))) index += 1;
  return index;
}

function stringEnd(text: string, start: number): number {
  if (text.charCodeAt(start) !== 0x22) return -1;
  for (let index = start + 1; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x22) return index + 1;
    if (code === 0x5c) index += 1;
  }
  return -1;
}

function canonicalString(text: string, start: number, end: number): string | undefined {
  try {
    return JSON.stringify(JSON.parse(text.slice(start, end)));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Writer (writer.ts)

class OutputTooLargeError extends Error {}

/** Writes JSON tokens for a stack of open containers, matching `JSON.stringify(value)` or `JSON.stringify(value, null, 2)`. */
class JsonWriter {
  /** Open containers; members of the innermost one sit at indent level `depth`. */
  depth = 0;
  readonly isArray: boolean[] = [];
  /** Members (array slots) written so far in the container at each depth. */
  readonly counts: number[] = [];
  private readonly parts: string[] = [];
  private size = 0;
  private readonly pretty: boolean;

  constructor(pretty: boolean) {
    this.pretty = pretty;
  }

  open(array: boolean): void {
    this.push(array ? "[" : "{");
    this.isArray[this.depth] = array;
    this.counts[this.depth] = 0;
    this.depth += 1;
  }

  closeTo(target: number): void {
    while (this.depth > target) this.close();
  }

  close(): void {
    this.depth -= 1;
    if (this.pretty && this.counts[this.depth] > 0) this.newline(this.depth);
    this.push(this.isArray[this.depth] ? "]" : "}");
  }

  /** The separator and indentation before the next member of the innermost container. */
  memberPrefix(): void {
    const top = this.depth - 1;
    if (this.counts[top] > 0) this.push(",");
    if (this.pretty) this.newline(this.depth);
    this.counts[top] += 1;
  }

  /** `"key":` for an object member; `key` is already-escaped JSON string content. */
  key(key: string): void {
    this.push(this.pretty ? `"${key}": ` : `"${key}":`);
  }

  raw(text: string): void {
    this.push(text);
  }

  /** Closes every open container and ends the document with a newline. */
  finish(): string {
    this.closeTo(0);
    this.push("\n");
    return this.parts.join("");
  }

  private newline(level: number): void {
    this.push(`\n${"  ".repeat(level)}`);
  }

  private push(text: string): void {
    this.size += text.length;
    if (this.size > MAX_OUTPUT_CHARS) throw new OutputTooLargeError();
    this.parts.push(text);
  }
}


/** Writes a tree through `writer` without recursion (tree.ts `TreeSerializer`). */
function writeTree(root: TreeNode, writer: JsonWriter): void {
  const stack: Array<{ entries: Iterator<[string, TreeNode]> | null; items: Array<TreeNode | undefined>; index: number }> = [];
  const write = (node: TreeNode) => {
    if (typeof node === "string") {
      writer.raw(node);
    } else if (node instanceof TreeObject) {
      writer.open(false);
      stack.push({ entries: node.entries.entries(), items: [], index: 0 });
    } else {
      writer.open(true);
      stack.push({ entries: null, items: node.items, index: 0 });
    }
  };
  write(root);
  while (stack.length > 0) {
    const level = stack[stack.length - 1];
    if (level.entries !== null) {
      const next = level.entries.next();
      if (next.done) {
        writer.close();
        stack.pop();
        continue;
      }
      writer.memberPrefix();
      writer.key(next.value[0]);
      write(next.value[1]);
    } else {
      if (level.index >= level.items.length) {
        writer.close();
        stack.pop();
        continue;
      }
      const item = level.items[level.index];
      level.index += 1;
      writer.memberPrefix();
      write(item === undefined ? "null" : item);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Document-order pass (emitter.ts)

/** The input is not in document order; the in-memory tree builder takes over. */
class OutOfOrderError extends Error {}

/**
 * Converts document-order gron in one pass, the way the CLI streams it. Repeated assignments to one object key are
 * written as they come (a JSON parser keeps the last), and array indexes must increase, with gaps filled by `null`.
 */
class StreamEmitter {
  rootSeen = false;
  readonly writer: JsonWriter;
  /** The segment each open container was entered by; index 0 (the root) has none. */
  private readonly frames: Segment[] = [];

  constructor(pretty: boolean) {
    this.writer = new JsonWriter(pretty);
  }

  line(parsed: ParsedLine, lineNumber: number): void {
    const writer = this.writer;
    const { segments, value } = parsed;
    const count = segments.length;
    if (count === 0) {
      if (this.rootSeen) throw new OutOfOrderError();
      this.rootSeen = true;
      this.writeValue(value, 0, null);
      return;
    }
    if (!this.rootSeen) throw lineError(lineNumber, "root must be assigned before child paths");
    if (writer.depth < count) throw new OutOfOrderError();
    for (let i = 0; i < count - 1; i += 1) {
      if (!sameSegment(segments[i], this.frames[i + 1])) throw new OutOfOrderError();
    }
    writer.closeTo(count);

    const last = segments[count - 1];
    const parent = count - 1;
    if (writer.isArray[parent]) {
      if (typeof last !== "number") throw lineError(lineNumber, "array path requires a numeric index");
      if (last < writer.counts[parent]) throw new OutOfOrderError();
      while (writer.counts[parent] < last) {
        writer.memberPrefix();
        writer.raw("null");
      }
    } else if (typeof last === "number") {
      throw lineError(lineNumber, "property does not match its parent container");
    }
    writer.memberPrefix();
    if (typeof last !== "number") writer.key(last.key);
    this.writeValue(value, count, last);
  }

  finish(): string {
    if (!this.rootSeen) throw new Error("input contains no gron assignments");
    return this.writer.finish();
  }

  private writeValue(value: TreeNode, depth: number, entry: Segment | null): void {
    if (typeof value === "string") {
      this.writer.raw(value);
    } else if (value instanceof TreeObject && value.entries.size === 0) {
      this.writer.open(false);
      if (entry !== null) this.frames[depth] = entry;
    } else if (value instanceof TreeArray && value.items.length === 0) {
      this.writer.open(true);
      if (entry !== null) this.frames[depth] = entry;
    } else {
      // A non-empty value written on one line is complete; nothing can be added to it later.
      writeTree(value, this.writer);
    }
  }
}

function sameSegment(a: Segment, b: Segment | undefined): boolean {
  if (b === undefined) return false;
  if (typeof a === "number" || typeof b === "number") return a === b;
  return a.key === b.key;
}

// ---------------------------------------------------------------------------------------------------------------
// In-memory fallback (tree.ts)

function assign(root: TreeNode, parsed: ParsedLine, lineNumber: number): void {
  const { segments, value } = parsed;
  let parent: TreeNode = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    let child: TreeNode | undefined;
    if (parent instanceof TreeArray && typeof segment === "number") {
      child = parent.items[segment];
    } else if (parent instanceof TreeObject && typeof segment !== "number") {
      child = parent.entries.get(segment.key);
    } else {
      throw lineError(lineNumber, "path does not match its parent container");
    }
    if (child === undefined) throw lineError(lineNumber, "parent path must be assigned before its children");
    parent = child;
  }

  const last = segments[segments.length - 1];
  if (parent instanceof TreeArray) {
    if (typeof last !== "number") throw lineError(lineNumber, "array path requires a numeric index");
    parent.items[last] = value;
  } else if (parent instanceof TreeObject && typeof last !== "number") {
    parent.entries.set(last.key, value);
  } else {
    throw lineError(lineNumber, "property does not match its parent container");
  }
}

/** Calls `visit` for every non-blank line with its 1-based number. The CLI ends input with one more newline. */
function forEachLine(buf: Uint8Array, visit: (parsed: ParsedLine, lineNumber: number) => void): void {
  let lineStart = 0;
  let lineNumber = 0;
  while (lineStart <= buf.length) {
    let newline = buf.indexOf(0x0a, lineStart);
    if (newline === -1) newline = buf.length;
    lineNumber += 1;
    const parsed = parseLine(buf, lineStart, newline, lineNumber);
    lineStart = newline + 1;
    if (parsed !== null) visit(parsed, lineNumber);
  }
}

function buildTree(buf: Uint8Array, pretty: boolean): string {
  let root: TreeNode | undefined;
  forEachLine(buf, (parsed, lineNumber) => {
    if (parsed.segments.length === 0) {
      root = parsed.value;
      return;
    }
    if (root === undefined) throw lineError(lineNumber, "root must be assigned before child paths");
    assign(root, parsed, lineNumber);
  });
  if (root === undefined) throw new Error("input contains no gron assignments");
  const writer = new JsonWriter(pretty);
  writeTree(root, writer);
  return writer.finish();
}

/** `gronify --no-color [--pretty] unflatten` */
export function unflatten(source: string, options: UnflattenOptions = {}): UnflattenResult {
  const pretty = Boolean(options.pretty);
  try {
    const buf = new TextEncoder().encode(source);
    let output: string;
    try {
      const emitter = new StreamEmitter(pretty);
      forEachLine(buf, (parsed, lineNumber) => emitter.line(parsed, lineNumber));
      output = emitter.finish();
    } catch (error) {
      if (!(error instanceof OutOfOrderError)) throw error;
      // The CLI drops what it streamed and rebuilds the document in memory, which it can do for the first 16 MiB.
      output = buildTree(buf, pretty);
    }
    return { output, messages: [], error: null };
  } catch (error) {
    if (error instanceof OutputTooLargeError) {
      const message = `the JSON would be larger than the playground's ${MAX_OUTPUT_CHARS / (1024 * 1024)} MB output limit; run 'gronify unflatten' in a terminal instead`;
      return { output: "", messages: [`Error: unflattening gron: ${message}`], error: message };
    }
    const message = error instanceof Error ? error.message : String(error);
    const messages = [`Error: unflattening gron: ${message}`];
    if (/^line \d+:/.test(message)) messages.push("Tip: Gron lines should look like: json.path = value");
    return { output: "", messages, error: message };
  }
}
