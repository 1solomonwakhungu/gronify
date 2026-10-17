// Mock chalk to avoid ESM issues in jest's CommonJS environment
jest.mock("chalk", () => {
  const wrap = (s: string) => s;
  return {
    default: {
      red: wrap,
      green: wrap,
      yellow: wrap,
      blue: wrap,
      magenta: wrap,
      cyan: wrap,
      gray: wrap,
      bgYellow: {
        black: wrap,
      },
    },
  };
});

import {
  OutputFormatter,
  createFormatter,
  shouldUseColor,
} from "../src/formatter";

// Save and restore environment variables for consistent tests
const originalEnv = { ...process.env };
const originalIsTTY = process.stdout.isTTY;

afterEach(() => {
  process.env = { ...originalEnv };
  // @ts-expect-error: writable for tests
  process.stdout.isTTY = originalIsTTY;
});

describe("OutputFormatter", () => {
  describe("constructor", () => {
    test("should use default options", () => {
      const fmt = new OutputFormatter({ color: false });
      expect(fmt).toBeInstanceOf(OutputFormatter);
    });

    test("should disable color when NO_COLOR is set", () => {
      process.env.NO_COLOR = "1";
      // @ts-expect-error: writable for tests
      process.stdout.isTTY = true;
      const fmt = new OutputFormatter();
      // Color should be disabled because NO_COLOR is set
      const output = fmt.formatError("test error");
      expect(output).toBe("Error: test error");
    });

    test("should disable color when not in TTY", () => {
      delete process.env.NO_COLOR;
      // @ts-expect-error: writable for tests
      process.stdout.isTTY = false;
      const fmt = new OutputFormatter();
      const output = fmt.formatError("test error");
      expect(output).toBe("Error: test error");
    });
  });

  describe("formatError", () => {
    test("should format error messages without color", () => {
      const fmt = new OutputFormatter({ color: false });
      expect(fmt.formatError("File not found")).toBe("Error: File not found");
    });

    test("should not return undefined", () => {
      const fmt = new OutputFormatter({ color: false });
      const output = fmt.formatError("test");
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe("formatWarning", () => {
    test("should format warning messages without color", () => {
      const fmt = new OutputFormatter({ color: false });
      expect(fmt.formatWarning("Deprecated")).toBe("Warning: Deprecated");
    });
  });

  describe("formatSuccess", () => {
    test("should format success messages without color", () => {
      const fmt = new OutputFormatter({ color: false });
      expect(fmt.formatSuccess("Done!")).toBe("Done!");
    });
  });

  describe("formatInfo", () => {
    test("should format info messages without color", () => {
      const fmt = new OutputFormatter({ color: false });
      expect(fmt.formatInfo("Tip: use --help")).toBe("Tip: use --help");
    });
  });

  describe("formatGron", () => {
    test("should format simple gron output", () => {
      const fmt = new OutputFormatter({ color: false });
      const input = 'json = {}\njson.name = "test"\njson.count = 42';
      const output = fmt.formatGron(input);
      expect(output).toContain("json = {}");
      expect(output).toContain('json.name = "test"');
      expect(output).toContain("json.count = 42");
    });

    test("should handle empty input", () => {
      const fmt = new OutputFormatter({ color: false });
      const output = fmt.formatGron("");
      expect(output).toBe("");
    });

    test("should handle whitespace-only input", () => {
      const fmt = new OutputFormatter({ color: false });
      const output = fmt.formatGron("   \n   \n");
      expect(output).toBe("");
    });

    test("should handle pretty formatting option", () => {
      const fmt = new OutputFormatter({ color: false, pretty: true });
      const input = 'json = {}\njson.name = "test"';
      const output = fmt.formatGron(input);
      expect(output).toContain("json = {}");
      expect(output).toContain('json.name = "test"');
    });
  });

  describe("formatJson", () => {
    test("should format JSON without color", () => {
      const fmt = new OutputFormatter({ color: false });
      const input = '{"name":"test","value":42}';
      const output = fmt.formatJson(input);
      expect(output).toContain('"name"');
      expect(output).toContain('"test"');
      expect(output).toContain("42");
    });

    test("should pretty-print JSON when option is set", () => {
      const fmt = new OutputFormatter({ color: false, pretty: true });
      const input = '{"name":"test","value":42}';
      const output = fmt.formatJson(input);
      // Pretty-printed JSON should have newlines and indentation
      expect(output).toContain("\n");
      expect(output).toContain('  "name"');
    });

    test("should handle invalid JSON gracefully", () => {
      const fmt = new OutputFormatter({ color: false, pretty: true });
      const input = "not valid json";
      // Should not throw, should return original input
      const output = fmt.formatJson(input);
      expect(output).toBe("not valid json");
    });
  });

  describe("formatSearchResults", () => {
    test("should format search results without color", () => {
      const fmt = new OutputFormatter({ color: false });
      const results = 'json.name = "Alice"\njson.id = 12345';
      const output = fmt.formatSearchResults(results, "Alice");
      expect(output).toContain("json.name");
      expect(output).toContain("Alice");
    });

    test("should handle empty results", () => {
      const fmt = new OutputFormatter({ color: false });
      const output = fmt.formatSearchResults("", "test");
      expect(output).toBe("");
    });

    test("should escape special regex characters in search term", () => {
      const fmt = new OutputFormatter({ color: false });
      const results = 'json.path = "test(value)"';
      // Should not throw with special characters
      expect(() =>
        fmt.formatSearchResults(results, "test(value)"),
      ).not.toThrow();
    });
  });
});

describe("createFormatter", () => {
  test("should create an OutputFormatter instance", () => {
    const fmt = createFormatter({ color: false });
    expect(fmt).toBeInstanceOf(OutputFormatter);
  });

  test("should create with default options when none provided", () => {
    const fmt = createFormatter();
    expect(fmt).toBeInstanceOf(OutputFormatter);
  });
});

describe("shouldUseColor", () => {
  test("should return false when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    expect(shouldUseColor()).toBe(false);
  });

  test("should return false when stdout is not TTY", () => {
    delete process.env.NO_COLOR;
    // @ts-expect-error: writable for tests
    process.stdout.isTTY = false;
    expect(shouldUseColor()).toBe(false);
  });

  test("should return false when stdin is not TTY", () => {
    delete process.env.NO_COLOR;
    // @ts-expect-error: writable for tests
    process.stdout.isTTY = true;
    // @ts-expect-error: writable for tests
    process.stdin.isTTY = false;
    expect(shouldUseColor()).toBe(false);
  });
});
