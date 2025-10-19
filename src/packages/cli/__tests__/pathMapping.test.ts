import { jsonPointerToGron, dataPathToGron } from "../src/utils/jsonPointerToGron";

describe("JSON Pointer to Gron Path Mapping", () => {
  test("should convert root pointer to json", () => {
    expect(jsonPointerToGron("")).toBe("json");
    expect(jsonPointerToGron("/")).toBe("json");
  });

  test("should convert simple object paths", () => {
    expect(jsonPointerToGron("/name")).toBe("json.name");
    expect(jsonPointerToGron("/user/name")).toBe("json.user.name");
  });

  test("should convert array indices", () => {
    expect(jsonPointerToGron("/users/0")).toBe("json.users[0]");
    expect(jsonPointerToGron("/users/0/name")).toBe("json.users[0].name");
    expect(jsonPointerToGron("/a/0/b")).toBe("json.a[0].b");
  });

  test("should handle JSON Pointer escapes", () => {
    expect(jsonPointerToGron("/a~1b/0")).toBe('json["a/b"][0]');
    expect(jsonPointerToGron("/a~0b")).toBe("json.a~b");
  });

  test("should use bracket notation for complex identifiers", () => {
    expect(jsonPointerToGron("/my-field")).toBe('json["my-field"]');
    expect(jsonPointerToGron("/field with spaces")).toBe('json["field with spaces"]');
  });

  test("should handle nested arrays", () => {
    expect(jsonPointerToGron("/matrix/0/1")).toBe("json.matrix[0][1]");
  });
});

describe("Data Path to Gron Path", () => {
  test("should convert empty path to json", () => {
    expect(dataPathToGron([])).toBe("json");
  });

  test("should convert simple paths", () => {
    expect(dataPathToGron(["name"])).toBe("json.name");
    expect(dataPathToGron(["user", "name"])).toBe("json.user.name");
  });

  test("should convert array indices", () => {
    expect(dataPathToGron(["users", 0])).toBe("json.users[0]");
    expect(dataPathToGron(["users", 0, "name"])).toBe("json.users[0].name");
  });

  test("should use bracket notation for special characters", () => {
    expect(dataPathToGron(["my-field"])).toBe('json["my-field"]');
    expect(dataPathToGron(["field with spaces"])).toBe('json["field with spaces"]');
  });
});

