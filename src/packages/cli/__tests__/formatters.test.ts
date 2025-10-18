import { describe, it, expect } from "@jest/globals";
import { toCsv } from "../src/utils/toCsv.js";
import { toTsv } from "../src/utils/toTsv.js";
import { toMarkdown } from "../src/utils/toMarkdown.js";
import { toTemplate } from "../src/utils/toTemplate.js";
import { normalizeRecords } from "../src/utils/normalizeRecords.js";
import type { NormalizedData } from "../src/utils/normalizeRecords.js";

describe("CSV Formatter", () => {
  it("should format basic data to CSV", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    };

    const result = toCsv(data);
    expect(result).toBe(
      'name,email\nAlice,alice@example.com\nBob,bob@example.com'
    );
  });

  it("should handle fields with commas by quoting", () => {
    const data: NormalizedData = {
      headers: ["name", "address"],
      rows: [{ name: "Alice", address: "123 Main St, Apt 4" }],
    };

    const result = toCsv(data);
    expect(result).toBe('name,address\nAlice,"123 Main St, Apt 4"');
  });

  it("should handle fields with quotes by doubling them", () => {
    const data: NormalizedData = {
      headers: ["name", "quote"],
      rows: [{ name: "Alice", quote: 'She said "Hello"' }],
    };

    const result = toCsv(data);
    expect(result).toBe('name,quote\nAlice,"She said ""Hello"""');
  });

  it("should handle fields with newlines", () => {
    const data: NormalizedData = {
      headers: ["name", "bio"],
      rows: [{ name: "Alice", bio: "Line 1\nLine 2" }],
    };

    const result = toCsv(data);
    expect(result).toBe('name,bio\nAlice,"Line 1\nLine 2"');
  });

  it("should handle missing values as empty strings", () => {
    const data: NormalizedData = {
      headers: ["name", "email", "phone"],
      rows: [
        { name: "Alice", email: "alice@example.com", phone: "" },
        { name: "Bob", email: "", phone: "123-456" },
      ],
    };

    const result = toCsv(data);
    expect(result).toBe(
      'name,email,phone\nAlice,alice@example.com,\nBob,,123-456'
    );
  });

  it("should support custom delimiters", () => {
    const data: NormalizedData = {
      headers: ["name", "value"],
      rows: [{ name: "Alice", value: "100" }],
    };

    const result = toCsv(data, { delimiter: "|" });
    expect(result).toBe('name|value\nAlice|100');
  });

  it("should support no header option", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [{ name: "Alice", email: "alice@example.com" }],
    };

    const result = toCsv(data, { includeHeader: false });
    expect(result).toBe('Alice,alice@example.com');
  });

  it("should handle unicode characters", () => {
    const data: NormalizedData = {
      headers: ["name", "emoji"],
      rows: [{ name: "Alice", emoji: "👋🌍" }],
    };

    const result = toCsv(data);
    expect(result).toBe('name,emoji\nAlice,👋🌍');
  });
});

describe("TSV Formatter", () => {
  it("should format data with tabs", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    };

    const result = toTsv(data);
    expect(result).toBe(
      'name\temail\nAlice\talice@example.com\nBob\tbob@example.com'
    );
  });

  it("should handle fields with tabs by quoting", () => {
    const data: NormalizedData = {
      headers: ["name", "notes"],
      rows: [{ name: "Alice", notes: "item1\titem2" }],
    };

    const result = toTsv(data);
    expect(result).toBe('name\tnotes\nAlice\t"item1\titem2"');
  });
});

describe("Markdown Formatter", () => {
  it("should format basic data to markdown table", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    };

    const result = toMarkdown(data);
    expect(result).toBe(
      '| name | email |\n| --- | --- |\n| Alice | alice@example.com |\n| Bob | bob@example.com |'
    );
  });

  it("should escape pipe characters", () => {
    const data: NormalizedData = {
      headers: ["name", "notes"],
      rows: [{ name: "Alice", notes: "value1 | value2" }],
    };

    const result = toMarkdown(data);
    expect(result).toBe(
      '| name | notes |\n| --- | --- |\n| Alice | value1 \\| value2 |'
    );
  });

  it("should support pretty formatting", () => {
    const data: NormalizedData = {
      headers: ["id", "name"],
      rows: [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ],
    };

    const result = toMarkdown(data, { pretty: true });
    expect(result).toBe(
      '| id | name  |\n| -- | ----- |\n| 1  | Alice |\n| 2  | Bob   |'
    );
  });

  it("should support no header option", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [{ name: "Alice", email: "alice@example.com" }],
    };

    const result = toMarkdown(data, { includeHeader: false });
    expect(result).toBe('| Alice | alice@example.com |');
  });

  it("should handle empty data", () => {
    const data: NormalizedData = {
      headers: [],
      rows: [],
    };

    const result = toMarkdown(data);
    expect(result).toBe('');
  });
});

