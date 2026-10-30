import { Readable, Writable } from "node:stream";
import { flattenStream } from "../src/flatten-stream";
import { createLineMatcher } from "../src/matcher";
import { GronOutput, type OutputOptions, type OutputSink } from "../src/output";

function streamSink(stream: Writable): OutputSink {
  let opened = false;
  return {
    open: () => {
      opened = true;
      return stream;
    },
    commit: () =>
      new Promise<void>((resolve) => {
        if (!opened) return resolve();
        stream.once("close", () => resolve());
        stream.end();
      }),
    abort: async () => {
      stream.destroy();
    },
  };
}

function collector(): { stream: Writable; text: () => string } {
  const parts: Buffer[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      parts.push(Buffer.from(chunk));
      callback();
    },
  });
  return { stream, text: () => Buffer.concat(parts).toString("utf8") };
}

async function run(
  input: AsyncIterable<Buffer | string> | Array<Buffer | string>,
  options: Partial<OutputOptions> = {},
  sort = false,
): Promise<{ text: string; output: GronOutput }> {
  const { stream, text } = collector();
  const output = new GronOutput({ sink: streamSink(stream), ...options });
  await flattenStream(input as AsyncIterable<Buffer | string>, output, { sort });
  return { text: text(), output };
}

const DOC = JSON.stringify({
  users: [
    { id: 1, name: "ann", tags: ["a", "b"] },
    { id: 2, name: "bob", tags: [] },
  ],
  meta: { total: 2, next: null, ok: true },
  note: "ünïcode é",
});

describe("line limit", () => {
  test("every limit yields the first n lines of the unlimited output", async () => {
    const full = (await run([DOC])).text.split("\n").slice(0, -1);
    expect(full.length).toBeGreaterThan(15);
    for (const sort of [false, true]) {
      const expected = sort ? (await run([DOC], {}, true)).text.split("\n").slice(0, -1) : full;
      for (let limit = 1; limit <= expected.length + 2; limit += 1) {
        const result = await run([DOC], { limit }, sort);
        expect({ sort, limit, text: result.text }).toEqual({ sort, limit, text: expected.slice(0, limit).map((line) => line + "\n").join("") });
        expect(result.output.stopped).toBe(limit <= expected.length);
        expect(result.output.matched).toBe(Math.min(limit, expected.length));
      }
    }
  });

  test("holds when the input is split into one-byte chunks", async () => {
    const bytes = Buffer.from(DOC);
    const chunks = Array.from(bytes, (_, i) => bytes.subarray(i, i + 1));
    const result = await run(chunks, { limit: 7 });

    expect(result.text.split("\n")).toHaveLength(8);
    expect(result.output.stopped).toBe(true);
  });

  test("a limit of exactly the line count marks the output as stopped", async () => {
    const result = await run(["[1,2]"], { limit: 3 });

    expect(result.text).toBe("json = []\njson[0] = 1\njson[1] = 2\n");
    expect(result.output.stopped).toBe(true);
  });

  test("a limit larger than the output does not mark it as stopped", async () => {
    const result = await run(["[1,2]"], { limit: 4 });

    expect(result.output.stopped).toBe(false);
  });

  test("ends the read at the limit: later chunks are never pulled, even invalid ones", async () => {
    let pulled = 0;
    async function* input(): AsyncGenerator<Buffer> {
      pulled += 1;
      yield Buffer.from("[1,2,3,");
      pulled += 1;
      yield Buffer.from("not json at all");
      pulled += 1;
      yield Buffer.from("]");
    }
    const result = await run(input(), { limit: 2 });

    expect(result.text).toBe("json = []\njson[0] = 1\n");
    expect(pulled).toBe(1);
  });

  test("a limit reached inside one chunk ignores the rest of that chunk", async () => {
    const result = await run(['[1,2,3,4,5,6,7,8,9,10, not json'], { limit: 4 });

    expect(result.text).toBe("json = []\njson[0] = 1\njson[1] = 2\njson[2] = 3\n");
  });

  test("destroys a readable input", async () => {
    const input = new Readable({ read() {} });
    input.push(Buffer.from("[1,2,3,4,5"));
    const result = await run(input, { limit: 2 });

    expect(result.text).toBe("json = []\njson[0] = 1\n");
    expect(input.destroyed).toBe(true);
  });

  test("works on a large flattened document without reading all of it", async () => {
    let pulled = 0;
    async function* input(): AsyncGenerator<Buffer> {
      yield Buffer.from("[");
      const row = Buffer.from('{"id":1,"status":"ok"},'.repeat(10_000));
      for (let i = 0; i < 100_000; i += 1) {
        pulled += 1;
        yield row;
      }
    }
    const result = await run(input(), { limit: 25 });

    expect(result.text.split("\n")).toHaveLength(26);
    expect(pulled).toBe(1);
  });

  test("applies the line formatter to the capped lines only", async () => {
    const seen: string[] = [];
    const result = await run([DOC], {
      limit: 2,
      format: (line) => {
        seen.push(line);
        return `> ${line}`;
      },
    });

    expect(result.text).toBe("> json = {}\n> json.users = []\n");
    expect(seen).toEqual(["json = {}", "json.users = []"]);
  });

  test("stops the sink from waiting on a blocked stream", async () => {
    const parts: Buffer[] = [];
    const slow = new Writable({
      highWaterMark: 16,
      write(chunk: Buffer, _encoding, callback) {
        parts.push(Buffer.from(chunk));
        setImmediate(callback);
      },
    });
    const output = new GronOutput({ sink: streamSink(slow), limit: 200, blockSize: 64 });
    const body = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ i })));
    await flattenStream([body], output);

    expect(Buffer.concat(parts).toString("utf8").split("\n")).toHaveLength(201);
    expect(output.stopped).toBe(true);
  });
});

