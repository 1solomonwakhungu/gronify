import { createLineMatcher, type MatcherOptions } from "../src/matcher";

function matches(line: string, term: string, options: MatcherOptions = {}): boolean {
  const buf = Buffer.from(`xx${line}yy`, "utf8");
  return createLineMatcher(term, options).test(buf, 2, buf.length - 2);
}

/** What the previous implementation did for plain searches. */
function referenceMatch(line: string, term: string, caseSensitive: boolean): boolean {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "" : "i").test(line);
}

describe("createLineMatcher", () => {
  test("matches literal substrings case-insensitively by default", () => {
    expect(matches('json.user.name = "Alice"', "alice")).toBe(true);
    expect(matches('json.user.name = "Alice"', "NAME =")).toBe(true);
    expect(matches('json.user.name = "Alice"', "bob")).toBe(false);
  });

  test("respects case sensitivity", () => {
    expect(matches('json.user = "Alice"', "alice", { caseSensitive: true })).toBe(false);
    expect(matches('json.user = "Alice"', "Alice", { caseSensitive: true })).toBe(true);
  });

  test("treats regex metacharacters literally in plain mode", () => {
    expect(matches("json.a = 1", "a.*1")).toBe(false);
    expect(matches("json.a.*1 = 1", "a.*1")).toBe(true);
    expect(matches("json[0] = 1", "[0]")).toBe(true);
    expect(matches("json.a = (x)", "(x)")).toBe(true);
  });

  test("only looks inside the given range", () => {
    const buf = Buffer.from("needle|haystack|needle", "utf8");
    expect(createLineMatcher("needle").test(buf, 7, 15)).toBe(false);
    expect(createLineMatcher("stack").test(buf, 7, 15)).toBe(true);
    expect(createLineMatcher("hay").test(buf, 7, 9)).toBe(false);
  });

  test("handles needles at the edges and longer than the line", () => {
    expect(matches("abc", "abc")).toBe(true);
    expect(matches("abc", "a")).toBe(true);
    expect(matches("abc", "c")).toBe(true);
    expect(matches("abc", "abcd")).toBe(false);
    expect(matches("", "a")).toBe(false);
  });

  test("an empty term matches every line", () => {
    expect(matches("anything", "")).toBe(true);
    expect(matches("", "")).toBe(true);
  });

  test("agrees with the regex implementation on a spread of inputs", () => {
    const lines = [
      'json.a.b = "AbAbAb"',
      "json[10].x = null",
      'json["é"] = "É日本語"',
      'json.k = "ſtraße İstanbul KELVIN"',
      'json.s = "aaaaab"',
    ];
    const terms = ["ab", "AB", "aab", "aaab", "b", "10]", "é", "É", "日本", "ſ", "ss", "İ", "i", "k", "K", "x\u0000", "ba", "aaaaab", "aaaaaab"];
    for (const line of lines) {
      for (const term of terms) {
        for (const caseSensitive of [false, true]) {
          expect({ line, term, caseSensitive, got: matches(line, term, { caseSensitive }) }).toEqual({
            line,
            term,
            caseSensitive,
            got: referenceMatch(line, term, caseSensitive),
          });
        }
      }
    }
  });

  test("non-ASCII terms follow regex case folding rules", () => {
    expect(matches('json.k = "ÉCOLE"', "école")).toBe(true);
    expect(matches('json.k = "école"', "ÉCOLE")).toBe(true);
    expect(matches('json.k = "école"', "ÉCOLE", { caseSensitive: true })).toBe(false);
  });

  test("regex mode honours flags and throws on invalid patterns", () => {
    expect(matches("json.user[3] = 1", String.raw`user\[\d+\]`, { regex: true })).toBe(true);
    expect(matches("json.USER = 1", "user", { regex: true })).toBe(true);
    expect(matches("json.USER = 1", "user", { regex: true, caseSensitive: true })).toBe(false);
    expect(() => createLineMatcher("[", { regex: true })).toThrow(SyntaxError);
  });
});
