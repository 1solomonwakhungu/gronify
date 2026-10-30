import { Writable } from "node:stream";
import { flattenStream, type FlattenOptions } from "../src/flatten-stream";
import { flattenJson } from "../src/gron";
import { createLineMatcher } from "../src/matcher";
import { GronOutput, type OutputOptions, type OutputSink } from "../src/output";

// The module object the sources call into, so a spy sees their calls (an `import *` namespace is a copy).
const fs = jest.requireActual<typeof import("node:fs")>("node:fs");

function streamSink(open: () => Writable): OutputSink {
  let stream: Writable | null = null;
  return {
    open: () => (stream ??= open()),
    commit: () =>
      new Promise<void>((resolve) => {
        if (stream === null) return resolve();
        stream.once("close", () => resolve());
        stream.end();
      }),
    abort: async () => {
      stream?.destroy();
    },
  };
}

interface Collected {
  text: string;
  output: GronOutput;
}

async function run(
  input: AsyncIterable<Buffer | string> | Array<Buffer | string>,
  options: Partial<OutputOptions> = {},
  flatten: FlattenOptions = { sort: true },
  sink?: Writable,
): Promise<Collected> {
  const parts: Buffer[] = [];
  const stream =
    sink ??
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        parts.push(Buffer.from(chunk));
        callback();
      },
    });
  const output = new GronOutput({ sink: streamSink(() => stream), ...options });
  await flattenStream(input as AsyncIterable<Buffer | string>, output, flatten);
  return { text: Buffer.concat(parts).toString("utf8"), output };
}

async function sorted(text: string, options: Partial<OutputOptions> = {}, sortMemory?: number): Promise<string> {
  return (await run([text], options, { sort: true, sortMemory })).text;
}