describe("Template Formatter", () => {
  it("should render basic templates", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    };

    const result = toTemplate(data, { template: "{{name}}: {{email}}" });
    expect(result).toBe('Alice: alice@example.com\nBob: bob@example.com');
  });

  it("should handle missing fields in templates", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "" },
      ],
    };

    const result = toTemplate(data, { template: "{{name}}: {{email}}" });
    expect(result).toBe('Alice: alice@example.com\nBob: ');
  });

  it("should support Handlebars conditionals", () => {
    const data: NormalizedData = {
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "" },
      ],
    };

    const result = toTemplate(data, {
      template: "{{name}}{{#if email}} <{{email}}>{{/if}}",
    });
    expect(result).toBe('Alice <alice@example.com>\nBob');
  });

  it("should support complex templates", () => {
    const data: NormalizedData = {
      headers: ["name", "age", "city"],
      rows: [
        { name: "Alice", age: "30", city: "NYC" },
        { name: "Bob", age: "25", city: "LA" },
      ],
    };

    const result = toTemplate(data, {
      template: "- **{{name}}** ({{age}}) from {{city}}",
    });
    expect(result).toBe('- **Alice** (30) from NYC\n- **Bob** (25) from LA');
  });
});

describe("normalizeRecords", () => {
  it("should normalize array of objects", () => {
    const data = [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ];

    const result = normalizeRecords(data);
    expect(result.headers).toEqual(["name", "email"]);
    expect(result.rows).toEqual(data);
  });

  it("should handle union of keys", () => {
    const data = [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", phone: "123-456" },
      { name: "Carol", email: "carol@example.com", phone: "789-012" },
    ];

    const result = normalizeRecords(data);
    expect(result.headers).toEqual(["name", "email", "phone"]);
    expect(result.rows).toEqual([
      { name: "Alice", email: "alice@example.com", phone: "" },
      { name: "Bob", email: "", phone: "123-456" },
      { name: "Carol", email: "carol@example.com", phone: "789-012" },
    ]);
  });

  it("should flatten nested objects by default", () => {
    const data = [
      { name: "Alice", meta: { city: "NYC", age: 30 } },
    ];

    const result = normalizeRecords(data);
    expect(result.headers).toEqual(["name", "meta.city", "meta.age"]);
    expect(result.rows).toEqual([
      { name: "Alice", "meta.city": "NYC", "meta.age": 30 },
    ]);
  });

  it("should stringify arrays when flattening", () => {
    const data = [
      { name: "Alice", skills: ["Go", "Node"] },
    ];

    const result = normalizeRecords(data);
    expect(result.headers).toEqual(["name", "skills"]);
    expect(result.rows).toEqual([
      { name: "Alice", skills: '["Go","Node"]' },
    ]);
  });

  it("should handle primitives", () => {
    const data = [1, 2, 3];

    const result = normalizeRecords(data);
    expect(result.headers).toEqual(["value"]);
    expect(result.rows).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);
  });

  it("should handle single object", () => {
    const data = { name: "Alice", email: "alice@example.com" };

    const result = normalizeRecords(data);
    expect(result.headers).toEqual(["name", "email"]);
    expect(result.rows).toEqual([data]);
  });

  it("should handle empty array", () => {
    const data: any[] = [];

    const result = normalizeRecords(data);
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("should support custom column name for primitives", () => {
    const data = [1, 2, 3];

    const result = normalizeRecords(data, { columnName: "number" });
    expect(result.headers).toEqual(["number"]);
    expect(result.rows).toEqual([
      { number: 1 },
      { number: 2 },
      { number: 3 },
    ]);
  });

  it("should throw in strict mode for missing fields", () => {
    const data = [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob" },
    ];

    expect(() => normalizeRecords(data, { strict: true })).toThrow("Missing field 'email'");
  });

  it("should not flatten when flattenNested is false", () => {
    const data = [
      { name: "Alice", meta: { city: "NYC" } },
    ];

    const result = normalizeRecords(data, { flattenNested: false });
    expect(result.headers).toEqual(["name", "meta"]);
    expect(result.rows[0]?.meta).toBe('{"city":"NYC"}');
  });
});

