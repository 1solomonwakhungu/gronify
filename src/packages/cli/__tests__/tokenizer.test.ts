import { JsonSyntaxError, JsonTokenizer, type JsonGate, type JsonSink } from "../src/tokenizer";

/** Records events as readable strings, decoding raw token bytes. */
class RecordingSink implements JsonSink {
  events: string[] = [];

  startObject(): void {
    this.events.push("{");
  }
  endObject(): void {
    this.events.push("}");
  }
  startArray(): void {
    this.events.push("[");
  }
  endArray(): void {
    this.events.push("]");
  }
  key(buf: Buffer, start: number, end: number, escaped: boolean): void {
    this.events.push(`key ${buf.toString("utf8", start, end)}${escaped ? " (escaped)" : ""}`);
  }
  string(buf: Buffer, start: number, end: number, escaped: boolean): void {
    this.events.push(`str ${buf.toString("utf8", start, end)}${escaped ? " (escaped)" : ""}`);
  }
  number(buf: Buffer, start: number, end: number): void {
    this.events.push(`num ${buf.toString("utf8", start, end)}`);
  }
  literal(buf: Buffer, start: number, end: number): void {
    this.events.push(`lit ${buf.toString("utf8", start, end)}`);
  }
}

function tokenize(chunks: Array<Buffer | string>): string[] {
  const sink = new RecordingSink();
  const tokenizer = new JsonTokenizer(sink);
  for (const chunk of chunks) tokenizer.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
  tokenizer.end();
  return sink.events;
}

function splitAt(bytes: Buffer, index: number): Buffer[] {
  return [bytes.subarray(0, index), bytes.subarray(index)];
}

function failure(chunks: Array<Buffer | string>): JsonSyntaxError {
  try {
    tokenize(chunks);
  } catch (error) {
    expect(error).toBeInstanceOf(JsonSyntaxError);
    expect(error).toBeInstanceOf(SyntaxError);
    return error as JsonSyntaxError;
  }
  throw new Error("expected a syntax error");
}

