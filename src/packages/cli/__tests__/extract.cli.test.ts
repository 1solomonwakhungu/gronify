import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { spawn } from "node:child_process";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Path to the CLI executable
const CLI_PATH = join(__dirname, "../dist/index.js");
const FIXTURES_PATH = join(__dirname, "fixtures");

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute the CLI command
 */
async function execCli(args: string[], stdin?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
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

    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

describe("Extract Command - CSV Format", () => {
  it("should extract basic fields to CSV", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      "name,email\nAsha,asha@example.com\nBrian,brian@example.com\nChen,chen@example.com"
    );
  });

  it("should handle missing fields with empty strings", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email, age: age}",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("name,email,age");
    expect(result.stdout).toContain("Asha,asha@example.com,29");
    expect(result.stdout).toContain("Brian,brian@example.com,");
  });

  it("should support --no-header option", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "csv",
      "--no-header",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("name,email");
    expect(result.stdout).toContain("Asha,asha@example.com");
  });

  it("should flatten nested objects", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[2]",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("meta.city");
    expect(result.stdout).toContain("meta.skills");
    expect(result.stdout).toContain("Nairobi");
  });

  it("should read from stdin", async () => {
    const data = JSON.stringify({
      items: [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
      ],
    });

    const result = await execCli(
      ["extract", "-p", "items[*].{id: id, name: name}", "-f", "csv"],
      data
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("id,name\n1,Item 1\n2,Item 2");
  });

  it("should write to output file", async () => {
    const outputFile = join(tmpdir(), `test-output-${Date.now()}.csv`);

    try {
      const result = await execCli([
        "extract",
        join(FIXTURES_PATH, "users.json"),
        "-p",
        "users[*].{name: name, email: email}",
        "-f",
        "csv",
        "-o",
        outputFile,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Output written to");
      expect(existsSync(outputFile)).toBe(true);
    } finally {
      if (existsSync(outputFile)) {
        await unlink(outputFile);
      }
    }
  });

  it("should handle primitives with custom column name", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "primitives.json"),
      "-p",
      "nums",
      "-f",
      "csv",
      "--column",
      "number",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("number");
    expect(result.stdout).toContain("\n1\n2\n3");
  });

  it("should handle custom delimiter", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "csv",
      "--delimiter",
      "|",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("name|email");
    expect(result.stdout).toContain("Asha|asha@example.com");
  });
});

describe("Extract Command - TSV Format", () => {
  it("should extract to TSV format", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "tsv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      "name\temail\nAsha\tasha@example.com\nBrian\tbrian@example.com\nChen\tchen@example.com"
    );
  });

  it("should support --no-header in TSV", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "tsv",
      "--no-header",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("name\temail");
    expect(result.stdout).toContain("Asha\tasha@example.com");
  });
});

describe("Extract Command - Markdown Format", () => {
  it("should extract to Markdown table", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "markdown",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("| name | email |");
    expect(result.stdout).toContain("| --- | --- |");
    expect(result.stdout).toContain("| Asha | asha@example.com |");
  });

  it("should support pretty formatting", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "markdown",
      "--pretty",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("| name  | email");
  });

  it("should support --no-header in Markdown", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email}",
      "-f",
      "markdown",
      "--no-header",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("| --- |");
    expect(result.stdout).toContain("| Asha | asha@example.com |");
  });
});

describe("Extract Command - Template Format", () => {
  it("should render with custom template", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*]",
      "-f",
      "template",
      "-t",
      "{{name}}: {{email}}",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      "Asha: asha@example.com\nBrian: brian@example.com\nChen: chen@example.com"
    );
  });

  it("should error without template", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*]",
      "-f",
      "template",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--template or --template-file is required");
  });

  it("should support template file", async () => {
    const templateFile = join(tmpdir(), `template-${Date.now()}.hbs`);

    try {
      await writeFile(templateFile, "User: {{name}} <{{email}}>");

      const result = await execCli([
        "extract",
        join(FIXTURES_PATH, "users.json"),
        "-p",
        "users[*]",
        "-f",
        "template",
        "--template-file",
        templateFile,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("User: Asha <asha@example.com>");
    } finally {
      if (existsSync(templateFile)) {
        await unlink(templateFile);
      }
    }
  });

  it("should support Handlebars helpers", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*]",
      "-f",
      "template",
      "-t",
      "{{name}}{{#if age}} ({{age}}){{/if}}",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Asha (29)");
    expect(result.stdout).toContain("Brian\n"); // No age
  });
});

describe("Extract Command - JMESPath Features", () => {
  it("should support JMESPath functions", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[?meta.skills].{name: name, skills: join(',', meta.skills)}",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("name,skills");
    // Joined value contains comma so it's CSV-quoted
    expect(result.stdout).toContain('Chen,"Go,Node"');
  });

  it("should handle complex nested queries", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "nested.json"),
      "-p",
      "company.departments[].employees[].{name: name, title: position.title, salary: position.salary}",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("name,title,salary");
    expect(result.stdout).toContain("Alice,Senior Engineer,150000");
  });

  it("should flatten nested arrays", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "nested.json"),
      "-p",
      "company.departments[].employees[]",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Alice");
    expect(result.stdout).toContain("Bob");
    expect(result.stdout).toContain("Carol");
  });
});

describe("Extract Command - Error Handling", () => {
  it("should error on invalid JSON", async () => {
    const result = await execCli(
      ["extract", "-p", "users", "-f", "csv"],
      "{ invalid json }"
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid JSON");
  });

  it("should error on invalid JMESPath", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{invalid syntax",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("Error evaluating path expression");
  });

  it("should error on missing file", async () => {
    const result = await execCli([
      "extract",
      "nonexistent.json",
      "-p",
      "data",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(1);
  });

  it("should handle empty results with warning", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "nonexistent",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Warning: No results found");
  });

  it("should suppress warnings with --quiet", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "nonexistent",
      "-f",
      "csv",
      "--quiet",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("should error in strict mode on missing fields", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[*].{name: name, email: email, age: age}",
      "-f",
      "csv",
      "--strict",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing field");
  });
});

describe("Extract Command - Edge Cases", () => {
  it("should handle single object", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "users.json"),
      "-p",
      "users[0]",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("name,email,age");
    expect(result.stdout).toContain("Asha,asha@example.com,29");
  });

  it("should handle arrays in values", async () => {
    const result = await execCli([
      "extract",
      join(FIXTURES_PATH, "nested.json"),
      "-p",
      "company.departments[0].employees[*].{name: name, projects: projects}",
      "-f",
      "csv",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("name,projects");
    // Arrays should be JSON stringified and CSV-escaped (quotes are doubled)
    expect(result.stdout).toContain('"[""Project A"",""Project B""]"');
  });

  it("should handle null values", async () => {
    const data = JSON.stringify({
      items: [
        { id: 1, value: null },
        { id: 2, value: "test" },
      ],
    });

    const result = await execCli(
      ["extract", "-p", "items[*].{id: id, value: value}", "-f", "csv"],
      data
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("id,value");
  });

  it("should handle unicode properly", async () => {
    const data = JSON.stringify({
      items: [
        { emoji: "👋", text: "Hello 世界" },
      ],
    });

    const result = await execCli(
      ["extract", "-p", "items[*].{emoji: emoji, text: text}", "-f", "csv"],
      data
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("👋");
    expect(result.stdout).toContain("世界");
  });
});