describe("match limit", () => {
  const matcher = createLineMatcher("name");

  test("caps matching lines and keeps document order", async () => {
    const result = await run([DOC], { matcher, limit: 1 });

    expect(result.text).toBe('json.users[0].name = "ann"\n');
    expect(result.output.matched).toBe(1);
    expect(result.output.stopped).toBe(true);
  });

  test("with invert it caps the non-matching lines", async () => {
    const result = await run([DOC], { matcher, invert: true, limit: 3 });

    expect(result.text).toBe("json = {}\njson.users = []\njson.users[0] = {}\n");
  });

  test("with countOnly it counts up to the limit and writes nothing", async () => {
    const capped = await run([DOC], { matcher, countOnly: true, limit: 1 });
    const unlimited = await run([DOC], { matcher, countOnly: true });

    expect(capped.text).toBe("");
    expect(capped.output.matched).toBe(1);
    expect(capped.output.stopped).toBe(true);
    expect(unlimited.output.matched).toBe(2);
    expect(unlimited.output.stopped).toBe(false);
  });

  test("a matcher that never matches reads the whole input", async () => {
    const result = await run([DOC], { matcher: createLineMatcher("zzzz"), limit: 5 });

    expect(result.output.matched).toBe(0);
    expect(result.output.stopped).toBe(false);
  });

  test("with sort the cap is taken in sorted order", async () => {
    const result = await run(['{"b":{"name":1},"a":{"name":2}}'], { matcher, limit: 1 }, true);

    expect(result.text).toBe("json.a.name = 2\n");
  });
});

describe("GronOutput.appendLines", () => {
  function setup(options: Partial<OutputOptions> = {}): { output: GronOutput; text: () => string } {
    const { stream, text } = collector();
    return { output: new GronOutput({ sink: streamSink(stream), ...options }), text };
  }

  test("writes whole lines in bulk and counts them", async () => {
    const { output, text } = setup();
    const lines = Buffer.from("a = 1\nb = 2\nc = 3\n");

    output.appendLines(lines, 0, lines.length, 3);
    await output.finish(true);

    expect(text()).toBe("a = 1\nb = 2\nc = 3\n");
    expect(output.matched).toBe(3);
    expect(output.stopped).toBe(false);
  });

  test("counts the lines itself when told the count is unknown", async () => {
    const { output } = setup({ limit: 10 });
    const lines = Buffer.from("a\nb\n");

    output.appendLines(lines, 0, lines.length, -1);

    expect(output.matched).toBe(2);
  });

  test("honours a start offset and an end that is not the end of the buffer", async () => {
    const { output, text } = setup();
    const lines = Buffer.from("skip\nb = 2\nc = 3\nskip\n");

    output.appendLines(lines, 5, 17, 2);
    await output.finish(true);

    expect(text()).toBe("b = 2\nc = 3\n");
  });

  test("stops in the middle of a chunk when the limit falls inside it", async () => {
    const { output, text } = setup({ limit: 2 });
    const lines = Buffer.from("a\nb\nc\nd\n");

    output.appendLines(lines, 0, lines.length, 4);
    output.appendLines(lines, 0, lines.length, 4);
    await output.finish(true);

    expect(text()).toBe("a\nb\n");
    expect(output.matched).toBe(2);
    expect(output.stopped).toBe(true);
  });

  test("formats each line and respects the limit", async () => {
    const { output, text } = setup({ limit: 2, format: (line) => line.toUpperCase() });
    const lines = Buffer.from("a\nb\nc\n");

    output.appendLines(lines, 0, lines.length, 3);
    await output.finish(true);

    expect(text()).toBe("A\nB\n");
  });

  test("writes a chunk larger than the block size", async () => {
    const { output, text } = setup({ blockSize: 16 });
    const lines = Buffer.from(`${"x".repeat(100)}\n${"y".repeat(100)}\n`);

    output.appendLines(lines, 0, lines.length, 2);
    await output.finish(true);

    expect(text()).toBe(lines.toString());
  });

  test("ignores empty ranges and calls after the stop", async () => {
    const { output, text } = setup({ limit: 1 });
    const lines = Buffer.from("a\nb\n");

    output.appendLines(lines, 2, 2, 0);
    output.appendLines(lines, 0, 4, 2);
    output.appendLines(lines, 0, 4, 2);
    await output.finish(true);

    expect(text()).toBe("a\n");
  });
});
