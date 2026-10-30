import { Writable } from "node:stream";
import { flattenStream } from "../src/flatten-stream";
import { flattenJson } from "../src/gron";
import { createLineMatcher } from "../src/matcher";
import { GronOutput, type OutputOptions, type OutputSink } from "../src/output";
import { JsonSyntaxError } from "../src/tokenizer";

/** A sink that ends the stream on commit and destroys it on abort, like a file sink without the rename. */
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
  writes: number;
  output: GronOutput;
}

async function run(
  chunks: Array<Buffer | string>,
  options: Partial<OutputOptions> = {},
  sink?: Writable,
): Promise<Collected> {
  const parts: Buffer[] = [];
  const stream =
    sink ??
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        parts.push(Buffer.from(chunk)); // blocks may be reused once a write is done
        callback();
      },
    });
  const output = new GronOutput({ sink: streamSink(() => stream), ...options });
  await flattenStream(chunks, output);
  return { text: Buffer.concat(parts).toString("utf8"), writes: parts.length, output };
}

async function flatten(text: string, options: Partial<OutputOptions> = {}): Promise<string> {
  return (await run([text], options)).text;
}

function oldFlatten(text: string): string {
  return flattenJson(JSON.parse(text)) + "\n";
}

describe("flattenStream", () => {
  describe("equivalence with flattenJson(JSON.parse(x))", () => {
    const documents: Record<string, unknown> = {
      object: { user: { id: 12345, name: "Alice", tags: ["a", "b"], active: true, nothing: null } },
      "nested arrays": [[1, [2, [3, []]]], [], [{}]],
      "empty containers": { a: {}, b: [], c: [{}, []] },
      "scalars at root": 7,
      "string root": "hello",
      "null root": null,
      "keys needing brackets": { "service.name": "api", 'quoted"key': 1, "with space": 2, "": 3, "a-b": 4, "1x": 5, é: 6 },
      "identifier-like keys": { _a: 1, $b: 2, A1: 3, camelCase: 4, __proto__x: 5, constructor: 6 },
      "unicode values": { text: "héllo wörld 日本語 😀", escapes: 'tab\there "quoted" back\\slash\nnewline\u0001ctl' },
      "lone surrogate": { s: "\ud800", key: 1 },
      "separator characters": { s: "a b c" },
      "numbers": [0, -1, 1.5, -2.5e-7, 1e21, 100, 0.1, 5e-324],
      "wide array": Array.from({ length: 1234 }, (_, i) => i),
      "array of records": Array.from({ length: 50 }, (_, i) => ({
        id: i,
        user: { name: `user${i}`, email: `u${i}@example.com`, tags: ["a", "b"] },
        status: "ok",
        score: 0,
      })),
      "long strings": { long: "x".repeat(100_000), key: "y".repeat(5000) },
    };

    test.each(Object.entries(documents))("%s", async (_name, value) => {
      for (const text of [JSON.stringify(value), JSON.stringify(value, null, 2)]) {
        expect(await flatten(text)).toBe(oldFlatten(text));
      }
    });

    test("holds for every chunk boundary", async () => {
      const text = JSON.stringify({ a: [1, "é\n", { "k k": null }, 12.5e3], é: 1.5, "\u0000": "x" }, null, 1);
      const bytes = Buffer.from(text, "utf8");
      const expected = oldFlatten(text);
      for (let index = 0; index <= bytes.length; index += 1) {
        const result = await run([bytes.subarray(0, index), bytes.subarray(index)]);
        expect(result.text).toBe(expected);
      }
    });

    test("holds for one-byte chunks", async () => {
      const text = JSON.stringify(documents["keys needing brackets"]);
      const bytes = Buffer.from(text);
      const chunks = Array.from(bytes, (_, i) => Buffer.from(bytes.subarray(i, i + 1)));
      expect((await run(chunks)).text).toBe(oldFlatten(text));
    });

    test("holds for outputs spanning many blocks and for tiny blocks", async () => {
      const text = JSON.stringify(documents["array of records"]);
      expect(await flatten(text, { blockSize: 64 })).toBe(oldFlatten(text));
      expect((await run([text], { blockSize: 64 })).writes).toBeGreaterThan(10);
    });
  });

  describe("randomized equivalence", () => {
    // Small deterministic PRNG so failures are reproducible.
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

    const keyAlphabet = ["a", "Z", "_", "$", "0", "9", " ", ".", "-", '"', "\\", "é", "日", "😀", "\n", "\u0000", "[", "]"];
    const textAlphabet = [...keyAlphabet, "x", "/", "\t", " ", "\u007f", "\ud800", "\ude00"];

    function build(random: () => number, depth: number): unknown {
      const pick = random();
      if (depth > 4 || pick < 0.35) {
        const kind = Math.floor(random() * 6);
        if (kind === 0) return null;
        if (kind === 1) return random() < 0.5;
        if (kind === 2) return Math.floor((random() - 0.5) * 1e6);
        if (kind === 3) return (random() - 0.5) * 10 ** Math.floor(random() * 40 - 20);
        const length = Math.floor(random() * 12);
        return Array.from({ length }, () => textAlphabet[Math.floor(random() * textAlphabet.length)]).join("");
      }
      if (pick < 0.65) return Array.from({ length: Math.floor(random() * 5) }, () => build(random, depth + 1));
      const object: Record<string, unknown> = {};
      for (let i = Math.floor(random() * 5); i > 0; i -= 1) {
        // The trailing "k" keeps keys from being integer-like, which JSON.parse would reorder.
        const key =
          Array.from({ length: Math.floor(random() * 6) }, () => keyAlphabet[Math.floor(random() * keyAlphabet.length)]).join("") + "k";
        Object.defineProperty(object, key, { value: build(random, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return object;
    }

    test("matches the in-memory flattener for random documents split at random points", async () => {
      const random = prng(20261029);
      for (let round = 0; round < 300; round += 1) {
        const text = JSON.stringify(build(random, 0), null, random() < 0.3 ? 2 : undefined);
        const bytes = Buffer.from(text, "utf8");
        const cuts = Array.from({ length: Math.floor(random() * 4) }, () => Math.floor(random() * bytes.length)).sort((a, b) => a - b);
        const chunks = cuts.map((cut, i) => bytes.subarray(i === 0 ? 0 : cuts[i - 1], cut));
        chunks.push(bytes.subarray(cuts.length ? cuts[cuts.length - 1] : 0));
        expect({ text, got: (await run(chunks)).text }).toEqual({ text, got: oldFlatten(text) });
      }
    });
  });

  describe("intentional differences from JSON.parse", () => {
    test("emits numbers exactly as written", async () => {
      expect(await flatten("[12345678901234567890, 1.10, 1e2, -0, 0.0, 1E+2, 1e-7]")).toBe(
        [
          "json = []",
          "json[0] = 12345678901234567890",
          "json[1] = 1.10",
          "json[2] = 1e2",
          "json[3] = -0",
          "json[4] = 0.0",
          "json[5] = 1E+2",
          "json[6] = 1e-7",
          "",
        ].join("\n"),
      );
    });

    test("keeps object keys in document order, including integer-like keys", async () => {
      expect(await flatten('{"b":1,"2":2,"a":3,"1":4}')).toBe(
        ['json = {}', 'json.b = 1', 'json["2"] = 2', 'json.a = 3', 'json["1"] = 4', ""].join("\n"),
      );
    });

    test("emits every occurrence of a duplicate key", async () => {
      expect(await flatten('{"a":1,"a":{"b":2},"a":[3]}')).toBe(
        ["json = {}", "json.a = 1", "json.a = {}", "json.a.b = 2", "json.a = []", "json.a[0] = 3", ""].join("\n"),
      );
    });
  });

  describe("strings and keys", () => {
    test("normalizes escapes to what JSON.stringify produces", async () => {
      const text = '["\\u00e9\\/\\u000a\\ud83d\\ude00\\ud800\\"\\\\\\u0041"]';
      expect(await flatten(text)).toBe(oldFlatten(text));
      expect(await flatten(text)).toContain('json[0] = "é/\\n😀\\ud800\\"\\\\A"');
    });

    test("decodes escaped keys before deciding between dot and bracket form", async () => {
      expect(await flatten('{"\\u0061bc":1,"a\\nb":2,"a\\"b":3,"\\u00e9":4}')).toBe(
        ["json = {}", "json.abc = 1", 'json["a\\nb"] = 2', 'json["a\\"b"] = 3', 'json["é"] = 4', ""].join("\n"),
      );
    });

    test("handles an object key that is not an identifier", async () => {
      expect(await flatten('{"__proto__":1,"constructor":{"prototype":2}}')).toBe(
        ["json = {}", "json.__proto__ = 1", "json.constructor = {}", "json.constructor.prototype = 2", ""].join("\n"),
      );
    });
  });

  describe("deep and large structures", () => {
    test("flattens nesting far beyond the recursion limit", async () => {
      const depth = 5000;
      const text = '{"a":'.repeat(depth) + "1" + "}".repeat(depth);
      const result = await run([text]);
      const lines = result.text.split("\n");
      expect(lines).toHaveLength(depth + 2);
      expect(lines[0]).toBe("json = {}");
      expect(lines[depth]).toBe(`json${".a".repeat(depth)} = 1`);
    });

    test("writes a line larger than the block size", async () => {
      const depth = 1500;
      const text = "[".repeat(depth) + "]".repeat(depth);
      const result = await run([text], { blockSize: 1024 });
      const lines = result.text.split("\n");
      expect(lines).toHaveLength(depth + 1);
      expect(lines[depth - 1]).toBe(`json${"[0]".repeat(depth - 1)} = []`);
    });

    test("writes multi-digit array indexes", async () => {
      const result = await flatten("[" + "0,".repeat(1234) + "0]");
      expect(result).toContain("json[1234] = 0\n");
      expect(result).toContain("json[999] = 0\n");
      expect(result).toContain("json[10] = 0\n");
    });
  });

  describe("backpressure", () => {
    test("pauses the tokenizer while the stream is full and resumes on drain", async () => {
      const written: Buffer[] = [];
      let pendingCallbacks = 0;
      let maxQueued = 0;
      const stream = new Writable({
        highWaterMark: 256,
        write(chunk: Buffer, _encoding, callback) {
          written.push(Buffer.from(chunk));
          pendingCallbacks += 1;
          maxQueued = Math.max(maxQueued, stream.writableLength);
          setImmediate(() => {
            pendingCallbacks -= 1;
            callback();
          });
        },
      });
      const text = JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: i, name: `n${i}` })));
      const result = await run([text], { blockSize: 512 }, stream);
      expect(result.text).toBe("");
      expect(Buffer.concat(written).toString("utf8")).toBe(oldFlatten(text));
      expect(pendingCallbacks).toBe(0);
      // One chunk produces ~60 KB of output; without pausing it would all be queued at once.
      expect(maxQueued).toBeLessThan(4096);
    });

    test("rejects when the destination fails", async () => {
      const stream = new Writable({
        write(_chunk, _encoding, callback) {
          callback(new Error("disk full"));
        },
      });
      await expect(run([JSON.stringify(Array(5000).fill("x"))], { blockSize: 128 }, stream)).rejects.toThrow("disk full");
    });
  });

  describe("errors", () => {
    test("rejects with a positioned syntax error", async () => {
      await expect(flatten('{"a":1,}')).rejects.toBeInstanceOf(JsonSyntaxError);
      await expect(flatten('{"a":1,}')).rejects.toThrow(/byte offset 7 \(line 1, column 8\)/);
    });

    test("keeps output that was already flushed and drops the unflushed tail", async () => {
      const parts: Buffer[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          parts.push(Buffer.from(chunk)); // blocks may be reused once a write is done
          callback();
        },
      });
      const output = new GronOutput({ sink: streamSink(() => stream) });
      await expect(flattenStream(['["a",', '"b",', "?"], output)).rejects.toBeInstanceOf(JsonSyntaxError);
      // Each chunk is flushed once fully processed, so everything before the bad chunk was written.
      expect(Buffer.concat(parts).toString("utf8")).toBe('json = []\njson[0] = "a"\njson[1] = "b"\n');
    });

    test("does not create the destination when nothing was produced", async () => {
      const open = jest.fn(() => new Writable({ write: (_c, _e, cb) => cb() }));
      const output = new GronOutput({ sink: streamSink(open) });
      await expect(flattenStream(["?"], output)).rejects.toBeInstanceOf(JsonSyntaxError);
      expect(open).not.toHaveBeenCalled();
    });

    test("rejects an empty document and trailing data", async () => {
      await expect(flatten("")).rejects.toThrow(/empty document/);
      await expect(flatten("{} {}")).rejects.toThrow(/after the top-level value/);
    });
  });

  describe("search filtering", () => {
    const text = JSON.stringify({ user: { name: "Alice", id: 1 }, posts: [{ title: "Hello" }, { title: "World" }] });

    function search(term: string, extra: Partial<OutputOptions> & { regex?: boolean; caseSensitive?: boolean } = {}) {
      const { regex, caseSensitive, ...rest } = extra;
      return run([text], {
        matcher: createLineMatcher(term, { regex: Boolean(regex), caseSensitive: Boolean(caseSensitive) }),
        ...rest,
      });
    }

    test("keeps only matching lines, case-insensitively by default", async () => {
      const result = await search("ALICE");
      expect(result.text).toBe('json.user.name = "Alice"\n');
      expect(result.output.matched).toBe(1);
    });

    test("supports case-sensitive, regex, invert and count", async () => {
      expect((await search("ALICE", { caseSensitive: true })).text).toBe("");
      expect((await search("posts\\[\\d+\\]\\.title", { regex: true })).text).toBe(
        'json.posts[0].title = "Hello"\njson.posts[1].title = "World"\n',
      );
      const inverted = await search("posts", { invert: true });
      expect(inverted.text).toBe('json = {}\njson.user = {}\njson.user.name = "Alice"\njson.user.id = 1\n');
      const counted = await search("posts", { countOnly: true });
      expect(counted.text).toBe("");
      expect(counted.output.matched).toBe(5);
    });

    test("applies a line formatter only to kept lines", async () => {
      const result = await search("title", { format: (line) => `> ${line}` });
      expect(result.text).toBe('> json.posts[0].title = "Hello"\n> json.posts[1].title = "World"\n');
    });
  });
});
