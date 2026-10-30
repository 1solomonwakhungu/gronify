import { Writable } from "node:stream";
import { flattenJson, unflattenGron } from "../src/gron.js";
import { createMemoryOutput, unflattenStream, type UnflattenOptions } from "../src/unflatten-stream.js";
import { LineSplitter, type LineSink } from "../src/unflatten/lines.js";
import { LineParser, VALUE_EMPTY_ARRAY, VALUE_EMPTY_OBJECT, VALUE_INLINE, VALUE_SCALAR } from "../src/unflatten/parse.js";

async function* chunked(text: string | Buffer, size: number): AsyncGenerator<Buffer> {
  const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8");
  for (let offset = 0; offset < bytes.length; offset += size) yield bytes.subarray(offset, offset + size);
}

async function unflatten(
  gron: string | Buffer,
  options: UnflattenOptions = {},
  chunkSize = 1 << 20
): Promise<string> {
  const memory = createMemoryOutput();
  await unflattenStream(chunked(gron, chunkSize), memory.stream, options);
  return memory.text();
}

// ------------------------------------------------------------------ splitter

describe("LineSplitter", () => {
  function collect(chunks: Buffer[]): Array<[number, string]> {
    const lines: Array<[number, string]> = [];
    const sink: LineSink = {
      line(buf, start, end, lineNumber) {
        lines.push([lineNumber, buf.toString("utf8", start, end)]);
        return true;
      }
    };
    const splitter = new LineSplitter();
    for (const chunk of [...chunks, Buffer.from("\n")]) {
      splitter.feed(chunk);
      splitter.run(sink);
    }
    return lines;
  }

  const text = "json = {}\r\njson.a = 1;\n\njson.b = \"é中\"\njson.c = 2";
  const expected = text.split("\n").map((line, index): [number, string] => [index + 1, line]);

  test("yields every line when the input is cut at every position", () => {
    const bytes = Buffer.from(text, "utf8");
    for (let cut = 0; cut <= bytes.length; cut += 1) {
      expect(collect([bytes.subarray(0, cut), bytes.subarray(cut)])).toEqual(expected);
    }
  });

  test("yields every line when the input arrives in tiny chunks", () => {
    const bytes = Buffer.from(text, "utf8");
    for (const size of [1, 2, 3, 5, 8]) {
      const chunks: Buffer[] = [];
      for (let offset = 0; offset < bytes.length; offset += size) chunks.push(bytes.subarray(offset, offset + size));
      expect(collect(chunks)).toEqual(expected);
    }
  });

  test("stops when the sink pauses and continues from the next line", () => {
    const seen: string[] = [];
    let pauseOnce = true;
    const sink: LineSink = {
      line(buf, start, end) {
        seen.push(buf.toString("utf8", start, end));
        if (pauseOnce && seen.length === 2) {
          pauseOnce = false;
          return false;
        }
        return true;
      }
    };
    const splitter = new LineSplitter();
    splitter.feed(Buffer.from("a\nb\nc\nd\n"));
    expect(splitter.run(sink)).toBe(false);
    expect(seen).toEqual(["a", "b"]);
    expect(splitter.run(sink)).toBe(true);
    expect(seen).toEqual(["a", "b", "c", "d"]);
  });
});

// -------------------------------------------------------------- path parser

