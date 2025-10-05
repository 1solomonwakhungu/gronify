import { spawn } from "child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

// Test data
const testJSON = {
  user: {
    id: 12345,
    name: "Alice",
    profile: {
      email: "alice@example.com",
      preferences: {
        theme: "dark",
        notifications: true
      }
    },
    tags: ["dev", "json", "tool"]
  },
  posts: [
    {
      id: "p1",
      title: "Hello World",
      content: {
        text: "This is a test post.",
        images: []
      }
    },
    {
      id: "p2", 
      title: "Second Post",
      content: {
        text: "Another post.",
        images: [
          {
            url: "https://example.com/img.png",
            caption: "An example image"
          }
        ]
      }
    }
  ]
};

const testGron = `json = {}
json.user = {}
json.user.id = 12345
json.user.name = "Alice"
json.user.profile = {}
json.user.profile.email = "alice@example.com"
json.user.profile.preferences = {}
json.user.profile.preferences.theme = "dark"
json.user.profile.preferences.notifications = true
json.user.tags = []
json.user.tags[0] = "dev"
json.user.tags[1] = "json"
json.user.tags[2] = "tool"
json.posts = []
json.posts[0] = {}
json.posts[0].id = "p1"
json.posts[0].title = "Hello World"
json.posts[0].content = {}
json.posts[0].content.text = "This is a test post."
json.posts[0].content.images = []
json.posts[1] = {}
json.posts[1].id = "p2"
json.posts[1].title = "Second Post"
json.posts[1].content = {}
json.posts[1].content.text = "Another post."
json.posts[1].content.images = []
json.posts[1].content.images[0] = {}
json.posts[1].content.images[0].url = "https://example.com/img.png"
json.posts[1].content.images[0].caption = "An example image"`;

describe("Gronify CLI", () => {
  let tempDir: string;
  let testJSONFile: string;
  let testGronFile: string;

  beforeAll(() => {
    // Create temp directory for test files
    tempDir = join(tmpdir(), `gronify-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    // Create test files
    testJSONFile = join(tempDir, "test.json");
    testGronFile = join(tempDir, "test.gron");
    
    writeFileSync(testJSONFile, JSON.stringify(testJSON, null, 2));
    writeFileSync(testGronFile, testGron);
  });

  afterAll(() => {
    // Clean up temp files
    try {
      unlinkSync(testJSONFile);
      unlinkSync(testGronFile);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("flatten command", () => {
    test("should flatten JSON file", async () => {
      const result = await runCLI(["flatten", testJSONFile]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("json = {}");
      expect(result.stdout).toContain("json.user.id = 12345");
      expect(result.stdout).toContain("json.user.name = \"Alice\"");
      expect(result.stdout).toContain("json.posts[0].title = \"Hello World\"");
    });

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