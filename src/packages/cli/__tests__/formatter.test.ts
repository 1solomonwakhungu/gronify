// Mock chalk to avoid ESM issues in jest's CommonJS environment. The stand-in still wraps text in ANSI codes, so a
// colored line reaches the pretty formatter looking like a real one.
jest.mock("chalk", () => {
  const wrap = (s: string) => `\u001b[36m${s}\u001b[39m`;
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
  loadColors,
  shouldUseColor,
} from "../src/formatter";
import { flattenJson } from "../src/gron";

// Colored formatting needs chalk, which the formatter loads on demand.
beforeAll(() => loadColors());

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

  describe("streaming line formatters", () => {
    const gron = [
      "json = {}",
      "json.users = []",
      "json.users[0] = {}",
      'json.users[0].name = "Alice"',
      "json.users[0].tags = []",
      'json.users[0].tags[0] = "a"',
      "json.settings = {}",
      "json.settings.deep.er.still.and.more.and.more.x = 1",
      "json.settings.flag = true",
      "json.id = null",
    ];

    /** The pretty form of `gron`: two spaces per level below the top-level keys, a blank line between groups. */
    const prettyGron = [
      "json = {}",
      "json.users = []",
      "",
      "  json.users[0] = {}",
      '    json.users[0].name = "Alice"',
      "    json.users[0].tags = []",
      '      json.users[0].tags[0] = "a"',
      "",
      "json.settings = {}",
      "",
      "            json.settings.deep.er.still.and.more.and.more.x = 1",
      "  json.settings.flag = true",
      "",
      "json.id = null",
    ].join("\n");

    test("returns null when there is nothing to format", () => {
      const fmt = new OutputFormatter({ color: false, pretty: false });
      expect(fmt.createGronLineFormatter()).toBeNull();
      expect(fmt.createSearchLineFormatter("x")).toBeNull();
    });

    test("pretty lines joined with newlines equal the batch pretty output", () => {
      const fmt = new OutputFormatter({ color: false, pretty: true });
      const format = fmt.createGronLineFormatter()!;
      expect(gron.map(format).join("\n")).toBe(prettyGron);
      expect(fmt.formatGron(gron.join("\n"))).toBe(prettyGron);
    });

    test("each stream formatter starts with fresh grouping state", () => {
      const fmt = new OutputFormatter({ color: false, pretty: true });
      const first = fmt.createGronLineFormatter()!;
      gron.forEach((line) => first(line));
      const second = fmt.createGronLineFormatter()!;
      expect(second(gron[0]!)).toBe("json = {}");
      // A stale state would put a blank separator in front of this line.
      expect(second(gron[1]!)).toBe("json.users = []");
    });

    test("search formatter matches formatSearchResults line by line when color is on", () => {
      // @ts-expect-error: writable for tests
      process.stdout.isTTY = true;
      delete process.env.NO_COLOR;
      const fmt = new OutputFormatter({ color: true });
      const format = fmt.createSearchLineFormatter("name")!;
      expect(format).toBeInstanceOf(Function);
      expect(gron.map(format).join("\n")).toBe(fmt.formatSearchResults(gron.join("\n"), "name"));
    });
  });

  describe("pretty indentation", () => {
    const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");

    /** Formats each line with a formatter of its own, so no grouping separator gets in the way of the indentation. */
    function prettyLine(line: string, color = false): string {
      if (color) {
        // @ts-expect-error: writable for tests
        process.stdout.isTTY = true;
        delete process.env.NO_COLOR;
      }
      return new OutputFormatter({ color, pretty: true }).createGronLineFormatter()!(line);
    }

    /** Leading spaces of every non-blank line of pretty output. */
    function indents(output: string): number[] {
      return output
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => line.length - line.trimStart().length);
    }

    /** What the indentation should be, read off the document itself and never off the printed lines. */
    function expectedIndents(doc: unknown, cap = 6): number[] {
      const result: number[] = [];
      const walk = (value: unknown, depth: number): void => {
        result.push(2 * Math.min(Math.max(0, depth - 1), cap));
        if (value !== null && typeof value === "object") {
          for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child, depth + 1);
        }
      };
      walk(doc, 0);
      return result;
    }

    test.each([
      "1",
      "0.5",
      "-1.25e-7",
      "true",
      "null",
      "{}",
      "[]",
      '"plain"',
      '"db.internal"',
      '"a[0]"',
      '"]"',
      '"[[[...]]]"',
      '"x = y"',
      '" = "',
      '"https://example.com/a.b?c[]=1"',
      '"a \\"quoted\\" [.] value"',
    ])("indents siblings alike whatever the value: %s", (value) => {
      expect(prettyLine(`json.a.k = ${value}`)).toBe(`  json.a.k = ${value}`);
      expect(prettyLine(`json.k = ${value}`)).toBe(`json.k = ${value}`);
    });

    test("indents the reported document evenly", () => {
      const fmt = new OutputFormatter({ color: false, pretty: true });
      expect(fmt.formatGron(flattenJson({ a: { lag: 0.5, host: "db.internal", n: 1 } }))).toBe(
        ["json = {}", "json.a = {}", "", "  json.a.lag = 0.5", '  json.a.host = "db.internal"', "  json.a.n = 1"].join("\n"),
      );
    });

    test("does not read a string value that looks like a path", () => {
      expect(prettyLine('json.a = "json.b.c.d[0].e = 1"')).toBe('json.a = "json.b.c.d[0].e = 1"');
      expect(prettyLine('json.a.b = "json[\\"x.y\\"][0] = {}"')).toBe('  json.a.b = "json[\\"x.y\\"][0] = {}"');
      expect(prettyLine('json.a[0] = "json = []"')).toBe('  json.a[0] = "json = []"');
    });

    test("counts a bracket-quoted key as one level, whatever it contains", () => {
      expect(prettyLine('json["a.b"] = 1')).toBe('json["a.b"] = 1');
      expect(prettyLine('json["a.b"].c = 1')).toBe('  json["a.b"].c = 1');
      expect(prettyLine('json["a.b.c.d.e.f"]["g.h"] = 1')).toBe('  json["a.b.c.d.e.f"]["g.h"] = 1');
      expect(prettyLine('json["x = y"].c = "v"')).toBe('  json["x = y"].c = "v"');
      expect(prettyLine('json["k[0]"]["[[["].c = 1')).toBe('    json["k[0]"]["[[["].c = 1');
      expect(prettyLine('json.a["json.b = 1"] = 2')).toBe('  json.a["json.b = 1"] = 2');
      expect(prettyLine('json[""].a = 1')).toBe('  json[""].a = 1');
    });

    test("finds the end of a quoted key that holds escaped quotes and backslashes", () => {
      // The keys are `q"]. = [`, `a\` and `\"`: the path only ends after the real closing quote.
      expect(prettyLine('json["q\\"]. = ["].z = "]"')).toBe('  json["q\\"]. = ["].z = "]"');
      expect(prettyLine('json["a\\\\"].b = "x.y"')).toBe('  json["a\\\\"].b = "x.y"');
      expect(prettyLine('json["\\\\\\""].b.c = 1')).toBe('    json["\\\\\\""].b.c = 1');
    });

    test("indents array elements by their own depth", () => {
      expect(prettyLine("json.a = []")).toBe("json.a = []");
      expect(prettyLine("json.a[0] = 1.5")).toBe("  json.a[0] = 1.5");
      expect(prettyLine("json.a[0] = []")).toBe("  json.a[0] = []");
      expect(prettyLine('json.a[0][12] = "x.y[0]"')).toBe('    json.a[0][12] = "x.y[0]"');
      expect(prettyLine("json[0] = {}")).toBe("json[0] = {}");
      expect(prettyLine("json[0].a = 0.5")).toBe("  json[0].a = 0.5");
    });

    test("stops indenting after six levels", () => {
      const path = (segments: number) => `json${".a".repeat(segments)}`;
      expect(prettyLine(`${path(6)} = 1`)).toBe(`${" ".repeat(10)}${path(6)} = 1`);
      expect(prettyLine(`${path(7)} = 1`)).toBe(`${" ".repeat(12)}${path(7)} = 1`);
      expect(prettyLine(`${path(8)} = 1`)).toBe(`${" ".repeat(12)}${path(8)} = 1`);
      expect(prettyLine(`${path(40)}[0]["b.c"] = "x.y"`)).toBe(`${" ".repeat(12)}${path(40)}[0]["b.c"] = "x.y"`);
      // A value full of dots and brackets pushes neither a shallow line to the cap nor a line past it.
      expect(prettyLine('json.a.a = "......[[[[[["')).toBe('  json.a.a = "......[[[[[["');
    });

    test("indents the root line by nothing, whatever its value", () => {
      expect(prettyLine("json = 1.5")).toBe("json = 1.5");
      expect(prettyLine('json = "a.b[0] = c"')).toBe('json = "a.b[0] = c"');
      expect(prettyLine("json = []")).toBe("json = []");
    });

    test("gives colored lines the indentation of plain ones", () => {
      const lines = [
        "json.a.lag = 0.5",
        'json.a.host = "db.internal"',
        "json.a.n = 1",
        "json.a.tags = []",
        'json.a.tags[0] = "x[0] = y"',
        'json["a.b"]["x = y"].c = "v.w"',
        'json["q\\"]. = ["].z = "]"',
        "json.a.a.a.a.a.a.a.a.a = 1.25",
      ];
      for (const line of lines) {
        const plain = prettyLine(line);
        const colored = prettyLine(line, true);
        expect(stripAnsi(colored)).toBe(plain);
        expect(colored.length - colored.trimStart().length).toBe(plain.length - plain.trimStart().length);
      }
      // The lines the colorizer recognises really are colored, so the indentation was computed on a colored line.
      expect(prettyLine(lines[0]!, true)).toMatch(/^  \u001b\[/);
    });

    test.each([false, true])("matches the depth of every node of a document with hostile keys and values (color: %s)", (color) => {
      const doc = {
        "a.b": { "x = y": { "k[0]": [1.5, "json.a.b = 1", [], {}], 'q"]. = [': { z: "]", "": [[["a.b[0] = c"]]] } } },
        plain: { lag: 0.5, host: "db.internal", n: 1, list: [0.25, "a[0]", { "é.ü": "…", "\\": "\\.", "tab\t.": [] }] },
        deep: { d: { d: { d: { d: { d: { d: { d: { d: [1.25, { "x.y": "z.w" }] } } } } } } } },
        "json.id = 1": "json.id = 1",
        id: 1,
      };
      const gronLines = flattenJson(doc).split("\n");
      if (color) {
        // @ts-expect-error: writable for tests
        process.stdout.isTTY = true;
        delete process.env.NO_COLOR;
      }
      const format = new OutputFormatter({ color, pretty: true }).createGronLineFormatter()!;
      const output = stripAnsi(gronLines.map(format).join("\n"));

      expect(indents(output)).toEqual(expectedIndents(doc));
      // Indentation and grouping only add whitespace: the lines themselves are untouched.
      expect(output.split("\n").filter((line) => line !== "").map((line) => line.trimStart())).toEqual(gronLines);
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
