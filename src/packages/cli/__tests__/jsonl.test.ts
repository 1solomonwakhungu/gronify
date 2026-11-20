import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { flattenStream } from "../src/flatten-stream";
import { createLineMatcher } from "../src/matcher";
import { GronOutput, type OutputOptions, type OutputSink } from "../src/output";
import { JsonSyntaxError, JsonTokenizer, type JsonSink } from "../src/tokenizer";

/** Records events as readable strings, decoding raw token bytes. */
class RecordingSink implements JsonSink {
  events: string[] = [];
  startObject(): void {
    this.events.push("{");
  }
  endObject(): void {
    this.events.push("}");
  }
  startArray(): void {
    this.events.push("[");
  }
  endArray(): void {
    this.events.push("]");
  }
  key(buf: Buffer, start: number, end: number): void {
    this.events.push(`key ${buf.toString("utf8", start, end)}`);
  }
  string(buf: Buffer, start: number, end: number): void {
    this.events.push(`str ${buf.toString("utf8", start, end)}`);
  }
  number(buf: Buffer, start: number, end: number): void {
    this.events.push(`num ${buf.toString("utf8", start, end)}`);
  }
  literal(buf: Buffer, start: number, end: number): void {
    this.events.push(`lit ${buf.toString("utf8", start, end)}`);
  }
}

function tokenizeLines(chunks: Array<Buffer | string>): string[] {
  const sink = new RecordingSink();
  const tokenizer = new JsonTokenizer(sink, undefined, { stream: true });
  for (const chunk of chunks) tokenizer.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
  tokenizer.end();
  return sink.events;
}

function lineError(text: string): JsonSyntaxError {
  try {
    tokenizeLines([text]);
  } catch (error) {
    expect(error).toBeInstanceOf(JsonSyntaxError);
    return error as JsonSyntaxError;
  }
  throw new Error(`expected ${JSON.stringify(text)} to be rejected`);
}

function memorySink(): { sink: OutputSink; text: () => string } {
  const parts: Buffer[] = [];
  let stream: Writable | null = null;
  const open = () =>
    (stream ??= new Writable({
      write(chunk: Buffer, _encoding, callback) {
        parts.push(Buffer.from(chunk));
        callback();
      },
    }));
  return {
    sink: {
      open,
      commit: () =>
        new Promise<void>((resolve) => {
          if (stream === null) return resolve();
          stream.once("close", () => resolve());
          stream.end();
        }),
      abort: async () => {
        stream?.destroy();
      },
    },
    text: () => Buffer.concat(parts).toString("utf8"),
  };
}

async function flattenText(
  chunks: Array<Buffer | string>,
  options: { stream?: boolean; sort?: boolean } = {},
  outputOptions: Partial<OutputOptions> = {},
): Promise<{ text: string; output: GronOutput }> {
  const { sink, text } = memorySink();
  const output = new GronOutput({ sink, ...outputOptions });
  await flattenStream(chunks, output, options);
  return { text: text(), output };
}

/** The same records as one JSON array, which `--stream` must flatten identically. */
function asArray(lines: string): string {
  const records = lines.split(/\r?\n/).filter((line) => line.trim() !== "");
  return `[${records.join(",")}]`;
}

const RECORDS = [
  '{"id":1,"user":{"name":"ann","tags":["a","b"]},"ok":true}',
  '{"z":12345678901234567890,"a":1.10,"n":-0,"e":1e2}',
  "[1,[2,[3]],{}]",
  '"just a string"',
  "42",
  "null",
  '{"key.with dots":"v","esc\\u0041ped":"\\u00e9\\n","b":[]}',
].join("\n");

