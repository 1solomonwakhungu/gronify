import { TreeArray, TreeObject, byteString, type TreeNode } from "./node.js";

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;

/** Whitespace between JSON tokens: space, tab, LF and CR. Not \v, \f or Unicode spaces. */
export function isJsonSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * Parses a `{...}` or `[...]` value written on one gron line, or returns undefined when it is not valid JSON.
 *
 * Unlike `JSON.parse` this keeps numbers exactly as written (`12345678901234567890` is not rounded), the way
 * scalar values on their own lines are. Strings are normalized to what `JSON.stringify` writes, and a repeated
 * object key keeps its last value, as `JSON.parse` does. Containers are walked with an explicit stack, so nesting
 * depth is not limited by the call stack.
 */
export function parseCompound(text: string): TreeNode | undefined {
  const length = text.length;
  const stack: Array<TreeObject | TreeArray> = [];
  let root: TreeNode | undefined;
  let pos = skipSpace(text, 0);

  for (;;) {
    // A member starts here: its key (objects only), then its value.
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
    } else if (code === QUOTE) {
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

    // The member is complete: close finished containers until a comma starts the next one.
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

/** Index just past the string that opens at `start`, or -1 if there is none. */
function stringEnd(text: string, start: number): number {
  if (text.charCodeAt(start) !== QUOTE) return -1;
  for (let index = start + 1; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === QUOTE) return index + 1;
    if (code === BACKSLASH) index += 1;
  }
  return -1;
}

/** The string in `text[start..end)` as `JSON.stringify` writes it (quotes included), or undefined if it is invalid. */
function canonicalString(text: string, start: number, end: number): string | undefined {
  try {
    return byteString(JSON.stringify(JSON.parse(text.slice(start, end))));
  } catch {
    return undefined;
  }
}
