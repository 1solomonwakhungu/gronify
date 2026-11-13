import { transcript, type Guide } from "../types";

// Every transcript below is pasted from a real run on 2026-11-12: jq 1.8.2,
// Node v22.23.1, Python 3.15.0, gron 0.7.1, fastgron 0.7.7, and gronify 1.3.1,
// against the ledger.json shown in the first jq transcript. jq 1.6 was not
// run; its behaviour is quoted from the jq 1.6 manual and the jq FAQ.
export const jsonNumberPrecision: Guide = {
  slug: "json-number-precision",
  title: "jq large number precision: when big integers get rounded",
  description:
    "jq 1.6 and older round integers above 2^53. jq 1.7 and newer keep a number as written until arithmetic touches it. Check your version and keep ids exact.",
  h1: "Why big integers change in jq, and how to keep them exact",
  lede: "jq 1.6 and older read every number into a 64-bit float, so an integer above 2^53 (9,007,199,254,740,992) is rounded the moment it is parsed. jq 1.7 and newer print a number exactly as it was written unless the filter does arithmetic on it, so `jq .` keeps a 64-bit id and `.id + 0` rounds it. Run `jq --version` to see which rule applies to you.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "why-numbers-change",
      heading: "Why JSON numbers lose digits above 2^53",
      blocks: [
        {
          kind: "paragraph",
          text: "The JSON grammar puts no limit on the length of a number. [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259.html#section-6) leaves the limit to each implementation, and most parsers store numbers as IEEE 754 doubles. A double has a 53-bit significand, so it holds every integer up to 2^53 and, past that, only every second one, then every fourth. A parser that meets `9007199254740993`, which is 2^53 + 1, stores the nearest double it has.",
        },
        {
          kind: "terminal",
          label: "JSON.parse in Node rounding two integers above 2^53",
          lines: transcript`
$ node -e 'console.log(JSON.parse("12345678901234567890"))'
12345678901234567000
$ node -e 'console.log(JSON.parse("9007199254740993"))'
9007199254740992
`,
        },
        {
          kind: "paragraph",
          text: "That is Node v22.23.1. The first number lost its last three digits and the second became a different integer. The same thing happens to 64-bit database keys, snowflake ids, and nanosecond timestamps, which can all exceed 53 bits. Money amounts hit a related problem: `1.10` is printed back as `1.1`, and sums pick up float error.",
        },
      ],
    },
    {
      id: "jq-by-version",
      heading: "Which jq versions round big integers",
      blocks: [
        {
          kind: "paragraph",
          text: "The rule changed in jq 1.7, released on 2023-09-06.",
        },
        {
          kind: "table",
          caption: "How jq handles a number literal, by version",
          columns: [
            "jq version",
            "Number passed through untouched",
            "Number after arithmetic",
            "Source",
          ],
          rows: [
            [
              "1.6 and older",
              "Converted to a double when read, so rounded above 2^53",
              "Double",
              "[1.6 manual](https://jqlang.org/manual/v1.6/#math) and [jq FAQ](https://github.com/jqlang/jq/wiki/FAQ); not run here",
            ],
            [
              "1.7 and 1.7.1",
              "Printed as written",
              "Converted to a double",
              "[1.7 manual](https://jqlang.org/manual/v1.7/#builtin-operators-and-functions); not run here",
            ],
            [
              "1.8.0 and newer",
              "Printed as written, also after unary minus, `abs`, and `length`",
              "Converted to a double",
              "[NEWS for 1.8.0](https://github.com/jqlang/jq/blob/master/NEWS.md); run here on 1.8.2",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: 'The 1.6 manual says "jq currently only has IEEE754 double-precision (64-bit) floating point number support." The jq FAQ says versions up to and including 1.6 "convert very large integers to a floating point approximation on being read" and that for them "the largest number that can be reliably used as an integer is 2^53 (9,007,199,254,740,992)". jq 1.6 was not run for this page, so those quotes stand in for its output.',
        },
        {
          kind: "paragraph",
          text: 'The manual for 1.7 and 1.8 says: "When a number which originally was provided as a literal is never mutated until the end of the program then it is printed to the output in its original literal form." It also says that arithmetic on such a number "will trigger a conversion to the IEEE754 representation".',
        },
        {
          kind: "terminal",
          label: "Checking the installed jq version",
          lines: transcript`
$ jq --version
jq-1.8.2
`,
        },
        {
          kind: "paragraph",
          text: "If this prints `jq-1.6` or lower, the digits are gone before your filter runs and no filter can bring them back. Upgrade jq, or read the file with one of the [tools that print numbers as written](#print-as-written).",
        },
      ],
    },
    {
      id: "jq-1-7-and-newer",
      heading: "What jq 1.7 and newer keep, and what they change",
      blocks: [
        {
          kind: "paragraph",
          text: "These runs use jq 1.8.2 on a small file, `ledger.json`.",
        },
        {
          kind: "terminal",
          label: "jq 1.8.2 passing big integers and decimals through untouched",
          lines: transcript`
$ cat ledger.json
{"entries":[{"id":9007199254740993,"amount":1.10},{"id":12345678901234567890,"amount":-0},{"id":123456789012345678901234567890,"amount":1e-7}],"count":1E2}
$ jq -c . ledger.json
{"entries":[{"id":9007199254740993,"amount":1.10},{"id":12345678901234567890,"amount":-0},{"id":123456789012345678901234567890,"amount":1E-7}],"count":1E+2}
`,
        },
        {
          kind: "paragraph",
          text: "Every id came out as written, and so did `1.10` and `-0`. Two numbers were respelled with the same value: `1e-7` became `1E-7` and `1E2` became `1E+2`. jq 1.8.2 keeps every digit and still rewrites exponents, so a checksum of its output can differ from the input.",
        },
        {
          kind: "terminal",
          label: "Arithmetic in jq 1.8.2 converting numbers to doubles",
          lines: transcript`
$ jq '.entries[].id + 0' ledger.json
9007199254740992
12345678901234567000
123456789012345680000000000000
$ jq '.entries[0].amount, .entries[0].amount + 0' ledger.json
1.10
1.1
`,
        },
        {
          kind: "paragraph",
          text: "Adding zero was enough to convert each id. On 1.8.2 the same happened with `-`, `*`, `/`, `floor`, `round`, and `add` over an array. With `%` the answer was wrong outright: `.entries[0].id % 10` returned `2` for an id that ends in 3. `max`, `min`, `sort`, `unique`, `abs`, and unary minus left the literal alone.",
        },
        {
          kind: "terminal",
          label: "jq 1.8.2 comparing big integers at full precision",
          lines: transcript`
$ jq '.entries[0].id == 9007199254740992' ledger.json
false
$ jq -c '.entries[] | select(.id == 9007199254740993)' ledger.json
{"id":9007199254740993,"amount":1.10}
`,
        },
        {
          kind: "paragraph",
          text: "Comparison uses the full literal, so 2^53 + 1 does not equal 2^53 and `select` returns the right record. In JavaScript, `9007199254740993 === 9007199254740992` is `true`.",
        },
      ],
    },
    {
      id: "keep-ids-exact",
      heading: "How to keep ids exact in jq 1.7 and newer",
      blocks: [
        {
          kind: "paragraph",
          text: "Treat an id as an opaque token. Select it, compare it, sort by it, and pass it along, and keep it out of arithmetic. When a shell variable or a CSV column needs the id as text, `tostring` is safe on jq 1.8.2 and returns the digits as written:",
        },
        {
          kind: "terminal",
          label: "tostring in jq 1.8.2 keeping every digit of a big integer",
          lines: transcript`
$ jq -c '[.entries[].id | tostring]' ledger.json
["9007199254740993","12345678901234567890","123456789012345678901234567890"]
`,
        },
        {
          kind: "paragraph",
          text: 'When the filter has to compute with big integers, use [gojq](https://github.com/itchyny/gojq). Its README says it "supports arbitrary-precision integer calculation while jq does not", and warns that `floor`, `round`, and the other math functions still convert to floating point. [jaq](https://github.com/01mf02/jaq) 3.1.2, run here, returned all three ids intact from `.entries[].id + 0`. It printed `-0` as `0`.',
        },
        {
          kind: "paragraph",
          text: "If you control the API that produces the file, send ids as JSON strings. A string survives every parser on this page.",
        },
      ],
    },
    {
      id: "node-and-python",
      heading: "JSON.parse in Node and browsers, and Python's json module",
      blocks: [
        {
          kind: "paragraph",
          text: "A pipeline can round in a step other than jq. `JSON.parse` returns JavaScript numbers, which are doubles in Node and in every browser, so a script that parses a file and writes it back changes it:",
        },
        {
          kind: "terminal",
          label: "A JSON.parse and JSON.stringify round trip changing numbers",
          lines: transcript`
$ node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync("ledger.json", "utf8"))))'
{"entries":[{"id":9007199254740992,"amount":1.1},{"id":12345678901234567000,"amount":0},{"id":1.2345678901234568e+29,"amount":1e-7}],"count":100}
$ node -e 'console.log(JSON.parse("{\"id\":9007199254740993}", (key, value, context) => key === "id" ? BigInt(context.source) : value))'
{ id: 9007199254740993n }
`,
        },
        {
          kind: "paragraph",
          text: "The first command changed all three ids, `1.10`, `-0`, and `1E2`. The second is the fix on Node v22.23.1: the reviver receives a third argument whose `source` is the number's original text, which [MDN documents](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#the_reviver_parameter), and the id becomes a `BigInt`.",
        },
        {
          kind: "paragraph",
          text: "Python's [json module](https://docs.python.org/3/library/json.html) reads integers into Python's unbounded `int`, so ids stay exact. Decimals go through `float` unless you pass `parse_float`:",
        },
        {
          kind: "terminal",
          label:
            "Python's json module keeping a big integer and shortening 1.10",
          lines: transcript`
$ python3 -c 'import json; print(json.loads("12345678901234567890"))'
12345678901234567890
$ python3 -c 'import json; print(json.loads("1.10"))'
1.1
$ python3 -c 'import json, decimal; print(json.loads("1.10", parse_float=decimal.Decimal))'
1.10
`,
        },
        {
          kind: "paragraph",
          text: "That is Python 3.15.0. A `json.load` followed by `json.dumps` on `ledger.json` kept the three ids and rewrote the other numbers as `1.1`, `0`, `1e-07`, and `100.0`.",
        },
      ],
    },
    {
      id: "print-as-written",
      heading: "Tools that print numbers exactly as written",
      blocks: [
        {
          kind: "paragraph",
          text: "When the job is to look at a value or search for it, use a tool that copies each number's text through unread. The gron family rewrites JSON as one `path = value` line per value. [gron](https://github.com/tomnomnom/gron) 0.7.1, [fastgron](https://github.com/adamritter/fastgron) 0.7.7, and Gronify 1.3.1 all printed every number in `ledger.json` unchanged, and so does jq 1.7 or newer when the filter is `.`. Exact numbers are not a reason to pick one of them over another.",
        },
        {
          kind: "terminal",
          label: "Gronify, gron, and fastgron printing numbers unchanged",
          lines: transcript`
$ gronify search ledger.json --regex "id|amount"
json.entries[0].id = 9007199254740993
json.entries[0].amount = 1.10
json.entries[1].id = 12345678901234567890
json.entries[1].amount = -0
json.entries[2].id = 123456789012345678901234567890
json.entries[2].amount = 1e-7
$ gron ledger.json | grep amount
json.entries[0].amount = 1.10;
json.entries[1].amount = -0;
json.entries[2].amount = 1e-7;
$ fastgron ledger.json | grep id
json.entries[0].id = 9007199254740993
json.entries[1].id = 12345678901234567890
json.entries[2].id = 123456789012345678901234567890
`,
        },
        {
          kind: "paragraph",
          text: "`gronify search` flattens and filters in one streaming pass, so an id copied from a log is found digit for digit. Its options are in [how to grep JSON](/guides/grep-json), the line format is in the guide to [flattening JSON](/guides/flatten-json), and the three gron tools are compared under [gron alternatives](/guides/gron-alternative). Gronify installs with `npm install -g gronify` on Node.js 20 or newer ([install notes](/#install)).",
        },
        {
          kind: "paragraph",
          text: "The trip back to JSON keeps the numbers too. `gronify unflatten` rebuilds the document from the lines, and for this file the result is byte-for-byte the input. The same check on `jq -c .` fails at the first respelled exponent.",
        },
        {
          kind: "terminal",
          label:
            "Flatten and unflatten returning a byte-identical file, and jq differing",
          lines: transcript`
$ gronify flatten ledger.json | gronify unflatten | cmp - ledger.json && echo identical
identical
$ jq -c . ledger.json | cmp - ledger.json
stdin ledger.json differ: char 138, line 1
`,
        },
        {
          kind: "paragraph",
          text: "`unflatten` writes minified JSON and normalizes string escapes, so a pretty-printed input comes back with different whitespace and the same number text. gron-style tools do not compute. To select records by a condition or reshape the output, use jq 1.7 or newer and keep ids out of arithmetic. The guide to [jq alternatives](/guides/jq-alternative) compares the two approaches.",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Is jq safe for money amounts?",
      answer:
        "For reading and printing, yes on jq 1.7 and newer: `1.10` stays `1.10`. Arithmetic runs on doubles, so `jq -n '0.1 + 0.2'` prints `0.30000000000000004` on jq 1.8.2. Add amounts up in a decimal type such as Python's `decimal.Decimal`, or store them as integers in minor units.",
    },
    {
      question: "Why does jq 1.7 or newer still round my big integers?",
      answer:
        "Either the filter does arithmetic on the number, or jq was built without its decimal backend. The manual describes a `--disable-decnum` build option, and jq 1.8 has a builtin that reports it: `jq -n have_decnum` prints `true` when literals are kept ([manual](https://jqlang.org/manual/v1.8/#have_decnum)).",
    },
    {
      question: "Does jq --argjson keep a big integer?",
      answer:
        "Yes on jq 1.8.2. `jq -n --argjson id 9007199254740993 '$id'` prints `9007199254740993`, and `select(.id == $id)` matches the right record. `$id + 1` prints `9007199254740992`, because arithmetic converts the value. `--arg` passes a string, which is never rounded.",
    },
    {
      question:
        "What happens to a number too big for a double, such as 1e1000?",
      answer:
        "Gronify 1.3.1 prints `1e1000` and jq 1.8.2 prints `1E+1000`. Node's `JSON.parse` returns `Infinity`, which `JSON.stringify` writes back as `null`. Python's `json.loads` returns `inf`, which `json.dumps` writes as `Infinity`, and that is not valid JSON. In jq 1.8.2, adding zero to it gives `1.7976931348623157e+308`.",
    },
  ],
  related: ["jq-alternative", "gron-alternative", "flatten-json"],
};
