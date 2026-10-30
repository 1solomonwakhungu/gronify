import { spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
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
