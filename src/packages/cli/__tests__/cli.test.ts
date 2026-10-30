import { spawn, spawnSync } from "child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { flattenJson } from "../src/gron";

// Helper function to run CLI commands and capture output
function runCLI(
  args: string[],
  input?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("node", ["dist/index.js", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
    }

    child.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
      });
    });

    // Send input if provided
    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }
  });
}

/**
 * Document-order gron of at least `mebibytes` MiB (an array of small records), with the compact JSON it unflattens
 * to. Everything is built from strings, so the test does not depend on the code under test.
 */
function bigGron(mebibytes: number): { gron: string; json: string } {
  const gron: string[] = ["json = []"];
  const json: string[] = [];
  let size = 0;
  for (let index = 0; size < mebibytes * 1024 * 1024; index += 1) {
    const record = [
      `json[${index}] = {}`,
      `json[${index}].id = ${index}`,
      `json[${index}].name = "record-${index}"`,
      `json[${index}].tags = []`,
      `json[${index}].tags[0] = "t${index % 7}"`,
    ].join("\n");
    gron.push(record);
    json.push(`{"id":${index},"name":"record-${index}","tags":["t${index % 7}"]}`);
    size += record.length + 1;
  }
  return { gron: `${gron.join("\n")}\n`, json: `[${json.join(",")}]\n` };
}