/** Rebuilds `value` with object keys in UTF-16 order. Only valid for documents without integer-like keys. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    Object.defineProperty(result, key, {
      value: sortKeys((value as Record<string, unknown>)[key]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function reference(text: string): string {
  return flattenJson(sortKeys(JSON.parse(text))) + "\n";
}

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("sorted flatten", () => {
  describe("ordering", () => {
    test("sorts object keys at every level and leaves array order alone", async () => {
      expect(await sorted('{"b":{"z":1,"a":[3,{"y":1,"x":2}]},"a":0,"c":[{"k":2,"j":1},9,1]}')).toBe(
        [
          "json = {}",
          "json.a = 0",
          "json.b = {}",
          "json.b.a = []",
          "json.b.a[0] = 3",
          "json.b.a[1] = {}",
          "json.b.a[1].x = 2",
          "json.b.a[1].y = 1",
          "json.b.z = 1",
          "json.c = []",
          "json.c[0] = {}",
          "json.c[0].j = 1",
          "json.c[0].k = 2",
          "json.c[1] = 9",
          "json.c[2] = 1",
          "",
        ].join("\n"),
      );
    });

    test("compares keys by UTF-16 code units, not numerically or by UTF-8 bytes", async () => {
      // "10" < "2" as strings; U+1F600 is the surrogate pair D83D DE00, which sorts before U+FF5E.
      const text = '{"2":0,"10":0,"～":0,"\u{1f600}":0,"B":0,"a":0,"":0}';
      expect(await sorted(text)).toBe(
        ["json = {}", 'json[""] = 0', 'json["10"] = 0', 'json["2"] = 0', "json.B = 0", "json.a = 0", 'json["\u{1f600}"] = 0', 'json["～"] = 0', ""].join(
          "\n",
        ),
      );
    });

    test("keeps duplicate keys together, in document order", async () => {
      expect(await sorted('{"b":1,"a":{"y":1,"x":2},"b":[2],"a":3}')).toBe(
        [
          "json = {}",
          "json.a = {}",
          "json.a.x = 2",
          "json.a.y = 1",
          "json.a = 3",
          "json.b = 1",
          "json.b = []",
          "json.b[0] = 2",
          "",
        ].join("\n"),
      );
    });

    test("handles escaped keys and empty containers", async () => {
      expect(await sorted('{"\\u0062":{},"a\\nb":[],"a":{"z":{}}}')).toBe(
        ["json = {}", 'json.a = {}', 'json.a.z = {}', 'json["a\\nb"] = []', "json.b = {}", ""].join("\n"),
      );
    });

    test("handles scalar roots and empty documents", async () => {
      expect(await sorted("7")).toBe("json = 7\n");
      expect(await sorted("{}")).toBe("json = {}\n");
      expect(await sorted("[]")).toBe("json = []\n");
      expect(await sorted("[[],{}]")).toBe("json = []\njson[0] = []\njson[1] = {}\n");
    });

    test("keeps numbers exactly as written", async () => {
      expect(await sorted('{"b":12345678901234567890,"a":1.10}')).toBe(
        "json = {}\njson.a = 1.10\njson.b = 12345678901234567890\n",
      );
    });

    test("is the same as the unsorted output for documents that are already sorted", async () => {
      const text = JSON.stringify({ a: [1, { b: 2, c: 3 }], d: { e: 4 } });
      const plain = (await run([text], {}, {})).text;
      expect(await sorted(text)).toBe(plain);
    });

    test("an array of records sorts each record and keeps record order", async () => {
      expect(await sorted('[{"b":1,"a":2},{"d":1,"c":2}]')).toBe(
        ["json = []", "json[0] = {}", "json[0].a = 2", "json[0].b = 1", "json[1] = {}", "json[1].c = 2", "json[1].d = 1", ""].join("\n"),
      );
    });
  });

  describe("randomized equivalence with a sorted in-memory flatten", () => {
    const keyAlphabet = ["a", "Z", "_", "$", "0", "9", " ", ".", "-", '"', "\\", "é", "日", "😀", "\n", "\u0000", "[", "]", "～"];

    function build(random: () => number, depth: number): unknown {
      const pick = random();
      if (depth > 4 || pick < 0.35) {
        const kind = Math.floor(random() * 4);
        if (kind === 0) return null;
        if (kind === 1) return random() < 0.5;
        if (kind === 2) return Math.floor((random() - 0.5) * 1e6);
        return Array.from({ length: Math.floor(random() * 8) }, () => keyAlphabet[Math.floor(random() * keyAlphabet.length)]).join("");
      }
      if (pick < 0.65) return Array.from({ length: Math.floor(random() * 6) }, () => build(random, depth + 1));
      const object: Record<string, unknown> = {};
      for (let i = Math.floor(random() * 8); i > 0; i -= 1) {
        // The trailing "k" keeps keys from being integer-like, which JSON.parse would reorder.
        const key =
          Array.from({ length: Math.floor(random() * 4) }, () => keyAlphabet[Math.floor(random() * keyAlphabet.length)]).join("") + "k";
        Object.defineProperty(object, key, { value: build(random, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return object;
    }

    function chunked(text: string, random: () => number): Buffer[] {
      const bytes = Buffer.from(text, "utf8");
      const cuts = Array.from({ length: Math.floor(random() * 4) }, () => Math.floor(random() * bytes.length)).sort((a, b) => a - b);
      const chunks = cuts.map((cut, i) => bytes.subarray(i === 0 ? 0 : cuts[i - 1], cut));
      chunks.push(bytes.subarray(cuts.length ? cuts[cuts.length - 1] : 0));
      return chunks;
    }

    test.each([
      ["the default memory limit", undefined],
      ["a 1 byte limit, so every buffer spills to disk", 1],
      ["a 300 byte limit", 300],
    ])("holds for random documents with %s", async (_name, sortMemory) => {
      const random = prng(20261030);
      for (let round = 0; round < 200; round += 1) {
        const text = JSON.stringify(build(random, 0), null, random() < 0.3 ? 2 : undefined);
        const got = (await run(chunked(text, random), {}, { sort: true, sortMemory })).text;
        expect({ text, got }).toEqual({ text, got: reference(text) });
      }
    });

    test("holds for random documents under a filter", async () => {
      const random = prng(77);
      const matcher = createLineMatcher("a", { caseSensitive: true });
      for (const invert of [false, true]) {
        for (let round = 0; round < 100; round += 1) {
          const text = JSON.stringify(build(random, 0));
          const expected = reference(text)
            .split("\n")
            .filter((line) => line !== "" && line.includes("a") !== invert)
            .map((line) => line + "\n")
            .join("");
          const got = (await run(chunked(text, random), { matcher, invert }, { sort: true, sortMemory: 200 })).text;
          expect({ text, got }).toEqual({ text, got: expected });
        }
      }
    });
  });

  describe("large objects", () => {
    function bigObject(keys: number): string {
      const members: string[] = [];
      for (let i = 0; i < keys; i += 1) {
        // A multiplicative walk gives keys in a scrambled order.
        const id = (i * 7919) % keys;
        members.push(`"k${id}":{"name":"n${id}","list":[${id},${id + 1}],"deep":{"z":1,"a":${id}}}`);
      }
      return `{${members.join(",")}}`;
    }

    test("spills to a temp file and still sorts", async () => {
      const open = jest.spyOn(fs, "openSync");
      try {
        const text = bigObject(2000);
        expect(await sorted(text, {}, 4096)).toBe(reference(text));
        expect(open.mock.calls.filter(([path]) => String(path).includes("gronify-sort-")).length).toBeGreaterThan(0);
      } finally {
        open.mockRestore();
      }
    });

    test("does not touch the disk when the data fits in memory", async () => {
      const open = jest.spyOn(fs, "openSync");
      try {
        const text = bigObject(200);
        expect(await sorted(text)).toBe(reference(text));
        expect(open.mock.calls.filter(([path]) => String(path).includes("gronify-sort-"))).toHaveLength(0);
      } finally {
        open.mockRestore();
      }
    });

    test("writes a block larger than the synchronous limit through the backpressured path", async () => {
      // About 3 MB of output from a root object: bigger than one synchronous emit, so it is queued and pumped.
      const text = bigObject(20000);
      const parts: Buffer[] = [];
      let waits = 0;
      const slow = new Writable({
        highWaterMark: 64 * 1024,
        write(chunk: Buffer, _encoding, callback) {
          parts.push(Buffer.from(chunk));
          waits += 1;
          setImmediate(callback);
        },
      });
      await run([text], {}, { sort: true, sortMemory: 1 << 20 }, slow);
      const written = Buffer.concat(parts).toString("utf8");
      expect(written).toBe(reference(text));
      expect(written.length).toBeGreaterThan(3 * 1024 * 1024);
      expect(waits).toBeGreaterThan(1);
    }, 30000);

    test("handles a single line longer than the spill read buffer", async () => {
      const long = "x".repeat(3 * 1024 * 1024);
      const text = JSON.stringify({ b: long, a: 1, c: { d: long, e: 2 } });
      expect(await sorted(text, {}, 1024)).toBe(reference(text));
    }, 30000);

    test("handles nesting far deeper than the call stack", async () => {
      const depth = 3000;
      const text = '{"b":0,"a":'.repeat(depth) + "1" + "}".repeat(depth);
      const lines = (await sorted(text)).split("\n");
      expect(lines[0]).toBe("json = {}");
      expect(lines.length).toBe(2 * depth + 2);
    }, 60000);
  });

  describe("streaming", () => {
    test("writes a top-level array as it is read instead of waiting for the end", async () => {
      const first = Buffer.from('[{"b":1,"a":2},');
      const seen: string[] = [];
      let sawOutputBeforeEnd = false;
      const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          seen.push(chunk.toString("utf8"));
          callback();
        },
      });
      async function* input(): AsyncGenerator<Buffer> {
        yield first;
        yield Buffer.from('{"d":1,"c":2}');
        // Two records are complete only after the second chunk; their lines must already be out.
        await new Promise((resolve) => setImmediate(resolve));
        sawOutputBeforeEnd = seen.join("").includes("json[1].c = 2");
        yield Buffer.from("]");
      }
      const result = await run(input(), {}, { sort: true }, sink);
      expect(sawOutputBeforeEnd).toBe(true);
      expect(result.text).toBe("");
      expect(seen.join("")).toBe(
        ["json = []", "json[0] = {}", "json[0].a = 2", "json[0].b = 1", "json[1] = {}", "json[1].c = 2", "json[1].d = 1", ""].join("\n"),
      );
    });

    test("streams arrays nested in arrays and sorts the records inside", async () => {
      expect(await sorted('[[{"b":1,"a":2}],[]]')).toBe(
        ["json = []", "json[0] = []", "json[0][0] = {}", "json[0][0].a = 2", "json[0][0].b = 1", "json[1] = []", ""].join("\n"),
      );
    });
  });

  describe("caps and formatting", () => {
    test("a limit applies to the sorted order and stops an array early", async () => {
      let pulled = 0;
      async function* input(): AsyncGenerator<Buffer> {
        yield Buffer.from("[");
        for (let i = 0; i < 1000; i += 1) {
          pulled += 1;
          yield Buffer.from(`${i ? "," : ""}{"b":${i},"a":${i}}`);
        }
        yield Buffer.from("]");
      }
      const result = await run(input(), { limit: 5 }, { sort: true });
      expect(result.text).toBe(["json = []", "json[0] = {}", "json[0].a = 0", "json[0].b = 0", "json[1] = {}", ""].join("\n"));
      expect(result.output.stopped).toBe(true);
      expect(pulled).toBeLessThan(10);
    });

    test("a limit on a root object is taken from the sorted order", async () => {
      const result = await run(['{"z":1,"y":2,"x":3}'], { limit: 2 }, { sort: true });
      expect(result.text).toBe("json = {}\njson.x = 3\n");
      expect(result.output.stopped).toBe(true);
    });

    test("a limit that exactly covers a block", async () => {
      const result = await run(['{"b":[1,2],"a":[3,4]}'], { limit: 3 }, { sort: true });
      expect(result.text).toBe("json = {}\njson.a = []\njson.a[0] = 3\n");
    });

    test("applies the line formatter to sorted lines", async () => {
      const result = await run(['{"b":1,"a":2}'], { format: (line) => `> ${line}` }, { sort: true });
      expect(result.text).toBe("> json = {}\n> json.a = 2\n> json.b = 1\n");
    });

    test("counts matches without needing order", async () => {
      const result = await run(['{"b":1,"a":2}'], { matcher: createLineMatcher("json"), countOnly: true });
      expect(result.output.matched).toBe(3);
    });
  });

  describe("errors", () => {
    test("rejects invalid JSON and cleans up", async () => {
      await expect(run(['{"b":1,"a":'], {}, { sort: true })).rejects.toThrow(/Unexpected end of input/);
      await expect(run(['{"b":1,"a":2,}'], {}, { sort: true, sortMemory: 1 })).rejects.toThrow(/trailing commas/);
    });
  });
});
