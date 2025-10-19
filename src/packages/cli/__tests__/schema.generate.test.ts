import { inferSchema } from "../src/utils/inferSchema/index";
import { readJson } from "../src/utils/readJson";
import { join } from "node:path";

const fixturesDir = join(__dirname, "fixtures");

describe("Schema Generation", () => {
  test("should infer schema from single file", () => {
    const data = readJson(join(fixturesDir, "valid-users.json"));
    const schema = inferSchema([data]);

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.properties.users).toBeDefined();
    expect(schema.properties.users.type).toBe("array");
    expect(schema.properties.users.items).toBeDefined();
    expect(schema.properties.users.items.properties).toHaveProperty("name");
    expect(schema.properties.users.items.properties).toHaveProperty("email");
    expect(schema.properties.users.items.properties).toHaveProperty("age");
  });

  test("should infer correct types", () => {
    const data = readJson(join(fixturesDir, "tiny.json"));
    const schema = inferSchema([data]);

    expect(schema.properties.name.type).toBe("string");
    expect(schema.properties.count.type).toBe("integer");
    expect(schema.properties.active.type).toBe("boolean");
    expect(schema.properties.value.type).toBe("null");
  });

  test("should detect email format", () => {
    const data = readJson(join(fixturesDir, "valid-users.json"));
    const schema = inferSchema([data], { detectFormats: true });

    const emailProp = schema.properties.users.items.properties.email;
    expect(emailProp.format).toBe("email");
  });

  test("should detect uri format", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema = inferSchema([data], { detectFormats: true });

    const websiteProp = schema.properties.orders.items.properties.website;
    expect(websiteProp.format).toBe("uri");
  });

  test("should detect date-time format", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema = inferSchema([data], { detectFormats: true });

    const dateProp = schema.properties.orders.items.properties.date;
    expect(dateProp.format).toBe("date-time");
  });

  test("should infer enum for categorical fields", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema = inferSchema([data], { enumThreshold: 8 });

    const statusProp = schema.properties.orders.items.properties.status;
    expect(statusProp.enum).toBeDefined();
    expect(statusProp.enum).toContain("completed");
    expect(statusProp.enum).toContain("pending");
  });

  test("should respect enum threshold", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    
    // With threshold of 1, should not create enum (2 values > 1)
    const schema1 = inferSchema([data], { enumThreshold: 1 });
    const statusProp1 = schema1.properties.orders.items.properties.status;
    expect(statusProp1.enum).toBeUndefined();

    // With threshold of 8, should create enum (2 values <= 8)
    const schema8 = inferSchema([data], { enumThreshold: 8 });
    const statusProp8 = schema8.properties.orders.items.properties.status;
    expect(statusProp8.enum).toBeDefined();
  });

  test("should infer min/max for numbers", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema = inferSchema([data], { minmax: true });

    const idProp = schema.properties.orders.items.properties.id;
    expect(idProp.minimum).toBe(1);
    expect(idProp.maximum).toBe(2);
  });

  test("should infer minLength/maxLength for strings", () => {
    const data = readJson(join(fixturesDir, "valid-users.json"));
    const schema = inferSchema([data], { minmax: true });

    const nameProp = schema.properties.users.items.properties.name;
    expect(nameProp.minLength).toBeDefined();
    expect(nameProp.maxLength).toBeDefined();
  });

  test("should infer minItems/maxItems for arrays", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema = inferSchema([data], { minmax: true });

    const itemsProp = schema.properties.orders.items.properties.items;
    expect(itemsProp.minItems).toBeDefined();
    expect(itemsProp.maxItems).toBeDefined();
  });

  test("should respect required policy: observed", () => {
    const data = readJson(join(fixturesDir, "valid-users.json"));
    const schema = inferSchema([data], { requiredPolicy: "observed" });

    expect(schema.required).toContain("users");
    expect(schema.properties.users.items.required).toContain("name");
    expect(schema.properties.users.items.required).toContain("email");
    expect(schema.properties.users.items.required).toContain("age");
  });

  test("should respect required policy: loose", () => {
    const data = readJson(join(fixturesDir, "valid-users.json"));
    const schema = inferSchema([data], { requiredPolicy: "loose" });

    expect(schema.required).toBeUndefined();
  });

  test("should merge multiple samples", () => {
    const data1 = { name: "Alice", age: 30 };
    const data2 = { name: "Bob", age: 25, city: "NYC" };
    const schema = inferSchema([data1, data2], { requiredPolicy: "observed" });

    // Name and age are in both, so should be required
    expect(schema.required).toContain("name");
    expect(schema.required).toContain("age");
    
    // City is only in one, so should not be required with "observed" policy
    expect(schema.required).not.toContain("city");
    
    // But city should be in properties
    expect(schema.properties.city).toBeDefined();
  });

  test("should handle additionalProperties option", () => {
    const data = readJson(join(fixturesDir, "tiny.json"));
    
    const schemaTrue = inferSchema([data], { additionalProperties: true });
    expect(schemaTrue.additionalProperties).toBe(true);

    const schemaFalse = inferSchema([data], { additionalProperties: false });
    expect(schemaFalse.additionalProperties).toBe(false);
  });

  test("should include examples when enabled", () => {
    const data = readJson(join(fixturesDir, "tiny.json"));
    const schema = inferSchema([data], { examples: true });

    expect(schema.properties.name.examples).toBeDefined();
    expect(schema.properties.name.examples.length).toBeGreaterThan(0);
  });

  test("should exclude examples when disabled", () => {
    const data = readJson(join(fixturesDir, "tiny.json"));
    const schema = inferSchema([data], { examples: false });

    expect(schema.properties.name.examples).toBeUndefined();
  });

  test("should add title and id when provided", () => {
    const data = readJson(join(fixturesDir, "tiny.json"));
    const schema = inferSchema([data], {
      title: "Test Schema",
      id: "https://example.com/schemas/test",
    });

    expect(schema.title).toBe("Test Schema");
    expect(schema.$id).toBe("https://example.com/schemas/test");
  });

  test("should produce deterministic output", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema1 = inferSchema([data]);
    const schema2 = inferSchema([data]);

    expect(JSON.stringify(schema1)).toBe(JSON.stringify(schema2));
  });

  test("should handle nested objects", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema = inferSchema([data]);

    expect(schema.properties.meta).toBeDefined();
    expect(schema.properties.meta.type).toBe("object");
    expect(schema.properties.meta.properties.total).toBeDefined();
    expect(schema.properties.meta.properties.page).toBeDefined();
  });

  test("should handle arrays of strings", () => {
    const data = readJson(join(fixturesDir, "orders-mixed.json"));
    const schema = inferSchema([data]);

    const itemsProp = schema.properties.orders.items.properties.items;
    expect(itemsProp.type).toBe("array");
    expect(itemsProp.items.type).toBe("string");
  });

  test("should support different draft versions", () => {
    const data = readJson(join(fixturesDir, "tiny.json"));

    const schema2020 = inferSchema([data], { draft: "2020-12" });
    expect(schema2020.$schema).toBe("https://json-schema.org/draft/2020-12/schema");

    const schema2019 = inferSchema([data], { draft: "2019-09" });
    expect(schema2019.$schema).toBe("https://json-schema.org/draft/2019-09/schema");

    const schema07 = inferSchema([data], { draft: "07" });
    expect(schema07.$schema).toBe("http://json-schema.org/draft-07/schema#");
  });
});