describe("Gronify CLI", () => {
  const testJSONFile = join(process.cwd(), "__tests__", "test.json");
  const testGronFile = join(process.cwd(), "__tests__", "test.gron");
  let testJSON: any;
  let testGron: string;

  beforeAll(() => {
    // Read test data from files
    testJSON = JSON.parse(readFileSync(testJSONFile, "utf8"));
    testGron = readFileSync(testGronFile, "utf8");
  });

  describe("flatten command", () => {
    test("should flatten JSON from stdin", async () => {
      const result = await runCLI(["flatten"], JSON.stringify(testJSON));

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json = {}");
      expect(result.stdout).toContain("json.user.id = 12345");
      expect(result.stdout).toContain('json.user.name = "Alice"');
    });

    test("should flatten keys that require bracket notation", async () => {
      const result = await runCLI(["flatten"], JSON.stringify({ "service.name": "api", "quoted\"key": null }));

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('json["service.name"] = "api"');
      expect(result.stdout).toContain('json["quoted\\\"key"] = null');
    });

    test("should show error for non-existent file", async () => {
      const result = await runCLI(["flatten", "nonexistent.json"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("does not exist");
      expect(result.stderr).not.toContain("Validate your JSON");
    });

    test("should suggest validating JSON only for parse errors", async () => {
      const result = await runCLI(["flatten"], "{bad");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Validate your JSON");
    });

    test("should round-trip quoted keys and nested values", async () => {
      const input = { "service.name": [null, -2.5], constructor: { prototype: true } };
      const flattened = await runCLI(["flatten"], JSON.stringify(input));
      const result = await runCLI(["unflatten"], flattened.stdout);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(input);
    });

    test("should reject child paths before their parent", async () => {
      const result = await runCLI(["unflatten"], "json = {}\njson.user.name = \"Alice\"");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("parent path must be assigned");
    });
  });

  describe("unflatten command", () => {
    test("should unflatten gron file", async () => {
      const result = await runCLI(["unflatten", testGronFile]);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.user.id).toBe(12345);
      expect(parsed.user.name).toBe("Alice");
      expect(parsed.posts[0].title).toBe("Hello World");
    });

    test("should unflatten gron from stdin", async () => {
      const result = await runCLI(["unflatten"], testGron);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.user.id).toBe(12345);
      expect(parsed.user.name).toBe("Alice");
    });

    test("should show error for non-existent file", async () => {
      const result = await runCLI(["unflatten", "nonexistent.gron"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("does not exist");
      expect(result.stderr).not.toContain("Gron lines should look like");
    });

    test("should show the gron syntax tip for parse errors", async () => {
      const result = await runCLI(["unflatten"], "foo = 1");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Gron lines should look like");
    });
  });

  describe("unflatten streaming", () => {
    // Input over the 16 MiB buffer, so output reaches its destination before the input has ended.
    const big = bigGron(17);
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "gronify-unflatten-"));
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    test("should keep big integers and number spelling from stdin", async () => {
      const result = await runCLI(
        ["--no-color", "unflatten"],
        "json = []\njson[0] = 12345678901234567890\njson[1] = 1.10\njson[2] = -0\njson[3] = 1e-7\n",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("[12345678901234567890,1.10,-0,1e-7]");
    });

    test("should print compact JSON that equals the original document", async () => {
      const result = await runCLI(["--no-color", "unflatten", testGronFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(JSON.stringify(JSON.parse(result.stdout)));
      expect(JSON.parse(result.stdout)).toEqual(
        JSON.parse((await runCLI(["--no-color", "unflatten"], testGron)).stdout),
      );
    });

    test("should pretty-print exactly like JSON.stringify with two spaces", async () => {
      const compact = await runCLI(["--no-color", "unflatten", testGronFile]);
      const pretty = await runCLI(["--no-color", "--pretty", "unflatten", testGronFile]);

      expect(pretty.exitCode).toBe(0);
      expect(pretty.stdout).toBe(JSON.stringify(JSON.parse(compact.stdout), null, 2));
      expect(pretty.stdout).toContain("\n    \"id\": 12345,");
    });

    test("should pretty-print empty containers as {} and []", async () => {
      const result = await runCLI(["--no-color", "--pretty", "unflatten"], "json = {}\njson.a = []\njson.b = {}\njson.c = [] \njson.c[0] = {}\n");

      expect(result.stdout).toBe(JSON.stringify({ a: [], b: {}, c: [{}] }, null, 2));
    });

    test("should accept CRLF line endings, semicolons, and blank lines", async () => {
      const result = await runCLI(["--no-color", "unflatten"], "json = {};\r\n\r\njson.a = \"x\";\r\njson.b = [];\r\njson.b[0] = null;");

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ a: "x", b: [null] });
    });

    test("should unflatten lexically sorted gron by rebuilding it in memory", async () => {
      const lines = ["json = []", ...Array.from({ length: 12 }, (_, index) => `json[${index}] = ${index}`)].sort();
      const result = await runCLI(["--no-color", "unflatten"], lines.join("\n"));

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    });

    test("should fill skipped array indexes with null", async () => {
      const result = await runCLI(["--no-color", "unflatten"], "json = []\njson[3] = 1\n");

      expect(result.stdout).toBe("[null,null,null,1]");
    });

    test("should name the failing line for invalid values", async () => {
      const result = await runCLI(["--no-color", "unflatten"], "json = {}\njson.a = 1\njson.b = nope\n");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("line 3: invalid JSON value");
      expect(result.stderr).toContain("Gron lines should look like");
    });

    test("should reject input without assignments", async () => {
      for (const input of ["", "\n\n", ";\n"]) {
        const result = await runCLI(["--no-color", "unflatten"], input);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("input contains no gron assignments");
      }
    });

    test("should write to a file with -o", async () => {
      const outputFile = join(dir, "out.json");
      const result = await runCLI(["--no-color", "-o", outputFile, "unflatten", testGronFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`Output written to ${outputFile}`);
      const content = readFileSync(outputFile, "utf8");
      expect(content.endsWith("\n")).toBe(true);
      expect(JSON.parse(content).user.name).toBe("Alice");
    });

    test("should write pretty output from stdin to a file with -o", async () => {
      const outputFile = join(dir, "pretty.json");
      const result = await runCLI(["--no-color", "--pretty", "-o", outputFile, "unflatten"], testGron);

      expect(result.exitCode).toBe(0);
      expect(readFileSync(outputFile, "utf8")).toBe(`${JSON.stringify(JSON.parse(readFileSync(outputFile, "utf8")), null, 2)}\n`);
    });

    test("should leave an existing -o file alone when the input is invalid", async () => {
      const outputFile = join(dir, "keep.json");
      writeFileSync(outputFile, "original\n");
      const result = await runCLI(["--no-color", "-o", outputFile, "unflatten"], "json = {}\njson.a = nope\n");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("line 2: invalid JSON value");
      expect(readFileSync(outputFile, "utf8")).toBe("original\n");
    });

    test("should report an unwritable -o path in one line", async () => {
      const result = await runCLI(["--no-color", "-o", join(dir, "missing", "out.json"), "unflatten", testGronFile]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("ENOENT");
      expect(result.stderr).not.toContain("Unhandled 'error' event");
      expect(result.stderr.split("\n")).toHaveLength(1);
    });

    test("should report -o naming a directory in one line", async () => {
      const result = await runCLI(["--no-color", "-o", dir, "unflatten", testGronFile]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("EISDIR");
      expect(result.stderr.split("\n")).toHaveLength(1);
    });

    test("should report an unwritable -o path for input over the buffer size in one line", async () => {
      const inputFile = join(dir, "unwritable-large.gron");
      writeFileSync(inputFile, big.gron);
      const result = await runCLI(["--no-color", "-o", join(dir, "missing", "out.json"), "unflatten", inputFile]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("ENOENT");
      expect(result.stderr).not.toContain("Unhandled 'error' event");
      expect(result.stderr.split("\n")).toHaveLength(1);
    });

    describe("whitespace and values", () => {
      test.each([
        ["json.a = [\v];", "vertical tab"],
        ["json.b = { \f };", "form feed"],
      ])("should reject %j inside an empty container (%s)", async (line) => {
        const result = await runCLI(["--no-color", "unflatten"], `json = {};\n${line}\n`);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("line 2: invalid JSON value");
        expect(result.stdout).toBe("");
      });

      test("should trim a trailing no-break space and other Unicode spaces like the old parser", async () => {
        const result = await runCLI(
          ["--no-color", "unflatten"],
          "json = {}　\njson.a = 1 \n json.b = []; \n \n",
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('{"a":1,"b":[]}');
      });

      test("should keep big integers inside one-line compound values", async () => {
        const result = await runCLI(
          ["--no-color", "unflatten"],
          'json = {}\njson.a = {"n":12345678901234567890,"l":[1.10,-0]}\n',
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('{"a":{"n":12345678901234567890,"l":[1.10,-0]}}');
      });

      test("should keep big integers inside compound values with --pretty", async () => {
        const result = await runCLI(
          ["--no-color", "--pretty", "unflatten"],
          'json = {}\njson.a = {"n":12345678901234567890,"l":[]}\n',
        );

        expect(result.stdout).toBe('{\n  "a": {\n    "n": 12345678901234567890,\n    "l": []\n  }\n}');
      });
    });

    describe("-o is atomic", () => {
      let work: string;

      beforeEach(() => {
        work = mkdtempSync(join(dir, "atomic-"));
      });

      function tempFiles(): string[] {
        return readdirSync(work).filter((name) => name.endsWith(".tmp"));
      }

      test("should unflatten a file larger than 16 MiB onto itself", async () => {
        const file = join(work, "same.gron");
        writeFileSync(file, big.gron);
        expect(statSync(file).size).toBeGreaterThan(16 * 1024 * 1024);

        const result = await runCLI(["--no-color", "-o", file, "unflatten", file]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain(`Output written to ${file}`);
        expect(readFileSync(file, "utf8")).toBe(big.json);
        expect(tempFiles()).toEqual([]);
      });

      test("should leave an existing -o file alone when invalid input comes after 16 MiB", async () => {
        const input = join(work, "bad.gron");
        const keep = join(work, "keep.json");
        writeFileSync(input, `${big.gron}json[0].id = nope\n`);
        writeFileSync(keep, '{"important":true}\n');

        const result = await runCLI(["--no-color", "-o", keep, "unflatten", input]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("invalid JSON value");
        expect(readFileSync(keep, "utf8")).toBe('{"important":true}\n');
        expect(tempFiles()).toEqual([]);
      });

      test("should leave an input that is also the -o file intact when it turns out invalid", async () => {
        const file = join(work, "same-bad.gron");
        const text = `${big.gron}json[0].id = nope\n`;
        writeFileSync(file, text);

        const result = await runCLI(["--no-color", "-o", file, "unflatten", file]);

        expect(result.exitCode).toBe(1);
        expect(readFileSync(file, "utf8")).toBe(text);
        expect(tempFiles()).toEqual([]);
      });

      test("should leave an existing -o file alone on out-of-order input after 16 MiB", async () => {
        const input = join(work, "unordered.gron");
        const keep = join(work, "keep2.json");
        writeFileSync(input, `${big.gron}json[0].name = "again"\n`);
        writeFileSync(keep, "old\n");

        const result = await runCLI(["--no-color", "-o", keep, "unflatten", input]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("must be in document order");
        expect(readFileSync(keep, "utf8")).toBe("old\n");
        expect(tempFiles()).toEqual([]);
      });

      test("should keep the target's mode and replace it only when done", async () => {
        const file = join(work, "mode.json");
        writeFileSync(file, "old\n");
        chmodSync(file, 0o640);

        const result = await runCLI(["--no-color", "-o", file, "unflatten", testGronFile]);

        expect(result.exitCode).toBe(0);
        expect(statSync(file).mode & 0o777).toBe(0o640);
        expect(JSON.parse(readFileSync(file, "utf8")).user.name).toBe("Alice");
      });

      (process.platform === "win32" ? test.skip : test)("should write -o /dev/stdout in place", () => {
        // A real file as stdout: Node's own stdout pipe is a socket on Linux, which /dev/stdout cannot reopen.
        const out = join(work, "stdout.txt");
        const fd = openSync(out, "w");
        let status: number | null;
        try {
          status = spawnSync("node", ["dist/index.js", "--no-color", "-o", "/dev/stdout", "unflatten"], {
            input: "json = {}\njson.a = [1]\n",
            stdio: ["pipe", fd, "pipe"],
          }).status;
        } finally {
          closeSync(fd);
        }

        expect(status).toBe(0);
        expect(readFileSync(out, "utf8")).toBe('{"a":[1]}\n');
        expect(tempFiles()).toEqual([]);
      });
    });

    test("should explain the document-order limit in terms of the buffers for a tiny file with a large gap", async () => {
      const inputFile = join(dir, "gap.gron");
      writeFileSync(inputFile, "json = []\njson[5000000] = 1\njson[0] = 2\n");

      const result = await runCLI(["--no-color", "-o", "/dev/null", "unflatten", inputFile]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("line 3: array index 0 does not follow the previous index");
      expect(result.stderr).toContain("16 MiB of input has been read or 16 MiB of output produced");
      expect(result.stderr).not.toContain("Input larger than");
    });

    test("should stream a multi-megabyte file with sparse and nested data", async () => {
      const inputFile = join(dir, "large.gron");
      const lines = ["json = []"];
      for (let index = 0; index < 60000; index += 1) {
        lines.push(`json[${index * 2}] = {}`, `json[${index * 2}].id = ${index}`, `json[${index * 2}].tags = []`, `json[${index * 2}].tags[1] = "t${index}"`);
      }
      writeFileSync(inputFile, `${lines.join("\n")}\n`);
      const result = await runCLI(["--no-color", "unflatten", inputFile]);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveLength(119999);
      expect(parsed[0]).toEqual({ id: 0, tags: [null, "t0"] });
      expect(parsed[1]).toBeNull();
      expect(parsed[119998]).toEqual({ id: 59999, tags: [null, "t59999"] });
    });
  });

  describe("search command", () => {
    test("should search in JSON file", async () => {
      const result = await runCLI(["search", testJSONFile, "user"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json.user");
    });

    test("should search case sensitively", async () => {
      const result = await runCLI([
        "search",
        testJSONFile,
        "Alice",
        "--case-sensitive",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('json.user.name = "Alice"');
    });

    test("should count matches", async () => {
      const result = await runCLI(["search", testJSONFile, "post", "--count"]);

      expect(result.exitCode).toBe(0);
      expect(parseInt(result.stdout)).toBeGreaterThan(0);
    });

    test("should print zero when counting no matches", async () => {
      const result = await runCLI(["search", testJSONFile, "nonexistent", "--count"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("0");
    });

    test("should treat plain search terms literally", async () => {
      const result = await runCLI(["search", testJSONFile, "user.*name"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("No matches found");
    });

    test("should report invalid regular expressions", async () => {
      const result = await runCLI(["search", testJSONFile, "[", "--regex"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid regex");
    });

    test("should search from stdin", async () => {
      const result = await runCLI(["search", "user"], JSON.stringify(testJSON));

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json.user");
    });

    test("should show no matches found", async () => {
      const result = await runCLI(["search", testJSONFile, "nonexistent"]);

      expect(result.exitCode).toBe(0); // No matches is not an error
      expect(result.stderr).toContain("No matches found");
    });

    test("should support --invert-match flag", async () => {
      const result = await runCLI([
        "search",
        testJSONFile,
        "user",
        "--invert-match",
      ]);

      expect(result.exitCode).toBe(0);
      // Should contain lines that don't have "user" in them
      expect(result.stdout).toContain("json.posts");
      expect(result.stdout).not.toContain("json.user");
    });
  });

  describe("output file option", () => {
    test("should write flatten output to file with -o", async () => {
      const outputFile = join(process.cwd(), "__tests__", "test-output.gron");
      const result = await runCLI([
        "--no-color",
        "-o",
        outputFile,
        "flatten",
        testJSONFile,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Output written to");
      // Verify the file was written
      const content = readFileSync(outputFile, "utf8");
      expect(content).toContain("json.user.id = 12345");

      // Clean up
      const { unlinkSync } = await import("fs");
      try {
        unlinkSync(outputFile);
      } catch {
        /* ignore */
      }
    });
  });

  describe("streaming behavior", () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "gronify-test-"));
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    function bigRecords(count: number): string {
      return JSON.stringify(
        Array.from({ length: count }, (_, i) => ({
          id: i,
          user: { name: `user${i}`, email: `u${i}@example.com`, tags: ["a", "b"] },
          status: "ok",
          score: 0,
        })),
      );
    }

    test("should print numbers exactly as written", async () => {
      const result = await runCLI(["flatten"], "[12345678901234567890, 1.10, 1e2, -0]");

      expect(result.exitCode).toBe(0);
      expect(result.stdout.split("\n")).toEqual([
        "json = []",
        "json[0] = 12345678901234567890",
        "json[1] = 1.10",
        "json[2] = 1e2",
        "json[3] = -0",
      ]);
    });

    test("should keep document key order and emit duplicate keys", async () => {
      const result = await runCLI(["flatten"], '{"b":1,"1":2,"a":3,"b":4}');

      expect(result.stdout.split("\n")).toEqual([
        "json = {}",
        "json.b = 1",
        'json["1"] = 2',
        "json.a = 3",
        "json.b = 4",
      ]);
    });

    test("should flatten a multi-megabyte file identically to the in-memory flattener", async () => {
      const text = bigRecords(25_000);
      const file = join(dir, "big.json");
      writeFileSync(file, text);
      expect(Buffer.byteLength(text)).toBeGreaterThan(2 * 1024 * 1024);

      const result = await runCLI(["flatten", file]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(flattenJson(JSON.parse(text)));
    });

    test("should flatten stdin written in small pieces", async () => {
      const text = JSON.stringify({ a: [1, { "b c": "é" }] }, null, 2);
      const result = await new Promise<{ stdout: string; exitCode: number | null }>((resolve) => {
        const child = spawn("node", ["dist/index.js", "flatten"]);
        let stdout = "";
        child.stdout.on("data", (data) => (stdout += data.toString()));
        child.on("close", (code) => resolve({ stdout, exitCode: code }));
        const bytes = Buffer.from(text);
        for (let i = 0; i < bytes.length; i += 3) child.stdin.write(bytes.subarray(i, i + 3));
        child.stdin.end();
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(flattenJson(JSON.parse(text)) + "\n");
    });

    test("should write flatten output from stdin to the -o file", async () => {
      const outputFile = join(dir, "stdin.gron");
      const result = await runCLI(["-o", outputFile, "flatten"], '{"a":{"b":[true]}}');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`Output written to ${outputFile}`);
      expect(readFileSync(outputFile, "utf8")).toBe("json = {}\njson.a = {}\njson.a.b = []\njson.a.b[0] = true\n");
    });

    test("should write search results and counts to the -o file", async () => {
      const matches = join(dir, "matches.gron");
      const count = join(dir, "count.txt");
      await runCLI(["-o", matches, "search", testJSONFile, "alice"]);
      const counted = await runCLI(["-o", count, "search", testJSONFile, "post", "--count"]);

      expect(readFileSync(matches, "utf8")).toBe(
        'json.user.name = "Alice"\njson.user.profile.email = "alice@example.com"\n',
      );
      expect(counted.stderr).toContain("Output written to");
      expect(Number(readFileSync(count, "utf8"))).toBeGreaterThan(0);
    });

    test("should not create the -o file when a search has no matches", async () => {
      const outputFile = join(dir, "none.gron");
      const result = await runCLI(["-o", outputFile, "search", testJSONFile, "zzzzz"]);

      expect(result.stderr).toContain("No matches found");
      expect(existsSync(outputFile)).toBe(false);
    });

    test("should report a write failure for an unwritable -o path", async () => {
      const result = await runCLI(["-o", join(dir, "missing", "out.gron"), "flatten"], "[1]");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("ENOENT");
    });

    test("should search stdin with regex, invert and the all-lines-matched warning", async () => {
      const json = JSON.stringify({ a: 1, b: { c: 2 } });
      const regex = await runCLI(["search", "--regex", "^json\\.b\\.\\w+ = \\d$"], json);
      const invert = await runCLI(["search", "--invert-match", "json"], json);

      expect(regex.stdout).toBe("json.b.c = 2");
      expect(invert.exitCode).toBe(0);
      expect(invert.stdout).toBe("");
      expect(invert.stderr).toContain("All lines matched 'json' (nothing to invert)");
    });

    test("should search a multi-megabyte file consistently with the in-memory flattener", async () => {
      const text = bigRecords(25_000);
      const file = join(dir, "search.json");
      writeFileSync(file, text);
      const lines = flattenJson(JSON.parse(text)).split("\n");

      const plain = await runCLI(["search", file, "U1234@", "--count"]);
      const regex = await runCLI(["search", file, "tags\\[1\\]", "--regex", "--count"]);
      const invert = await runCLI(["search", file, "user", "--invert-match", "--count"]);

      expect(Number(plain.stdout)).toBe(lines.filter((line) => line.toLowerCase().includes("u1234@")).length);
      expect(Number(regex.stdout)).toBe(25_000);
      expect(Number(invert.stdout)).toBe(lines.filter((line) => !line.toLowerCase().includes("user")).length);
    });

    test("should report the byte offset of a syntax error", async () => {
      const result = await runCLI(["flatten"], '{\n  "a": 1,\n  "b": ?\n}');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("byte offset 19 (line 3, column 8)");
      expect(result.stderr).toContain("Validate your JSON");
    });

    test("should keep output already written when a later chunk is invalid", async () => {
      const valid = bigRecords(25_000);
      const file = join(dir, "broken.json");
      // Trailing garbage after a complete multi-chunk document.
      writeFileSync(file, valid + "!");

      const result = await runCLI(["flatten", file]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`byte offset ${Buffer.byteLength(valid)}`);
      // Whole lines flushed before the error stay written; the unflushed tail of the failing chunk is dropped.
      expect(result.stdout.length).toBeGreaterThan(1024 * 1024);
      expect(flattenJson(JSON.parse(valid)).startsWith(result.stdout)).toBe(true);
    });

    test("should exit with an error instead of hanging when stdin never ends", async () => {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn("node", ["dist/index.js", "flatten"]);
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("CLI hung on invalid stdin"));
        }, 10_000);
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        child.stdin.on("error", () => undefined);
        child.stdin.write("not json");
      });

      expect(exitCode).toBe(1);
    });

    test("should stop quietly when the reader closes the pipe early", async () => {
      const file = join(dir, "pipe.json");
      writeFileSync(file, bigRecords(60_000));

      const result = await new Promise<{ exitCode: number | null; stderr: string; seen: number }>((resolve, reject) => {
        const child = spawn("node", ["dist/index.js", "flatten", file]);
        let stderr = "";
        let seen = 0;
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("CLI did not exit after the pipe closed"));
        }, 15_000);
        child.stderr.on("data", (data) => (stderr += data.toString()));
        child.stdout.once("data", (data: Buffer) => {
          seen = data.length;
          child.stdout.destroy();
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ exitCode: code, stderr, seen });
        });
      });

      expect(result.seen).toBeGreaterThan(0);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    });

    test("should flatten nesting deeper than the old recursion limit", async () => {
      const depth = 5000;
      const file = join(dir, "deep.json");
      writeFileSync(file, '{"a":'.repeat(depth) + "1" + "}".repeat(depth));

      const count = await runCLI(["search", file, "json", "--count"]);
      const leaf = await runCLI(["search", file, " = 1", "--case-sensitive"]);

      expect(count.stdout).toBe(String(depth + 1));
      expect(leaf.stdout).toBe(`json${".a".repeat(depth)} = 1`);
    });

    test("should group and indent --pretty output exactly as before streaming", async () => {
      // Expected text was captured from the pre-streaming CLI.
      const result = await runCLI(
        ["--pretty", "flatten"],
        '{"user":{"name":"A","tags":[1]},"posts":[{"t":"x.y"}],"id":1}',
      );

      expect(result.stdout).toBe(
        [
          "json = {}",
          "json.user = {}",
          "",
          '  json.user.name = "A"',
          "    json.user.tags = []",
          "    json.user.tags[0] = 1",
          "",
          "  json.posts = []",
          "",
          "  json.posts[0] = {}",
          '      json.posts[0].t = "x.y"',
          "",
          "json.id = 1",
        ].join("\n"),
      );
    });

    describe("-o output is atomic", () => {
      const posix = process.platform !== "win32";
      let work: string;

      beforeEach(() => {
        work = mkdtempSync(join(dir, "atomic-"));
      });

      function tempFiles(): string[] {
        return readdirSync(work).filter((name) => name.endsWith(".tmp"));
      }

      test("should flatten a multi-megabyte file onto itself", async () => {
        const text = bigRecords(40_000);
        const file = join(work, "a.json");
        writeFileSync(file, text);
        expect(Buffer.byteLength(text)).toBeGreaterThan(4 * 1024 * 1024);

        const result = await runCLI(["-o", file, "flatten", file]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain(`Output written to ${file}`);
        expect(readFileSync(file, "utf8")).toBe(flattenJson(JSON.parse(text)) + "\n");
        expect(tempFiles()).toEqual([]);
      });

      (posix ? test : test.skip)("should write -o /dev/stdout in place", () => {
        // A real file as stdout: Node's own stdout pipe is a socket on Linux, which /dev/stdout cannot reopen.
        const out = join(work, "stdout.txt");
        const fd = openSync(out, "w");
        let status: number | null;
        try {
          status = spawnSync("node", ["dist/index.js", "--no-color", "-o", "/dev/stdout", "flatten"], {
            input: '{"a":[1]}',
            stdio: ["pipe", fd, "pipe"],
          }).status;
        } finally {
          closeSync(fd);
        }

        expect(status).toBe(0);
        expect(readFileSync(out, "utf8")).toBe('json = {}\njson.a = []\njson.a[0] = 1\n');
        expect(tempFiles()).toEqual([]);
      });

      test("should search a multi-megabyte file onto itself", async () => {
        const text = bigRecords(40_000);
        const file = join(work, "b.json");
        writeFileSync(file, text);
        const expected = flattenJson(JSON.parse(text))
          .split("\n")
          .filter((line) => line.toLowerCase().includes("user"))
          .join("\n");

        const result = await runCLI(["-o", file, "search", file, "user"]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain(`Output written to ${file}`);
        expect(readFileSync(file, "utf8")).toBe(expected + "\n");
        expect(tempFiles()).toEqual([]);
      });

      test("should leave an existing -o file byte-identical when the input is invalid past the first flush", async () => {
        const input = join(work, "truncated.json");
        const target = join(work, "out.gron");
        const previous = Buffer.from([0x70, 0x72, 0x65, 0x63, 0x69, 0x6f, 0x75, 0x73, 0x00, 0xff, 0x0a]);
        writeFileSync(input, bigRecords(40_000).slice(0, 3_000_000));
        writeFileSync(target, previous);

        const flatten = await runCLI(["-o", target, "flatten", input]);
        const search = await runCLI(["-o", target, "search", input, "user"]);

        for (const result of [flatten, search]) {
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("byte offset");
          expect(result.stderr).not.toContain("Output written");
        }
        expect(readFileSync(target).equals(previous)).toBe(true);
        expect(tempFiles()).toEqual([]);
      });

      test("should not create the -o file when the input is invalid", async () => {
        const input = join(work, "truncated.json");
        const target = join(work, "never.gron");
        writeFileSync(input, bigRecords(40_000).slice(0, 3_000_000));

        const result = await runCLI(["-o", target, "flatten", input]);

        expect(result.exitCode).toBe(1);
        expect(readdirSync(work)).toEqual(["truncated.json"]);
      });

      test("should leave an existing -o file alone when a search has no matches", async () => {
        const target = join(work, "kept.gron");
        writeFileSync(target, "precious\n");

        const result = await runCLI(["-o", target, "search", testJSONFile, "zzzzz"]);

        expect(result.stderr).toContain("No matches found");
        expect(readFileSync(target, "utf8")).toBe("precious\n");
        expect(tempFiles()).toEqual([]);
      });

      test("should replace a symlinked -o target's file and keep the link", async () => {
        if (!posix) return;
        const real = join(work, "real.gron");
        const link = join(work, "link.gron");
        writeFileSync(real, "old\n");
        symlinkSync(real, link);

        const result = await runCLI(["-o", link, "flatten"], "[1]");

        expect(result.exitCode).toBe(0);
        expect(lstatSync(link).isSymbolicLink()).toBe(true);
        expect(readFileSync(real, "utf8")).toBe("json = []\njson[0] = 1\n");
      });

      test("should keep the mode of an existing -o file", async () => {
        if (!posix) return;
        const target = join(work, "mode.gron");
        writeFileSync(target, "old\n");
        chmodSync(target, 0o640);

        const result = await runCLI(["-o", target, "flatten"], "[1]");

        expect(result.exitCode).toBe(0);
        expect(statSync(target).mode & 0o777).toBe(0o640);
        expect(readFileSync(target, "utf8")).toBe("json = []\njson[0] = 1\n");
      });

      test("should write the unflatten and --count results atomically too", async () => {
        const unflattened = join(work, "out.json");
        const counted = join(work, "count.txt");
        writeFileSync(unflattened, "old\n");

        const first = await runCLI(["--no-color", "-o", unflattened, "unflatten", testGronFile]);
        const second = await runCLI(["-o", counted, "search", testJSONFile, "user", "--count"]);

        expect(first.exitCode).toBe(0);
        expect(JSON.parse(readFileSync(unflattened, "utf8"))).toEqual(testJSON);
        expect(second.exitCode).toBe(0);
        expect(Number(readFileSync(counted, "utf8"))).toBeGreaterThan(0);
        expect(tempFiles()).toEqual([]);
      });

      test("should exit 1 with a one-line error when the -o directory does not exist", async () => {
        const target = join(work, "missing", "out.gron");

        const result = await runCLI(["-o", target, "flatten"], "[1]");

        expect(result.exitCode).toBe(1);
        expect(result.stderr.split("\n")).toHaveLength(1);
        expect(result.stderr).toContain(`ENOENT`);
        expect(result.stderr).toContain(target);
        expect(result.stderr).not.toContain(".tmp");
      });

      test("should exit 1 with a one-line error when the -o directory is unwritable", async () => {
        if (!posix || process.getuid?.() === 0) return; // root ignores permission bits
        const locked = join(work, "locked");
        mkdirSync(locked);
        chmodSync(locked, 0o500);
        const target = join(locked, "out.gron");
        const input = join(work, "in.json");
        writeFileSync(input, bigRecords(25_000)); // enough output to fail on a flush before the end

        try {
          const result = await runCLI(["-o", target, "flatten", input]);

          expect(result.exitCode).toBe(1);
          expect(result.stderr.split("\n")).toHaveLength(1);
          expect(result.stderr).toContain("EACCES");
          expect(result.stderr).toContain(target);
          expect(result.stderr).not.toContain(".tmp");
          expect(result.stderr).not.toMatch(/\n\s+at /);
          expect(readdirSync(locked)).toEqual([]);
        } finally {
          chmodSync(locked, 0o700);
        }
      });

      test("should exit 1 with a one-line error when -o is a directory", async () => {
        const result = await runCLI(["-o", work, "flatten"], "[1]");

        expect(result.exitCode).toBe(1);
        expect(result.stderr.split("\n")).toHaveLength(1);
        expect(result.stderr).toContain("EISDIR");
        expect(tempFiles()).toEqual([]);
      });

      test("should remove its temp file when killed", async () => {
        if (!posix) return;
        const target = join(work, "killed.gron");
        const signal = await new Promise<NodeJS.Signals | null>((resolve, reject) => {
          const child = spawn("node", ["dist/index.js", "-o", target, "flatten"]);
          const poll = setInterval(() => {
            // The first input chunk is flushed at once, which creates the temp file.
            if (existsSync(work) && tempFiles().length > 0) {
              clearInterval(poll);
              child.kill("SIGTERM");
            }
          }, 20);
          const timer = setTimeout(() => {
            clearInterval(poll);
            child.kill("SIGKILL");
            reject(new Error("temp file never appeared"));
          }, 4_000);
          child.on("close", (_code, sig) => {
            clearTimeout(timer);
            clearInterval(poll);
            resolve(sig);
          });
          child.stdin.on("error", () => undefined);
          child.stdin.write("[1,2,");
        });

        expect(signal).toBe("SIGTERM");
        expect(readdirSync(work)).toEqual([]);
      });
    });

    describe("invalid input on stdout", () => {
      test("should exit 1 with the error even though output was already written", async () => {
        const result = await runCLI(["flatten"], '{"a":[1,2,{"b":"c"');

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("flattening JSON");
        expect(result.stderr).toContain("Unexpected end of input");
        // Streaming has already written every complete line by the time the end of input is found to be truncated.
        expect(result.stdout.split("\n")).toEqual(["json = {}", "json.a = []", "json.a[0] = 1", "json.a[1] = 2", "json.a[2] = {}", 'json.a[2].b = "c"']);
      });

      test("should exit 1 with the error when the document is truncated past several flushes", async () => {
        const text = bigRecords(40_000).slice(0, 3_000_000);
        const file = join(dir, "truncated-stdout.json");
        writeFileSync(file, text);

        const flatten = await runCLI(["flatten", file]);
        const search = await runCLI(["search", file, "user"]);

        for (const result of [flatten, search]) {
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("byte offset");
          expect(result.stdout.length).toBeGreaterThan(1024 * 1024);
        }
      });
    });
  });

  describe("help and version", () => {
    test("should show help", async () => {
      const result = await runCLI(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "Flatten, search, and unflatten JSON from the command line",
      );
      expect(result.stdout).toContain("flatten");
      expect(result.stdout).toContain("unflatten");
      expect(result.stdout).toContain("search");
    });

    test("should show version", async () => {
      const result = await runCLI(["--version"]);

      const { version } = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf8"),
      ) as { version: string };

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(version);
    });

    test("should show command help", async () => {
      const result = await runCLI(["search", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Search through flattened JSON paths");
      expect(result.stdout).toContain("--regex");
      expect(result.stdout).toContain("--case-sensitive");
      expect(result.stdout).toContain("--count");
    });
  });
});
