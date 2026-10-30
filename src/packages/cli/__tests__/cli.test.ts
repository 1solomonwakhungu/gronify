import { spawn } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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

  describe("unflatten streaming", () => {
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

    test("should report an unwritable -o path", async () => {
      const result = await runCLI(["--no-color", "-o", join(dir, "missing", "out.json"), "unflatten", testGronFile]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("ENOENT");
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