describe("JsonTokenizer in JSON Lines mode", () => {
  test("reports every record as an element of one array", () => {
    expect(tokenizeLines(['{"a":1}\n[2]\n"s"\n3\ntrue\n'])).toEqual([
      "[",
      "{",
      'key "a"',
      "num 1",
      "}",
      "[",
      "num 2",
      "]",
      'str "s"',
      "num 3",
      "lit true",
      "]",
    ]);
  });

  test("skips blank and whitespace-only lines and accepts CRLF", () => {
    expect(tokenizeLines(['\n\r\n  \t\r\n{"a":1}\r\n\r\n \n7\r\n\n'])).toEqual(["[", "{", 'key "a"', "num 1", "}", "num 7", "]"]);
  });

  test("accepts a last record without a trailing newline, including a bare number", () => {
    expect(tokenizeLines(['{"a":1}\n12345678901234567890'])).toEqual(["[", "{", 'key "a"', "num 1", "}", "num 12345678901234567890", "]"]);
  });

  test("gives an empty array for empty or blank input", () => {
    expect(tokenizeLines([])).toEqual(["[", "]"]);
    expect(tokenizeLines([""])).toEqual(["[", "]"]);
    expect(tokenizeLines(["\n \r\n\t\n"])).toEqual(["[", "]"]);
  });

  test("gives the same events wherever the chunks split", () => {
    const text = `${RECORDS}\r\n\n  \n${RECORDS}\n`;
    const whole = tokenizeLines([text]);
    const bytes = Buffer.from(text);
    for (let cut = 1; cut < bytes.length; cut += 1) {
      expect(tokenizeLines([bytes.subarray(0, cut), bytes.subarray(cut)])).toEqual(whole);
    }
    const single = Array.from({ length: bytes.length }, (_, i) => bytes.subarray(i, i + 1));
    expect(tokenizeLines(single)).toEqual(whole);
  });

  test("rejects two values on one line with the line and byte offset", () => {
    const error = lineError('{"a":1}\n{"b":2} {"c":3}\n');
    expect(error.message).toContain("Unexpected '{' after the record on this line (JSON Lines allows one value per line)");
    expect(error.line).toBe(2);
    expect(error.offset).toBe(16);
    expect(error.column).toBe(9);
  });

  test("rejects a record that spans lines", () => {
    const error = lineError('{"a":1}\n{"b":\n2}\n');
    expect(error.message).toContain("Unexpected end of line inside a JSON Lines record");
    expect(error.line).toBe(2);
    expect(error.offset).toBe(13);
  });

  test("rejects a line that ends inside a string", () => {
    const error = lineError('{"a":"x\n"}\n');
    expect(error.message).toContain("Unterminated string: the line ends inside it");
    expect(error.line).toBe(1);
    expect(error.offset).toBe(7);
  });

  test("rejects an invalid line after valid ones and points at it", () => {
    const error = lineError('{"a":1}\r\n\r\n{"b":2}\r\n{"c":tru}\r\n');
    expect(error.message).toContain("Unexpected token 'tru', expected true, false or null");
    expect(error.line).toBe(4);
    expect(error.offset).toBe(25);
    expect(error.column).toBe(6);
  });

  test("rejects an incomplete last record", () => {
    const error = lineError('{"a":1}\n{"b":[1,2');
    expect(error.message).toContain("Unexpected end of input inside a JSON Lines record");
    expect(error.line).toBe(2);
  });

  test("rejects a stray closing bracket and a lone carriage return between records", () => {
    expect(lineError("]\n").message).toContain("Unexpected ']', expected a value");
    expect(lineError('{"a":1}\r{"b":2}\n').message).toContain("after the record on this line");
  });

  test("keeps single-document mode strict about trailing values", () => {
    const tokenizer = new JsonTokenizer(new RecordingSink());
    expect(() => tokenizer.write(Buffer.from('{"a":1}\n{"b":2}\n'))).toThrow("Unexpected '{' after the top-level value");
    expect(() => new JsonTokenizer(new RecordingSink()).end()).toThrow("empty document");
  });

  test("never claims the input is finished, since another record can always follow", () => {
    const tokenizer = new JsonTokenizer(new RecordingSink(), undefined, { stream: true });
    const chunk = Buffer.from('{"a":1}\n');
    tokenizer.write(chunk);
    expect(tokenizer.finishesAt(chunk, chunk.length)).toBe(false);
  });
});

