const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type PathPart = string | number;

function appendPath(path: string, key: string | number): string {
  if (typeof key === "number") {
    return `${path}[${key}]`;
  }

  return identifierPattern.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

export function flattenJson(value: JsonValue): string {
  const lines: string[] = [];

  function visit(current: JsonValue, path: string): void {
    if (Array.isArray(current)) {
      lines.push(`${path} = []`);
      current.forEach((item, index) => visit(item, appendPath(path, index)));
      return;
    }

    if (current !== null && typeof current === "object") {
      lines.push(`${path} = {}`);
      Object.entries(current).forEach(([key, item]) => visit(item, appendPath(path, key)));
      return;
    }

    lines.push(`${path} = ${JSON.stringify(current)}`);
  }

  visit(value, "json");
  return lines.join("\n");
}

function parsePath(source: string, lineNumber: number): PathPart[] {
  if (!source.startsWith("json")) {
    throw new Error(`line ${lineNumber}: path must start with 'json'`);
  }

  const parts: PathPart[] = [];
  let index = 4;

  while (index < source.length) {
    if (source[index] === ".") {
      const match = source.slice(index + 1).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (!match) {
        throw new Error(`line ${lineNumber}: invalid property path`);
      }
      parts.push(match[0]);
      index += match[0].length + 1;
      continue;
    }

    if (source[index] === "[") {
      const end = findClosingBracket(source, index, lineNumber);
      const token = source.slice(index + 1, end).trim();
      if (/^(0|[1-9]\d*)$/.test(token)) {
        parts.push(Number(token));
      } else {
        let key: unknown;
        try {
          key = JSON.parse(token);
        } catch {
          throw new Error(`line ${lineNumber}: invalid bracket property`);
        }
        if (typeof key !== "string") {
          throw new Error(`line ${lineNumber}: bracket properties must be strings or indexes`);
        }
        parts.push(key);
      }
      index = end + 1;
      continue;
    }

    throw new Error(`line ${lineNumber}: invalid character in path`);
  }

  return parts;
}

function findClosingBracket(source: string, start: number, lineNumber: number): number {
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\" && inString) {
      escaped = true;
    } else if (character === '"') {
      inString = !inString;
    } else if (character === "]" && !inString) {
      return index;
    }
  }

  throw new Error(`line ${lineNumber}: unclosed bracket property`);
}

function assign(target: JsonValue, key: PathPart, value: JsonValue, lineNumber: number): void {
  if (Array.isArray(target)) {
    if (typeof key !== "number") {
      throw new Error(`line ${lineNumber}: array path requires a numeric index`);
    }
    target[key] = value;
    return;
  }

  if (target === null || typeof target !== "object" || typeof key !== "string") {
    throw new Error(`line ${lineNumber}: property does not match its parent container`);
  }

  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

export function unflattenGron(source: string): JsonValue {
  let root: JsonValue | undefined;

  source.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const lineNumber = lineIndex + 1;
    const line = rawLine.trim().replace(/;$/, "").trim();
    if (!line) return;

    const assignment = line.match(/^(json.*?)\s*=\s*(.+)$/);
    if (!assignment) {
      throw new Error(`line ${lineNumber}: expected a gron assignment`);
    }

    const pathSource = assignment[1];
    const valueSource = assignment[2];
    if (!pathSource || !valueSource) {
      throw new Error(`line ${lineNumber}: expected a gron assignment`);
    }

    const parts = parsePath(pathSource, lineNumber);
    let value: JsonValue;
    try {
      value = JSON.parse(valueSource) as JsonValue;
    } catch {
      throw new Error(`line ${lineNumber}: invalid JSON value`);
    }

    if (parts.length === 0) {
      root = value;
      return;
    }
    if (root === undefined) {
      throw new Error(`line ${lineNumber}: root must be assigned before child paths`);
    }

    let parent = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (part === undefined) {
        throw new Error(`line ${lineNumber}: invalid empty path segment`);
      }
      if (Array.isArray(parent) && typeof part === "number") {
        const child = parent[part];
        if (child === undefined) {
          throw new Error(`line ${lineNumber}: parent path must be assigned before its children`);
        }
        parent = child;
      } else if (parent !== null && typeof parent === "object" && !Array.isArray(parent) && typeof part === "string") {
        const child = parent[part];
        if (child === undefined) {
          throw new Error(`line ${lineNumber}: parent path must be assigned before its children`);
        }
        parent = child;
      } else {
        throw new Error(`line ${lineNumber}: path does not match its parent container`);
      }

    }

    const finalPart = parts[parts.length - 1];
    if (finalPart === undefined) {
      throw new Error(`line ${lineNumber}: invalid empty path`);
    }
    assign(parent, finalPart, value, lineNumber);
  });

  if (root === undefined) {
    throw new Error("input contains no gron assignments");
  }
  return root;
}
