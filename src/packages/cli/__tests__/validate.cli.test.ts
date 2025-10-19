import { validateWithAjv } from "../src/utils/validateWithAjv";
import { readJson } from "../src/utils/readJson";
import { join } from "node:path";

const fixturesDir = join(__dirname, "fixtures");

describe("Validation CLI", () => {
  describe("validateWithAjv", () => {
    test("should validate valid data successfully", () => {
      const data = readJson(join(fixturesDir, "valid-users.json"));
      const schema = readJson(join(fixturesDir, "schema.users.json"));

      const result = validateWithAjv(data, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should detect invalid data and report gron paths", () => {
      const data = readJson(join(fixturesDir, "invalid-users.json"));
      const schema = readJson(join(fixturesDir, "schema.users.json"));

      const result = validateWithAjv(data, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Check that errors have gron paths
      const errorPaths = result.errors.map((e) => e.gronPath);
      expect(errorPaths).toContain("json.users[0].email"); // Invalid email format
      expect(errorPaths.some(p => p.includes("json.users[1]"))).toBe(true); // Missing required or wrong type
    });

    test("should report format validation errors", () => {
      const data = readJson(join(fixturesDir, "invalid-users.json"));
      const schema = readJson(join(fixturesDir, "schema.users.json"));

      const result = validateWithAjv(data, schema, { formats: true });

      expect(result.valid).toBe(false);

      // Find the format error
      const formatError = result.errors.find((e) => e.keyword === "format");
      expect(formatError).toBeDefined();
      expect(formatError?.gronPath).toBe("json.users[0].email");
    });

    test("should report type validation errors", () => {
      const data = readJson(join(fixturesDir, "invalid-users.json"));
      const schema = readJson(join(fixturesDir, "schema.users.json"));

      const result = validateWithAjv(data, schema);

      expect(result.valid).toBe(false);

      // Find type error (name should be string, not number)
      const typeError = result.errors.find(
        (e) => e.keyword === "type" && e.gronPath.includes("users[1]")
      );
      expect(typeError).toBeDefined();
    });

    test("should report required field errors", () => {
      const data = readJson(join(fixturesDir, "invalid-users.json"));
      const schema = readJson(join(fixturesDir, "schema.users.json"));

      const result = validateWithAjv(data, schema);

      expect(result.valid).toBe(false);

      // Find required error
      const requiredError = result.errors.find((e) => e.keyword === "required");
      expect(requiredError).toBeDefined();
    });

    test("should support different draft versions", () => {
      const data = { name: "test" };
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      const result2020 = validateWithAjv(data, schema, { draft: "2020-12" });
      expect(result2020.valid).toBe(true);

      const result07 = validateWithAjv(data, schema, { draft: "07" });
      expect(result07.valid).toBe(true);
    });

    test("should handle allErrors option", () => {
      const data = readJson(join(fixturesDir, "invalid-users.json"));
      const schema = readJson(join(fixturesDir, "schema.users.json"));

      const resultAll = validateWithAjv(data, schema, { allErrors: true });
      const errorCountAll = resultAll.errors.length;

      const resultFirst = validateWithAjv(data, schema, { allErrors: false });
      const errorCountFirst = resultFirst.errors.length;

      expect(errorCountAll).toBeGreaterThanOrEqual(errorCountFirst);
    });

    test("should validate tiny.json schema generation", () => {
      const data = readJson(join(fixturesDir, "tiny.json"));
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "integer" },
          active: { type: "boolean" },
          value: { type: "null" },
        },
      };

      const result = validateWithAjv(data, schema);
      expect(result.valid).toBe(true);
    });
  });
});