describe("flattenStream in JSON Lines mode", () => {
  test("matches flattening the records as one array, with exact numbers and key order", async () => {
    const { text } = await flattenText([RECORDS + "\n"], { stream: true });
    const array = await flattenText([asArray(RECORDS)]);
    expect(text).toBe(array.text);
    expect(text.split("\n").slice(0, 3)).toEqual(["json = []", "json[0] = {}", "json[0].id = 1"]);
    expect(text).toContain("json[1].z = 12345678901234567890\njson[1].a = 1.10\njson[1].n = -0\njson[1].e = 1e2\n");
    expect(text).toContain('json[6]["key.with dots"] = "v"\njson[6].escAped = "é\\n"\n');
  });

  test("prints json = [] for empty input", async () => {
    expect((await flattenText([], { stream: true })).text).toBe("json = []\n");
    expect((await flattenText(["\r\n\n   \n"], { stream: true })).text).toBe("json = []\n");
  });

  test("sorts each record's keys and matches sorting the array", async () => {
    const { text } = await flattenText([RECORDS], { stream: true, sort: true });
    expect(text).toBe((await flattenText([asArray(RECORDS)], { sort: true })).text);
    expect(text).toContain("json[1] = {}\njson[1].a = 1.10\njson[1].e = 1e2\njson[1].n = -0\njson[1].z = 12345678901234567890\n");
  });

  test("numbers records past 9, 99 and 999 correctly", async () => {
    const lines = Array.from({ length: 1001 }, (_, i) => String(i)).join("\n");
    const { text } = await flattenText([lines], { stream: true });
    const out = text.trimEnd().split("\n");
    expect(out).toHaveLength(1002);
    expect(out[1]).toBe("json[0] = 0");
    expect(out[11]).toBe("json[10] = 10");
    expect(out[101]).toBe("json[100] = 100");
    expect(out[1001]).toBe("json[1000] = 1000");
  });

  test("stops at the limit without reading the rest", async () => {
    let pulled = 0;
    async function* records(): AsyncGenerator<Buffer> {
      for (let i = 0; ; i += 1) {
        pulled += 1;
        yield Buffer.from(`{"id":${i}}\n`);
        if (i > 10_000) throw new Error("read too far");
      }
    }
    const { text, output } = await flattenText(records() as unknown as Buffer[], { stream: true }, { limit: 4 });
    expect(text).toBe("json = []\njson[0] = {}\njson[0].id = 0\njson[1] = {}\n");
    expect(output.stopped).toBe(true);
    expect(output.exhausted).toBe(false);
    expect(pulled).toBeLessThan(5);
  });

  test("filters with a matcher and supports inverted matches", async () => {
    const matcher = createLineMatcher("ANN", { regex: false, caseSensitive: false });
    expect((await flattenText([RECORDS], { stream: true }, { matcher })).text).toBe('json[0].user.name = "ann"\n');
    const inverted = await flattenText(['{"a":1}\n{"b":2}\n'], { stream: true }, { matcher: createLineMatcher("json\\[\\d\\]\\.", { regex: true, caseSensitive: false }), invert: true });
    expect(inverted.text).toBe("json = []\njson[0] = {}\njson[1] = {}\n");
  });

  test("rejects an invalid line after streaming the records before it", async () => {
    await expect(flattenText(['{"a":1}\n', '{"a":}\n'], { stream: true })).rejects.toThrow(
      "Unexpected '}', expected a value at byte offset 13 (line 2, column 6)",
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// CLI integration (uses the built dist/index.js, like cli.test.ts)

function runCLI(args: string[], input?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("node", ["dist/index.js", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));
    child.on("close", (code) => resolve({ stdout, stderr: stderr.trim(), exitCode: code ?? 0 }));
    child.stdin.on("error", () => undefined); // the CLI may stop reading before all input is written
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

describe("CLI --stream / --jsonl", () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gronify-jsonl-"));
    file = join(dir, "records.jsonl");
    writeFileSync(file, `${RECORDS}\n`);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("flattens a .jsonl file like the same records as one array", async () => {
    const result = await runCLI(["flatten", "--stream", file]);
    const array = await runCLI(["flatten"], asArray(RECORDS));
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(array.stdout);
  });

  test("accepts -s, --stream and --jsonl in any position, from a file or stdin", async () => {
    const expected = (await runCLI(["flatten", "-s", file])).stdout;
    expect((await runCLI(["flatten", file, "--jsonl"])).stdout).toBe(expected);
    expect((await runCLI(["--no-color", "flatten", "--stream"], RECORDS)).stdout).toBe(expected);
    expect((await runCLI(["flatten", "-s"], `${RECORDS}\n`)).stdout).toBe(expected);
  });

  test("skips blank lines and CRLF endings", async () => {
    const result = await runCLI(["flatten", "-s"], '\r\n{"a":1}\r\n\r\n   \r\n{"b":[true]}\r\n\n');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("json = []\njson[0] = {}\njson[0].a = 1\njson[1] = {}\njson[1].b = []\njson[1].b[0] = true\n");
  });

  test("prints json = [] for an empty file and empty stdin", async () => {
    const empty = join(dir, "empty.jsonl");
    writeFileSync(empty, "");
    expect(await runCLI(["flatten", "-s", empty])).toMatchObject({ stdout: "json = []\n", exitCode: 0 });
    expect(await runCLI(["flatten", "-s"], "\n\n")).toMatchObject({ stdout: "json = []\n", exitCode: 0 });
  });

  test("keeps big integers and number spellings exactly", async () => {
    const result = await runCLI(["flatten", "--jsonl"], '{"big":123456789012345678901234567890}\n[1.10,-0,1E+2]\n');
    expect(result.stdout).toBe(
      "json = []\njson[0] = {}\njson[0].big = 123456789012345678901234567890\njson[1] = []\njson[1][0] = 1.10\njson[1][1] = -0\njson[1][2] = 1E+2\n",
    );
  });

  test("round-trips through unflatten to the array of records", async () => {
    for (const extra of [[], ["--sort"]]) {
      const flat = await runCLI(["flatten", "-s", ...extra, file]);
      const back = await runCLI(["unflatten"], flat.stdout);
      expect(back.exitCode).toBe(0);
      const expected = (await runCLI(["unflatten"], (await runCLI(["flatten", ...extra], asArray(RECORDS))).stdout)).stdout;
      expect(back.stdout).toBe(expected);
    }
    const back = await runCLI(["unflatten"], (await runCLI(["flatten", "-s"], '{"n":12345678901234567890,"f":1.10}\n')).stdout);
    expect(back.stdout.trim()).toBe('[{"n":12345678901234567890,"f":1.10}]');
  });

  test("reports an invalid line with its line number and byte offset", async () => {
    const result = await runCLI(["flatten", "-s"], '{"a":1}\n\n{"b":2,}\n');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("flattening JSON: Unexpected '}' after ',' (trailing commas are not allowed) at byte offset 16 (line 3, column 8)");
  });

  test("reports two values on one line", async () => {
    const result = await runCLI(["flatten", "--jsonl"], '{"a":1} {"b":2}\n');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("JSON Lines allows one value per line");
  });

  test("still rejects JSON Lines without the flag, with a hint", async () => {
    const result = await runCLI(["flatten"], '{"a":1}\n{"b":2}\n');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unexpected '{' after the top-level value at byte offset 8 (line 2, column 1)");
    expect(result.stderr).toContain("pass --stream (or --jsonl)");
    const search = await runCLI(["search", "a"], '{"a":1}\n{"b":2}\n');
    expect(search.exitCode).toBe(1);
    expect(search.stderr).toContain("pass --stream (or --jsonl)");
  });

  test("searches records with text, regex, case sensitivity, count and inversion", async () => {
    const text = await runCLI(["search", "-s", file, "ANN"]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('json[0].user.name = "ann"');

    const regex = await runCLI(["--no-color", "search", "--stream", "-r", file, "^json\\[1\\]\\.[az] "]);
    expect(regex.stdout).toBe("json[1].z = 12345678901234567890\njson[1].a = 1.10\n");

    expect((await runCLI(["search", "-s", "-c", file, "ANN"])).exitCode).toBe(0);
    expect((await runCLI(["search", "-s", "-c", file, "ANN"])).stderr).toContain("No matches");

    const count = await runCLI(["--no-color", "search", "-s", "--count", file, "json[0]"]);
    expect(count.stdout.trim()).toBe("8");

    const invert = await runCLI(["--no-color", "search", "-s", "-v", "-r", "\\.[ab] "], '{"a":1}\n{"b":2}\n');
    expect(invert.stdout).toBe("json = []\njson[0] = {}\njson[1] = {}\n");
  });

  test("applies --exit-status: 0 on a match, 1 on none, 2 on an invalid line", async () => {
    expect((await runCLI(["search", "-s", "--exit-status", file, "ann"])).exitCode).toBe(0);
    expect((await runCLI(["search", "-s", "--exit-status", file, "nothing-here"])).exitCode).toBe(1);
    expect((await runCLI(["search", "-s", "--exit-status", "a"], '{"a":1}\nnope\n')).exitCode).toBe(2);
  });

  describe("caps stop reading early", () => {
    let capped: string;

    beforeAll(() => {
      // Over 2 MiB of valid records, then an invalid line that is never reached.
      const lines: string[] = [];
      for (let i = 0; i < 40_000; i += 1) lines.push(`{"id":${i},"name":"user${i}","tags":["a","b"]}`);
      capped = join(dir, "capped.jsonl");
      writeFileSync(capped, `${lines.join("\n")}\nthis line is not JSON\n`);
    });

    test("--limit", async () => {
      const result = await runCLI(["flatten", "-s", "--limit", "3", capped]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("json = []\njson[0] = {}\njson[0].id = 0\n");
      expect(result.stderr).toContain("Stopped after 3 lines (--limit); there may be more");
    });

    test("-m/--max-count, also with --sort and --count", async () => {
      const result = await runCLI(["--no-color", "search", "-s", "-m", "2", capped, "user1"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('json[1].name = "user1"\njson[10].name = "user10"\n');

      const sorted = await runCLI(["--no-color", "search", "-s", "--sort", "-m", "2", capped, "json[1]"]);
      expect(sorted.stdout).toBe("json[1] = {}\njson[1].id = 1\n");

      const count = await runCLI(["--no-color", "search", "-s", "--count", "-m", "5", capped, "tags"]);
      expect(count.stdout.trim()).toBe("5");
      expect(count.exitCode).toBe(0);
    });

    test("from stdin", async () => {
      const result = await runCLI(["flatten", "-s", "--limit", "2"], readFileSync(capped, "utf8"));
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("json = []\njson[0] = {}\n");
    });

    test("without a cap the invalid line is reported", async () => {
      const result = await runCLI(["--no-color", "search", "-s", "--count", capped, "x"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("line 40001, column 1");
    });
  });

  test("sorts each record's keys and matches --sort on the array", async () => {
    const result = await runCLI(["flatten", "-s", "--sort", file]);
    expect(result.stdout).toBe((await runCLI(["flatten", "--sort"], asArray(RECORDS))).stdout);
  });

  test("works with --pretty and --color like the array form", async () => {
    for (const extra of [["--pretty"], ["--color"], ["--color", "--pretty"]]) {
      const result = await runCLI([...extra, "flatten", "-s", file]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe((await runCLI([...extra, "flatten"], asArray(RECORDS))).stdout);
    }
  });

  test("writes -o atomically and leaves no file on an invalid line", async () => {
    const out = join(dir, "out.gron");
    const ok = await runCLI(["-o", out, "flatten", "-s", file]);
    expect(ok.exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toBe((await runCLI(["flatten", "-s", file])).stdout);

    const bad = join(dir, "bad.gron");
    const failed = await runCLI(["-o", bad, "flatten", "-s"], '{"a":1}\n{oops}\n');
    expect(failed.exitCode).toBe(1);
    expect(existsSync(bad)).toBe(false);

    const kept = await runCLI(["-o", out, "flatten", "-s"], '{"a":1}\n{oops}\n');
    expect(kept.exitCode).toBe(1);
    expect(readFileSync(out, "utf8")).toBe((await runCLI(["flatten", "-s", file])).stdout);
  });

  test("does not warn about .jsonl or .ndjson extensions", async () => {
    const ndjson = join(dir, "records.ndjson");
    writeFileSync(ndjson, '{"a":1}\n');
    expect((await runCLI(["flatten", "-s", ndjson])).stderr).toBe("");
    expect((await runCLI(["flatten", "-s", file])).stderr).toBe("");
  });

  test("documents both spellings in help", async () => {
    for (const command of ["flatten", "search"]) {
      const help = await runCLI([command, "--help"]);
      expect(help.stdout).toContain("-s, --stream");
      expect(help.stdout).toContain("--jsonl");
      expect(help.stdout).toContain("JSON Lines / NDJSON");
    }
  });

  describe("fast-path parsing agrees with commander", () => {
    // `--opt=value` and `--` are only understood by commander, so each pair goes through both parsers.
    const pairs: Array<[string[], string[]]> = [
      [["flatten", "-s", "FILE"], ["flatten", "-s", "--", "FILE"]],
      [["flatten", "--jsonl", "--sort", "FILE"], ["flatten", "--stream", "--sort", "--", "FILE"]],
      [["flatten", "--stream", "--limit", "4", "FILE"], ["flatten", "--stream", "--limit=4", "FILE"]],
      [["search", "-s", "-m", "1", "FILE", "a"], ["search", "-s", "-m1", "FILE", "a"]],
      [["search", "--jsonl", "--count", "FILE", "json"], ["search", "--stream", "--count", "--", "FILE", "json"]],
    ];

    test.each(pairs)("%j behaves like %j", async (quick, full) => {
      const resolve = (args: string[]) => args.map((arg) => (arg === "FILE" ? file : arg));
      expect(await runCLI(resolve(quick))).toEqual(await runCLI(resolve(full)));
    });
  });
});
