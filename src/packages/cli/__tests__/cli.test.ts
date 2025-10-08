import { spawn } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

// Helper function to run CLI commands and capture output
function runCLI(args: string[], input?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("node", ["dist/index.js", ...args], {
      stdio: ["pipe", "pipe", "pipe"]
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
        exitCode: code ?? 0
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
    testJSON = JSON.parse(readFileSync(testJSONFile, 'utf8'));
    testGron = readFileSync(testGronFile, 'utf8');
  });

  describe("flatten command", () => {
    test("should flatten JSON from stdin", async () => {
      const result = await runCLI(["flatten"], JSON.stringify(testJSON));
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json = {}");
      expect(result.stdout).toContain("json.user.id = 12345");
      expect(result.stdout).toContain("json.user.name = \"Alice\"");
    });

    test("should show error for non-existent file", async () => {
      const result = await runCLI(["flatten", "nonexistent.json"]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("does not exist");
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
    });
  });

  describe("search command", () => {
    test("should search in JSON file", async () => {
      const result = await runCLI(["search", testJSONFile, "user"]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json.user");
    });

    test("should search with regex", async () => {
      const result = await runCLI(["search", testJSONFile, "posts\\[\\d+\\]", "--regex"]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json.posts[0]");
      expect(result.stdout).toContain("json.posts[1]");
    });

    test("should search case sensitively", async () => {
      const result = await runCLI(["search", testJSONFile, "Alice", "--case-sensitive"]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json.user.name = \"Alice\"");
    });

    test("should count matches", async () => {
      const result = await runCLI(["search", testJSONFile, "post", "--count"]);
      
      expect(result.exitCode).toBe(0);
      expect(parseInt(result.stdout)).toBeGreaterThan(0);
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
  });

  describe("help and version", () => {
    test("should show help", async () => {
      const result = await runCLI(["--help"]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Make big JSON easy to search, inspect, and diff");
      expect(result.stdout).toContain("flatten");
      expect(result.stdout).toContain("unflatten");
      expect(result.stdout).toContain("search");
    });

    test("should show version", async () => {
      const result = await runCLI(["--version"]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("1.0.0");
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