describe("LineParser paths", () => {
  const parser = new LineParser();

  function segments(line: string): Array<string | number> {
    expect(parser.parse(Buffer.from(line, "utf8"), 0, Buffer.byteLength(line), 1)).toBe(true);
    const result: Array<string | number> = [];
    for (let index = 0; index < parser.segCount; index += 1) {
      if (parser.segIsIndex[index] === 1) {
        result.push(parser.segIndex[index] as number);
      } else {
        const content = Buffer.from(parser.keyAsLatin1(index), "latin1").toString("utf8");
        result.push(JSON.parse(`"${content}"`) as string);
      }
    }
    return result;
  }

  function failure(line: string): string {
    try {
      parser.parse(Buffer.from(line, "utf8"), 0, Buffer.byteLength(line), 7);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error(`expected "${line}" to be rejected`);
  }

  test.each([
    ["json = {}", []],
    ["json.a.b = 1", ["a", "b"]],
    ["json[0] = 1", [0]],
    ["json[12][3].x = 1", [12, 3, "x"]],
    ["json.$ref._x1 = 1", ["$ref", "_x1"]],
    ['json["a b"] = 1', ["a b"]],
    ['json["a]b"] = 1', ["a]b"]],
    ['json["quote\\"d"].x = 1', ['quote"d', "x"]],
    ['json["back\\\\slash"] = 1', ["back\\slash"]],
    ['json["a=b"] = 1', ["a=b"]],
    ['json[""] = 1', [""]],
    ['json["é中"] = 1', ["é中"]],
    ['json["\\u0041"] = 1', ["A"]],
    ["json[ 7 ] = 1", [7]],
    ['json[ "x" ] = 1', ["x"]],
    ["json.a=1", ["a"]],
    ["  json.a   =   1  ;  ", ["a"]],
    ["json.a = 1\r", ["a"]],
    ["﻿json.a = 1", ["a"]]
  ])("parses %s", (line, expected) => {
    expect(segments(line)).toEqual(expected);
  });

  test("treats .name and [\"name\"] as the same key", () => {
    segments("json.name = 1");
    const dotted = parser.keyAsLatin1(0);
    segments('json["name"] = 1');
    expect(parser.keyAsLatin1(0)).toBe(dotted);
  });

  test.each([
    ["foo = 1", "line 7: expected a gron assignment"],
    ["jso = 1", "line 7: expected a gron assignment"],
    ["json.a", "line 7: expected a gron assignment"],
    ["json.a =", "line 7: expected a gron assignment"],
    ["json.a b", "line 7: expected a gron assignment"],
    ["json. = 1", "line 7: invalid property path"],
    ["json.1a = 1", "line 7: invalid property path"],
    ["json.a b = 1", "line 7: invalid character in path"],
    ["json.a- = 1", "line 7: invalid character in path"],
    ["json[abc] = 1", "line 7: invalid bracket property"],
    ["json[01] = 1", "line 7: invalid bracket property"],
    ["json[-1] = 1", "line 7: bracket properties must be strings or indexes"],
    ["json[1.5] = 1", "line 7: bracket properties must be strings or indexes"],
    ["json[true] = 1", "line 7: bracket properties must be strings or indexes"],
    ['json["a = 1', "line 7: unclosed bracket property"],
    ["json[0 = 1", "line 7: unclosed bracket property"],
    ["json[4294967295] = 1", "line 7: array index is too large"],
    ["json.a = nope", "line 7: invalid JSON value"]
  ])("rejects %s", (line, message) => {
    expect(failure(line)).toBe(message);
  });

  test("skips blank lines and lone semicolons", () => {
    for (const line of ["", "   ", "\r", ";", "  ;  ", "﻿"]) {
      expect(parser.parse(Buffer.from(line), 0, Buffer.byteLength(line), 1)).toBe(false);
    }
  });

  test("uses the line number it is given", () => {
    expect(() => parser.parse(Buffer.from("nope"), 0, 4, 42)).toThrow("line 42:");
  });
});

// ---------------------------------------------------------- value validator

describe("LineParser values", () => {
  const parser = new LineParser();

  function value(raw: string | Buffer): string {
    const line = Buffer.concat([Buffer.from("json.v = "), Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8")]);
    parser.parse(line, 0, line.length, 1);
    expect(parser.valueKind).toBe(VALUE_SCALAR);
    return parser.valueBuf.toString("utf8", parser.valueStart, parser.valueEnd);
  }

  function rejects(raw: string | Buffer): void {
    const line = Buffer.concat([Buffer.from("json.v = "), Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8")]);
    expect(() => parser.parse(line, 0, line.length, 3)).toThrow("line 3: invalid JSON value");
  }

  test.each(["0", "-0", "1", "-12.5", "1e-7", "1E+5", "0.5e10", "12345678901234567890", "-9007199254740993", "1.10", "1e999"])(
    "keeps number %s verbatim",
    (raw) => {
      expect(value(raw)).toBe(raw);
    }
  );

  test.each(["true", "false", "null"])("accepts %s", (raw) => {
    expect(value(raw)).toBe(raw);
  });

  test.each([
    '""',
    '"plain"',
    '"é中文 \u{1F600}"',
    '"a\\nb\\t\\"q\\"\\\\"',
    '"\\b\\f\\r"',
    '"  "',
    '"\\u001f"',
    '"\\ud800"',
    '"trailing;"',
    '"= equals"'
  ])("keeps canonical string %s verbatim", (raw) => {
    expect(value(raw)).toBe(raw);
    expect(value(raw)).toBe(JSON.stringify(JSON.parse(raw)));
  });

  test.each([
    ['"\\u0041"', '"A"'],
    ['"\\/"', '"/"'],
    ['"\\u00e9\\u4E2D"', '"é中"'],
    ['"\\uD83D\\uDE00"', '"\u{1F600}"'],
    ['"\\u001F"', '"\\u001f"'],
    ['"\\u000a"', '"\\n"'],
    ['"\\uD800"', '"\\ud800"'],
    ['"\\u0022"', '"\\""']
  ])("normalizes string %s", (raw, expected) => {
    expect(value(raw)).toBe(expected);
    expect(value(raw)).toBe(JSON.stringify(JSON.parse(raw)));
  });

  test("replaces invalid UTF-8 in strings the way decoding the file did", () => {
    const raw = Buffer.concat([Buffer.from('"a'), Buffer.from([0xff, 0xc3]), Buffer.from('b"')]);
    expect(value(raw)).toBe(JSON.stringify(JSON.parse(raw.toString("utf8"))));
  });

  test.each([
    "01",
    "1.",
    ".5",
    "+1",
    "-",
    "-a",
    "1e",
    "1e+",
    "0x10",
    "NaN",
    "Infinity",
    "tru",
    "True",
    "nulll",
    '"abc',
    'abc"',
    '"a"b"',
    '"a\\x"',
    '"a\\u12"',
    '"a\\"',
    '"tab\there"',
    "'single'",
    "{",
    "[1,",
    '{"a":}',
    "[1 2]",
    "1 2",
    '"a" "b"',
    "undefined"
  ])("rejects %s", (raw) => {
    rejects(raw);
  });

  test("tells empty containers from other values", () => {
    for (const [raw, kind] of [
      ["{}", VALUE_EMPTY_OBJECT],
      ["[]", VALUE_EMPTY_ARRAY],
      ["{ }", VALUE_EMPTY_OBJECT],
      ["[ ]", VALUE_EMPTY_ARRAY],
      ['{"a":[1,2]}', VALUE_INLINE],
      ["[1]", VALUE_INLINE]
    ] as const) {
      const line = Buffer.from(`json = ${raw}`);
      parser.parse(line, 0, line.length, 1);
      expect(parser.valueKind).toBe(kind);
    }
  });
});

// ------------------------------------------------------------------ emitter

describe("streaming unflatten", () => {
  test("rebuilds nested arrays and objects", async () => {
    const doc = { a: [1, [2, 3], { b: [] }], c: { d: { e: null } }, f: "x", "g h": [[]] };
    const out = await unflatten(flattenJson(doc));
    expect(out).toBe(`${JSON.stringify(doc)}\n`);
  });

  test("pretty output equals JSON.stringify(value, null, 2)", async () => {
    const doc = { a: [1, [2, 3], { b: [] }, {}], c: { d: { e: null } }, f: "x", g: [], h: {}, i: [[], [[]]] };
    const out = await unflatten(flattenJson(doc), { pretty: true });
    expect(out).toBe(`${JSON.stringify(doc, null, 2)}\n`);
  });

  test.each([
    ["{}", "{}"],
    ["[]", "[]"],
    ["5", "5"],
    ['"s"', '"s"'],
    ["null", "null"]
  ])("handles a root of %s", async (root, expected) => {
    expect(await unflatten(`json = ${root}\n`)).toBe(`${expected}\n`);
    expect(await unflatten(`json = ${root}\n`, { pretty: true })).toBe(`${expected}\n`);
  });

  test("fills array gaps with null", async () => {
    expect(await unflatten("json = []\njson[2] = 1\njson[5] = {}\njson[5].a = [] \njson[7] = 2\n")).toBe(
      '[null,null,1,null,null,{"a":[]},null,2]\n'
    );
    expect(await unflatten("json = {}\njson.a = []\njson.a[1] = 1\n", { pretty: true })).toBe(
      `${JSON.stringify({ a: [null, 1] }, null, 2)}\n`
    );
  });

  test("keeps numbers and literals as written", async () => {
    const gron = "json = []\njson[0] = 12345678901234567890\njson[1] = 1.10\njson[2] = -0\njson[3] = 1e-7\njson[4] = 1E5\n";
    expect(await unflatten(gron)).toBe("[12345678901234567890,1.10,-0,1e-7,1E5]\n");
  });

  test("normalizes escapes in strings and keys", async () => {
    const gron = 'json = {}\njson.a = "\\u0041\\/"\njson["\\u0062"] = "é"\njson.c = "x\\ny"\n';
    expect(await unflatten(gron)).toBe('{"a":"A/","b":"é","c":"x\\ny"}\n');
  });

  test("accepts CRLF, semicolons, blank lines, and a missing final newline", async () => {
    const out = await unflatten("json = {}\r\n\r\njson.a = 1;\r\n;\r\njson.b = [] ;\r\njson.b[0] = true");
    expect(out).toBe('{"a":1,"b":[true]}\n');
  });

  test("gives the same result for every chunk size", async () => {
    const doc = { a: [1, { b: "é中\\" }, []], "k]ey": { "q\"": [null, 1.5] }, z: "end" };
    const gron = flattenJson(doc);
    for (const size of [1, 2, 3, 7, 16, 100]) {
      expect(await unflatten(gron, {}, size)).toBe(`${JSON.stringify(doc)}\n`);
      expect(await unflatten(gron, { pretty: true }, size)).toBe(`${JSON.stringify(doc, null, 2)}\n`);
    }
  });

  test("emits one-line compound values", async () => {
    expect(await unflatten('json = {}\njson.a = {"b":[1,{"c":2}]}\njson.d = 1\n')).toBe('{"a":{"b":[1,{"c":2}]},"d":1}\n');
    expect(await unflatten('json = {}\njson.a = {"b":[1]}\n', { pretty: true })).toBe(
      `${JSON.stringify({ a: { b: [1] } }, null, 2)}\n`
    );
  });

  test("writes repeated object keys as they come and a JSON parser keeps the last", async () => {
    const out = await unflatten("json = {}\njson.a = 1\njson.b = 2\njson.a = 3\n");
    expect(out).toBe('{"a":1,"b":2,"a":3}\n');
    expect(JSON.parse(out)).toEqual({ a: 3, b: 2 });
  });

  test("a re-assigned container replaces the earlier one", async () => {
    const out = await unflatten("json = {}\njson.a = {}\njson.a.x = 1\njson.a = {}\njson.a.y = 2\n");
    expect(JSON.parse(out)).toEqual({ a: { y: 2 } });
  });

  test.each(["", "\n\n", ";\n  \n", "﻿\n"])("rejects input with no assignments: %j", async (input) => {
    await expect(unflatten(input)).rejects.toThrow("input contains no gron assignments");
  });

  test.each([
    ["json.a = 1\n", "line 1: root must be assigned before child paths"],
    ["json = {}\njson.a = nope\n", "line 2: invalid JSON value"],
    ["json = {}\n\nfoo = 1\n", "line 3: expected a gron assignment"],
    ["json = []\njson.a = 1\n", "line 2: array path requires a numeric index"],
    ["json = {}\njson[0] = 1\n", "line 2: property does not match its parent container"],
    ["json = {}\njson.user.name = 1\n", "line 2: parent path must be assigned before its children"]
  ])("reports %j", async (input, message) => {
    await expect(unflatten(input)).rejects.toThrow(message);
  });
});

describe("round trips", () => {
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const keys = ["a", "b", "id", "$x", "service.name", "with space", 'q"uote', "back\\slash", "br]ace", "é", "\u{1F600}", "", "a=b", "x;y", "line\nbreak", "ctl\u0001"];
  const strings = ["", "plain", 'q"', "\\", "nl\n", "tab\t", "é中", "\u{1F600}", "\u0000", " ", "a/b", "= ;", "[0]"];
  const numbers = [0, -0.5, 1, 42, 1e21, 1e-7, 123456789.125, -17, 5e-324];

  // The previous builder cannot read keys containing "=" (its path regex stops at the first one) or
  // values containing U+2028 (its line regex treats that as a line end), so those stay out of the
  // documents compared against it.
  function value(next: () => number, depth: number, legacySafe = false): unknown {
    const roll = next();
    if (depth > 5 || roll < 0.4) {
      const kind = next();
      if (kind < 0.3) {
        const text = strings[Math.floor(next() * strings.length)] as string;
        return legacySafe ? text.replace("\u2028", "") : text;
      }
      if (kind < 0.6) return numbers[Math.floor(next() * numbers.length)];
      if (kind < 0.8) return null;
      return next() < 0.5;
    }
    const size = Math.floor(next() * 5);
    if (roll < 0.7) return Array.from({ length: size }, () => value(next, depth + 1, legacySafe));
    const object: Record<string, unknown> = {};
    for (let index = 0; index < size; index += 1) {
      const key = keys[Math.floor(next() * keys.length)] as string;
      Object.defineProperty(object, legacySafe ? key.replace("=", "-") : key, {
        value: value(next, depth + 1, legacySafe),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return object;
  }

  test("flatten then unflatten gives back the document, compact and pretty", async () => {
    const next = random(1029);
    for (let round = 0; round < 150; round += 1) {
      const doc = value(next, 0);
      const gron = flattenJson(doc as never);
      const size = 1 + Math.floor(next() * 40);
      const compact = await unflatten(gron, {}, size);
      expect(JSON.parse(compact)).toEqual(doc);
      expect(compact).toBe(`${JSON.stringify(doc)}\n`);
      expect(await unflatten(gron, { pretty: true }, size)).toBe(`${JSON.stringify(doc, null, 2)}\n`);
    }
  });

  test("agrees with the in-memory builder on reordered input", async () => {
    const next = random(77);
    for (let round = 0; round < 80; round += 1) {
      const doc = value(next, 0, true);
      const lines = flattenJson(doc as never).split("\n");
      const orders = [[...lines].sort(), [...lines].sort().reverse().sort((a, b) => a.length - b.length)];
      for (const ordered of orders) {
        const gron = ordered.join("\n");
        let expected: unknown;
        try {
          expected = unflattenGron(gron);
        } catch (error) {
          await expect(unflatten(gron)).rejects.toThrow((error as Error).message);
          continue;
        }
        expect(JSON.parse(await unflatten(gron))).toEqual(expected);
      }
    }
  });
});

// ------------------------------------------------- out-of-order and fallback

describe("out-of-order input", () => {
  const sorted = ["json = []", ...Array.from({ length: 12 }, (_, index) => `json[${index}] = ${index}`)].sort().join("\n");

  test("lexically sorted indexes are rebuilt in memory before the first flush", async () => {
    expect(sorted.indexOf("json[10]")).toBeLessThan(sorted.indexOf("json[2]"));
    const out = await unflatten(sorted);
    expect(out).toBe(`${JSON.stringify(Array.from({ length: 12 }, (_, index) => index))}\n`);
  });

  test("the fallback also applies the pretty setting", async () => {
    const out = await unflatten(sorted, { pretty: true });
    expect(out).toBe(`${JSON.stringify(Array.from({ length: 12 }, (_, index) => index), null, 2)}\n`);
  });

  test("the fallback keeps numbers verbatim and fills gaps", async () => {
    const out = await unflatten("json = []\njson[5] = 12345678901234567890\njson[1] = 1.10\n");
    expect(out).toBe("[null,1.10,null,null,null,12345678901234567890]\n");
  });

  test("the fallback lets a later line extend a container that was already closed", async () => {
    const gron = 'json = {}\njson.a = {}\njson.b = 1\njson.a.x = 2\njson.c = [] \njson.a.y = {}\njson.a.y.z = 3\n';
    expect(JSON.parse(await unflatten(gron))).toEqual({ a: { x: 2, y: { z: 3 } }, b: 1, c: [] });
  });

  test("the fallback lets an assignment replace an earlier one", async () => {
    expect(JSON.parse(await unflatten("json = []\njson[0] = 1\njson[0] = 2\n"))).toEqual([2]);
    expect(JSON.parse(await unflatten("json = 1\njson = {}\njson.a = 1\n"))).toEqual({ a: 1 });
  });

  test("the fallback reports the old error for a missing parent", async () => {
    await expect(unflatten('json = {}\njson.user.name = "Alice"\n')).rejects.toThrow(
      "line 2: parent path must be assigned before its children"
    );
    await expect(unflatten("json = 5\njson.a = 1\n")).rejects.toThrow("line 2: property does not match its parent container");
  });

  test("writes nothing to the output before falling back", async () => {
    const writes: number[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        writes.push(chunk.length);
        callback();
      }
    });
    await unflattenStream(chunked(sorted, 1 << 20), stream);
    expect(writes).toHaveLength(1);
  });

  describe("after output has been flushed", () => {
    const ascending = ["json = []", ...Array.from({ length: 60 }, (_, index) => `json[${index}] = ${index}`)];

    test("fails with the line number and an explanation", async () => {
      const gron = `${ascending.join("\n")}\njson[3] = 99\n`;
      await expect(unflatten(gron, { budgetBytes: 64 }, 32)).rejects.toThrow(/^line 62: .*document-order gron/);
    });

    test("fails when a closed container is re-entered", async () => {
      const filler = Array.from({ length: 40 }, (_, index) => `json.a[${index}] = ${index}`);
      const gron = ["json = {}", "json.a = []", ...filler, "json.b = 1", "json.a[40] = 5"].join("\n");
      await expect(unflatten(gron, { budgetBytes: 64 }, 32)).rejects.toThrow(/^line 44: .*document-order gron/);
    });

    test("still streams document-order input of any size", async () => {
      const gron = `${ascending.join("\n")}\n`;
      expect(await unflatten(gron, { budgetBytes: 64 }, 32)).toBe(`${JSON.stringify(Array.from({ length: 60 }, (_, index) => index))}\n`);
    });

    test("input within the budget still falls back when read in tiny chunks", async () => {
      expect(JSON.parse(await unflatten(`${sorted}\n`, { budgetBytes: 1 << 20 }, 8))).toHaveLength(12);
    });
  });
});

// -------------------------------------------------- sparse arrays and flow

describe("backpressure", () => {
  test("streams a long run of array gaps without queueing it in memory", async () => {
    let maxQueued = 0;
    let total = 0;
    let tail = "";
    const stream = new Writable({
      highWaterMark: 64 * 1024,
      write(chunk: Buffer, _encoding, callback) {
        total += chunk.length;
        tail = (tail + chunk.toString("latin1")).slice(-16);
        maxQueued = Math.max(maxQueued, this.writableLength);
        setImmediate(callback);
      }
    });
    await unflattenStream(chunked("json = []\njson[3000000] = 1\n", 1 << 20), stream);
    expect(total).toBe(15_000_004);
    expect(tail.endsWith(",1]\n")).toBe(true);
    expect(maxQueued).toBeLessThan(16 * 1024 * 1024);
  });

  test("streams a long run of array gaps in the in-memory fallback too", async () => {
    let maxQueued = 0;
    let total = 0;
    const stream = new Writable({
      highWaterMark: 64 * 1024,
      write(chunk: Buffer, _encoding, callback) {
        total += chunk.length;
        maxQueued = Math.max(maxQueued, this.writableLength);
        setImmediate(callback);
      }
    });
    await unflattenStream(chunked("json = []\njson[2000000] = 1\njson[1] = 2\n", 1 << 20), stream);
    expect(total).toBe(10_000_001);
    expect(maxQueued).toBeLessThan(16 * 1024 * 1024);
  });

  test("surfaces a failing output stream", async () => {
    const stream = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        callback(new Error("disk full"));
      }
    });
    const gron = ["json = []", ...Array.from({ length: 20000 }, (_, index) => `json[${index}] = "${"x".repeat(100)}"`)].join("\n");
    await expect(unflattenStream(chunked(gron, 1 << 16), stream, { budgetBytes: 1024 })).rejects.toThrow("disk full");
  });
});
