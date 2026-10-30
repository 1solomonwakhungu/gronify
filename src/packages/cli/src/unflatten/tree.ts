import type { LineSink } from "./lines.js";
import type { OutputBuffer } from "./output.js";
import { LineParser, VALUE_EMPTY_ARRAY, VALUE_EMPTY_OBJECT, VALUE_INLINE, lineError } from "./parse.js";
import type { JsonWriter } from "./writer.js";

// Scalars are kept as latin1 strings of their UTF-8 bytes (and object keys as the
// bytes of their escaped JSON form), so they can be written back byte for byte.
type TreeNode = string | TreeObject | TreeArray;

class TreeObject {
  readonly entries = new Map<string, TreeNode>();
}

class TreeArray {
  readonly items: Array<TreeNode | undefined> = [];
}

function byteString(text: string): string {
  return Buffer.from(text, "utf8").toString("latin1");
}

function fromJson(value: unknown): TreeNode {
  if (Array.isArray(value)) {
    const array = new TreeArray();
    value.forEach((item, index) => {
      array.items[index] = fromJson(item);
    });
    return array;
  }
  if (value !== null && typeof value === "object") {
    const object = new TreeObject();
    for (const [key, item] of Object.entries(value)) {
      object.entries.set(byteString(JSON.stringify(key).slice(1, -1)), fromJson(item));
    }
    return object;
  }
  return byteString(JSON.stringify(value));
}

/**
 * In-memory fallback for gron that is not in document order. It accepts what
 * the streaming pass cannot: children after their siblings' descendants,
 * array indexes in any order, and assignments that replace earlier ones. As
 * in the streaming pass, values are kept verbatim.
 */
export class TreeBuilder implements LineSink {
  private root: TreeNode | undefined;

  constructor(private readonly parser: LineParser) {}

  get hasRoot(): boolean {
    return this.root !== undefined;
  }

  line(buf: Buffer, start: number, end: number, lineNumber: number): boolean {
    const parser = this.parser;
    if (!parser.parse(buf, start, end, lineNumber)) return true;
    const value = this.valueNode();
    const segments = parser.segCount;
    if (segments === 0) {
      this.root = value;
      return true;
    }
    if (this.root === undefined) throw lineError(lineNumber, "root must be assigned before child paths");

    let parent: TreeNode = this.root;
    for (let segment = 0; segment < segments - 1; segment += 1) {
      let child: TreeNode | undefined;
      if (parent instanceof TreeArray && parser.segIsIndex[segment] === 1) {
        child = parent.items[parser.segIndex[segment] as number];
      } else if (parent instanceof TreeObject && parser.segIsIndex[segment] !== 1) {
        child = parent.entries.get(parser.keyAsLatin1(segment));
      } else {
        throw lineError(lineNumber, "path does not match its parent container");
      }
      if (child === undefined) throw lineError(lineNumber, "parent path must be assigned before its children");
      parent = child;
    }

    const last = segments - 1;
    const isIndex = parser.segIsIndex[last] === 1;
    if (parent instanceof TreeArray) {
      if (!isIndex) throw lineError(lineNumber, "array path requires a numeric index");
      parent.items[parser.segIndex[last] as number] = value;
    } else if (parent instanceof TreeObject && !isIndex) {
      parent.entries.set(parser.keyAsLatin1(last), value);
    } else {
      throw lineError(lineNumber, "property does not match its parent container");
    }
    return true;
  }

  serializer(writer: JsonWriter, out: OutputBuffer): TreeSerializer {
    return new TreeSerializer(this.root as TreeNode, writer, out);
  }

  private valueNode(): TreeNode {
    const parser = this.parser;
    switch (parser.valueKind) {
      case VALUE_EMPTY_OBJECT:
        return new TreeObject();
      case VALUE_EMPTY_ARRAY:
        return new TreeArray();
      case VALUE_INLINE:
        return fromJson(parser.inline);
      default:
        return parser.valueBuf.toString("latin1", parser.valueStart, parser.valueEnd);
    }
  }
}

interface Level {
  node: TreeObject | TreeArray;
  entries: Iterator<[string, TreeNode]> | undefined;
  index: number;
}

/**
 * Walks the tree with an explicit stack and writes it through `JsonWriter`. It
 * stops when the output backs up, so sparse arrays of any length stream out
 * in constant memory; call `run` again after flushing.
 */
export class TreeSerializer {
  private readonly stack: Level[] = [];
  private started = false;

  constructor(
    private readonly root: TreeNode,
    private readonly writer: JsonWriter,
    private readonly out: OutputBuffer
  ) {}

  /** Returns true once the whole tree has been written. */
  run(): boolean {
    const writer = this.writer;
    if (!this.started) {
      this.started = true;
      this.write(this.root);
    }
    const stack = this.stack;
    while (stack.length > 0) {
      if (this.out.saturated) return false;
      const level = stack[stack.length - 1] as Level;
      if (level.entries) {
        const next = level.entries.next();
        if (next.done) {
          writer.close();
          stack.pop();
          continue;
        }
        writer.memberPrefix();
        writer.keyLatin1(next.value[0]);
        this.write(next.value[1]);
      } else {
        const items = (level.node as TreeArray).items;
        if (level.index >= items.length) {
          writer.close();
          stack.pop();
          continue;
        }
        const item = items[level.index];
        level.index += 1;
        writer.memberPrefix();
        if (item === undefined) {
          writer.rawLatin1("null");
        } else {
          this.write(item);
        }
      }
    }
    return true;
  }

  private write(node: TreeNode): void {
    if (typeof node === "string") {
      this.writer.rawLatin1(node);
    } else if (node instanceof TreeObject) {
      this.writer.open(false);
      this.stack.push({ node, entries: node.entries.entries(), index: 0 });
    } else {
      this.writer.open(true);
      this.stack.push({ node, entries: undefined, index: 0 });
    }
  }
}