describe("JsonTokenizer", () => {
  describe("valid input", () => {
    test("emits tokens in document order", () => {
      expect(tokenize(['{"b":[1,"x",true,false,null],"a":{}}'])).toEqual([
        "{",
        "key \"b\"",
        "[",
        "num 1",
        'str "x"',
        "lit true",
        "lit false",
        "lit null",
        "]",
        'key "a"',
        "{",
        "}",
        "}",
      ]);
    });

    test("accepts scalar top-level values and surrounding whitespace", () => {
      expect(tokenize([" \t\r\n42 \n"])).toEqual(["num 42"]);
      expect(tokenize(['"hi"'])).toEqual(['str "hi"']);
      expect(tokenize(["null"])).toEqual(["lit null"]);
      expect(tokenize(["true"])).toEqual(["lit true"]);
    });

    test("accepts empty containers with inner whitespace", () => {
      expect(tokenize(["[ ]"])).toEqual(["[", "]"]);
      expect(tokenize(["{\n}"])).toEqual(["{", "}"]);
    });

    test.each(["0", "-0", "1", "-1", "10", "1.5", "-1.5", "1e2", "1E2", "1e+2", "1e-7", "1.10", "0.0", "0e0", "123456789012345678901234567890"])(
      "keeps number %s verbatim",
      (literal) => {
        expect(tokenize([`[${literal}]`])).toEqual(["[", `num ${literal}`, "]"]);
        expect(tokenize([literal])).toEqual([`num ${literal}`]);
      },
    );

    test("reports escapes only when a backslash is present", () => {
      expect(tokenize(['["plain","a\\nb","\\u00e9","\\"","\\\\","\\/"]'])).toEqual([
        "[",
        'str "plain"',
        'str "a\\nb" (escaped)',
        'str "\\u00e9" (escaped)',
        'str "\\"" (escaped)',
        'str "\\\\" (escaped)',
        'str "\\/" (escaped)',
        "]",
      ]);
    });

    test("accepts non-ASCII text, astral characters, DEL and lone surrogate escapes", () => {
      const document = '["é", "日本語", "😀", "\u007f", "\\ud800", "\\ud83d\\ude00", " "]';
      const events = tokenize([document]);
      expect(events).toContain('str "日本語"');
      expect(events).toContain('str "😀"');
      expect(events).toContain('str "\\ud800" (escaped)');
    });

    test("keeps duplicate keys as separate events", () => {
      expect(tokenize(['{"a":1,"a":2}'])).toEqual(["{", 'key "a"', "num 1", 'key "a"', "num 2", "}"]);
    });

    test("tracks nesting far deeper than the call stack allows", () => {
      const depth = 200_000;
      const events = tokenize(["[".repeat(depth) + "]".repeat(depth)]);
      expect(events).toHaveLength(depth * 2);
    });

    test("handles every chunk boundary of a document that exercises all token types", () => {
      const document = Buffer.from(
        '  {"k\\u00e9y": [1, -2.5e-7, 12345678901234567890, "s\\"tr\\n", "日本😀", true, false, null, {"x": []}],\n "z":0}  ',
        "utf8",
      );
      const expected = tokenize([document]);
      for (let index = 0; index <= document.length; index += 1) {
        expect(tokenize(splitAt(document, index))).toEqual(expected);
      }
    });

    test("handles one-byte chunks", () => {
      const document = Buffer.from('{"a":[10,"x\\u0041y",true,null],"b":-1.5e+3}', "utf8");
      const expected = tokenize([document]);
      const chunks = Array.from(document, (_, i) => document.subarray(i, i + 1));
      expect(tokenize(chunks)).toEqual(expected);
    });

    test("handles a three-way split inside a multi-byte character and an escape", () => {
      const document = Buffer.from('["日本\\u00e9語"]', "utf8");
      const expected = tokenize([document]);
      for (let first = 1; first < document.length - 1; first += 1) {
        for (let second = first + 1; second < document.length; second += 1) {
          const chunks = [document.subarray(0, first), document.subarray(first, second), document.subarray(second)];
          expect(tokenize(chunks)).toEqual(expected);
        }
      }
    });

    test("handles a string larger than many chunks", () => {
      const text = "x".repeat(100_000);
      const document = Buffer.from(`["${text}"]`, "utf8");
      const chunks: Buffer[] = [];
      for (let at = 0; at < document.length; at += 997) chunks.push(document.subarray(at, at + 997));
      expect(tokenize(chunks)).toEqual(["[", `str "${text}"`, "]"]);
    });
  });

  describe("pausing", () => {
    test("stops between tokens while the gate is blocked and resumes from the returned index", () => {
      const sink = new RecordingSink();
      const gate: JsonGate = { blocked: false };
      const originalNumber = sink.number.bind(sink);
      sink.number = (buf, start, end) => {
        originalNumber(buf, start, end);
        gate.blocked = true;
      };
      const tokenizer = new JsonTokenizer(sink, gate);
      const document = Buffer.from("[1,2,3]", "utf8");

      let pos = 0;
      const stops: number[] = [];
      while (pos < document.length) {
        pos = tokenizer.write(document, pos);
        stops.push(pos);
        gate.blocked = false;
      }
      tokenizer.end();

      expect(sink.events).toEqual(["[", "num 1", "num 2", "num 3", "]"]);
      expect(stops.length).toBeGreaterThan(1);
    });
  });

  describe("invalid input", () => {
    test.each([
      ["empty input", ""],
      ["only whitespace", "  \n "],
      ["trailing comma in an array", "[1,]"],
      ["trailing comma in an object", '{"a":1,}'],
      ["leading comma", "[,1]"],
      ["double comma", "[1,,2]"],
      ["missing comma", "[1 2]"],
      ["missing colon", '{"a" 1}'],
      ["unquoted key", "{a:1}"],
      ["single quotes", "['a']"],
      ["line comment", "[1] // note"],
      ["block comment", "/* c */ [1]"],
      ["trailing garbage", "[1] x"],
      ["two top-level values", "1 2"],
      ["extra closing bracket", "[1]]"],
      ["mismatched closer", "[1}"],
      ["unclosed array", "[1"],
      ["unclosed object", '{"a":1'],
      ["unterminated string", '"abc'],
      ["bad escape", '"\\q"'],
      ["short unicode escape", '"\\u12"'],
      ["non-hex unicode escape", '"\\u12G4"'],
      ["raw newline in string", '"a\nb"'],
      ["raw tab in string", '"a\tb"'],
      ["NUL in string", '"a\u0000b"'],
      ["leading zero", "[01]"],
      ["negative leading zero", "[-01]"],
      ["bare minus", "[-]"],
      ["plus sign", "[+1]"],
      ["trailing dot", "[1.]"],
      ["leading dot", "[.5]"],
      ["empty exponent", "[1e]"],
      ["hex number", "[0x10]"],
      ["Infinity", "[Infinity]"],
      ["NaN", "[NaN]"],
      ["undefined", "[undefined]"],
      ["misspelled literal", "[tru]"],
      ["literal with suffix", "[nullx]"],
      ["capitalised literal", "[True]"],
      ["object key that is not a string", "{1:2}"],
      ["value missing", '{"a":}'],
      ["BOM", "﻿[]"],
    ])("rejects %s", (_name, text) => {
      failure([text]);
    });

    test("rejects an invalid UTF-8 byte sequence inside a string", () => {
      const error = failure([Buffer.from([0x22, 0xc3, 0x28, 0x22])]);
      expect(error.message).toContain("Invalid UTF-8");
      expect(error.offset).toBe(0);
    });

    test("rejects an encoded surrogate inside a string", () => {
      failure([Buffer.from([0x22, 0xed, 0xa0, 0x80, 0x22])]);
    });

    test("rejects the same inputs regardless of chunk boundaries", () => {
      for (const text of ['{"a":1,}', '"a\\q"', "[01]", "[1] x", '{"a":[1,2}']) {
        const document = Buffer.from(text, "utf8");
        const expected = failure([document]);
        for (let index = 0; index <= document.length; index += 1) {
          const error = failure(splitAt(document, index));
          expect(error.offset).toBe(expected.offset);
          expect(error.message).toBe(expected.message);
        }
      }
    });

    test("reports the byte offset, line and column", () => {
      const error = failure(['{\n  "a": 1,\n  "b": ?\n}']);
      expect(error.offset).toBe(19);
      expect(error.line).toBe(3);
      expect(error.column).toBe(8);
      expect(error.message).toContain("byte offset 19");
      expect(error.message).toContain("line 3, column 8");
    });

    test("counts offsets across chunks and in bytes, not characters", () => {
      const error = failure(['["é",', "]"]);
      // [ " é(2 bytes) " , = 6 bytes, then the ']' at offset 6.
      expect(error.offset).toBe(6);
      expect(error.message).toContain("trailing commas");
    });

    test("reports end-of-input errors at the end of the input", () => {
      expect(failure(["[1,2"]).offset).toBe(4);
      expect(failure(['"abc']).offset).toBe(0);
      expect(failure([""]).offset).toBe(0);
    });

    test("points at the start of a bad number", () => {
      expect(failure(["[1, 01]"]).offset).toBe(4);
    });

    test("does not buffer an unbounded run of letters", () => {
      const error = failure(["tru" + "e".repeat(1000)]);
      expect(error.offset).toBe(0);
    });
  });
});
