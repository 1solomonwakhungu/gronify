import { transcript, type Guide } from "../types";

// Every transcript below is pasted from a real run on macOS 27.2.1, Apple M5
// Pro: Node v22.23.1, gronify 1.3.1, stream-json 3.9.0 with stream-chain
// 4.4.2, and BSD sed. export.json is 582,287,912 bytes: one minified array of
// 2,800,000 order records. Blank lines in Node's error output are dropped by
// the transcript format.
export const fixErrStringTooLongJson: Guide = {
  slug: "fix-err-string-too-long-json",
  title: "Fix ERR_STRING_TOO_LONG and Invalid string length in Node",
  description:
    "Node.js throws ERR_STRING_TOO_LONG or RangeError: Invalid string length on JSON over 512 MB. Find the failing call, stream it in code, inspect it with gronify.",
  h1: "Fix RangeError: Invalid string length when reading large JSON in Node.js",
  lede: "Node.js throws `ERR_STRING_TOO_LONG` or `RangeError: Invalid string length` when a JSON file or a `JSON.stringify` result would be one string longer than V8 allows, about 512 MB. More memory does not fix it. The fix is to stop building the string: parse the file as a stream in code, write records one at a time, and inspect the file from the shell with `gronify search`, which never loads it.",
  published: "2026-11-20",
  updated: "2026-11-20",
  sections: [
    {
      id: "which-error",
      heading: "Which error you get depends on the call",
      blocks: [
        {
          kind: "paragraph",
          text: "The examples use `export.json`, a 582 MB minified array of 2.8 million orders. This is the usual way to load a JSON file in Node.js:",
        },
        {
          kind: "terminal",
          label:
            "fs.readFileSync and JSON.parse failing with ERR_STRING_TOO_LONG",
          lines: transcript`
$ wc -c export.json
 582287912 export.json
$ cat load.js
const fs = require("node:fs");
const orders = JSON.parse(fs.readFileSync("export.json", "utf8"));
console.log(orders.length);
$ node load.js
node:fs:440
    return binding.readFileUtf8(path, stringToFlags(options.flag));
                   ^
Error: Cannot create a string longer than 0x1fffffe8 characters
    at Object.readFileSync (node:fs:440:20)
    at Object.<anonymous> (/private/tmp/gg/big/load.js:2:30)
    at Module._compile (node:internal/modules/cjs/loader:1781:14)
    at Object..js (node:internal/modules/cjs/loader:1913:10)
    at Module.load (node:internal/modules/cjs/loader:1505:32)
    at Function._load (node:internal/modules/cjs/loader:1309:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:254:19)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49 {
  code: 'ERR_STRING_TOO_LONG'
}
Node.js v22.23.1
`,
        },
        {
          kind: "paragraph",
          text: "`JSON.parse` never ran. `readFileSync` failed while turning the bytes into one string. The same limit produces a second message when the string is built in JavaScript rather than in Node's C++ code, as `fs.promises.readFile` does:",
        },
        {
          kind: "terminal",
          label:
            "fs.promises.readFile failing with RangeError: Invalid string length",
          lines: transcript`
$ node load-async.mjs
node:internal/fs/promises:591
      result += decoder.write(readBuffer);
                        ^
RangeError: Invalid string length
    at readFileHandle (node:internal/fs/promises:591:25)
    at async file:///private/tmp/gg/big/load-async.mjs:2:27
Node.js v22.23.1
`,
        },
        {
          kind: "paragraph",
          text: 'Writing hits the same wall. `save.js` builds 2.8 million order objects in memory, which fits, and then calls `fs.writeFileSync("copy.json", JSON.stringify(orders))`. The objects are fine; the single string `JSON.stringify` returns is too long:',
        },
        {
          kind: "terminal",
          label:
            "JSON.stringify failing with RangeError: Invalid string length",
          lines: transcript`
$ node save.js
/private/tmp/gg/big/save.js:6
fs.writeFileSync("copy.json", JSON.stringify(orders));
                                   ^
RangeError: Invalid string length
    at JSON.stringify (<anonymous>)
    at Object.<anonymous> (/private/tmp/gg/big/save.js:6:36)
    at Module._compile (node:internal/modules/cjs/loader:1781:14)
    at Object..js (node:internal/modules/cjs/loader:1913:10)
    at Module.load (node:internal/modules/cjs/loader:1505:32)
    at Function._load (node:internal/modules/cjs/loader:1309:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:254:19)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49
Node.js v22.23.1
`,
        },
        {
          kind: "table",
          caption:
            "Calls that failed on the 582 MB file in Node v22.23.1, and the error each one threw",
          columns: ["Call", "Error", "Fix"],
          rows: [
            [
              '`fs.readFileSync(path, "utf8")`',
              "`ERR_STRING_TOO_LONG`",
              "Stream the file into a parser",
            ],
            [
              "`JSON.parse(fs.readFileSync(path))` with a Buffer",
              "`ERR_STRING_TOO_LONG`, from `Buffer.toString`",
              "Stream the file into a parser",
            ],
            [
              '`require("./export.json")`',
              "`ERR_STRING_TOO_LONG`",
              "Stream the file into a parser",
            ],
            [
              '`fs.promises.readFile(path, "utf8")`',
              "`RangeError: Invalid string length`",
              "Stream the file into a parser",
            ],
            [
              "`data += chunk` in a stream `data` handler",
              "`RangeError: Invalid string length`",
              "Parse the chunks instead of joining them",
            ],
            [
              "`JSON.stringify(records)`",
              "`RangeError: Invalid string length`",
              "Write one record at a time",
            ],
          ],
        },
      ],
    },
    {
      id: "the-limit",
      heading: "Why more memory does not help",
      blocks: [
        {
          kind: "paragraph",
          text: "Both messages report one limit: the longest string V8 will create, which Node exposes as `buffer.constants.MAX_STRING_LENGTH`. `0x1fffffe8` in the first message is the same number in hexadecimal.",
        },
        {
          kind: "terminal",
          label: "Printing the maximum string length of Node.js",
          lines: transcript`
$ node -p 'require("buffer").constants.MAX_STRING_LENGTH'
536870888
`,
        },
        {
          kind: "paragraph",
          text: "That is 2^29 minus 24 UTF-16 code units. In ASCII JSON one byte is one code unit, so the ceiling is a file of about 512 MB. It is a constant of the engine, not of the heap, so `--max-old-space-size` changes nothing; [searching large JSON files](/guides/large-json-files#string-length-error) shows the same error with a 16 GB heap and covers the separate 2 GiB read limit above it.",
        },
      ],
    },
    {
      id: "stream-in-code",
      heading: "Fix it in code: parse the file as a stream",
      blocks: [
        {
          kind: "paragraph",
          text: "A streaming parser reads the file in chunks and hands your code one array element at a time, so no step holds the whole file. [stream-json](https://github.com/uhop/stream-json) is one such parser; [@streamparser/json](https://github.com/juanjoDiaz/streamparser-json) is another. This script counts refunded orders in the file `JSON.parse` could not read:",
        },
        {
          kind: "terminal",
          label: "Counting records in a 582 MB JSON array with stream-json",
          lines: transcript`
$ cat sum-refunds.mjs
import fs from "node:fs";
import chain from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
let refunded = 0;
const orders = chain([
  fs.createReadStream(process.argv[2]),
  parser(),
  streamArray(),
]);
orders.on("data", ({ value }) => {
  if (value.status === "refunded") refunded += 1;
});
orders.on("end", () => console.log(refunded));
$ /usr/bin/time -l node sum-refunds.mjs export.json 2>&1 | grep -E '^[0-9]+$|real|maximum resident'
560000
       16.08 real        15.29 user         0.71 sys
           113934336  maximum resident set size
`,
        },
        {
          kind: "paragraph",
          text: 'Peak memory was 109 MiB for a 582 MB file. `streamArray()` fits a top-level array. For records nested under a key, such as `{"orders": [...]}`, add stream-json\'s `pick` filter in front of it to select that array.',
        },
      ],
    },
    {
      id: "write-in-chunks",
      heading: "Fix JSON.stringify: write one record at a time",
      blocks: [
        {
          kind: "paragraph",
          text: "To write a large array, stringify each record on its own and write the pieces to a file stream. Waiting for `drain` when `write` returns false keeps memory flat:",
        },
        {
          kind: "terminal",
          label:
            "Writing a 760 MB JSON array one record at a time and checking it with gronify",
          lines: transcript`
$ cat write-array.mjs
import fs from "node:fs";
import { once } from "node:events";
async function writeJsonArray(path, records) {
  const out = fs.createWriteStream(path);
  let first = true;
  for (const record of records) {
    const text = (first ? "[" : ",") + JSON.stringify(record);
    first = false;
    if (!out.write(text)) await once(out, "drain");
  }
  out.end(first ? "[]\n" : "]\n");
  await once(out, "finish");
}
function* orders(count) {
  for (let i = 0; i < count; i++) {
    yield { id: "ord_" + String(i).padStart(8, "0"), status: "paid" };
  }
}
await writeJsonArray(process.argv[2], orders(Number(process.argv[3])));
$ node write-array.mjs copy.json 20000000
$ wc -c copy.json
 760000002 copy.json
$ gronify search copy.json --count ord_
20000000
`,
        },
        {
          kind: "paragraph",
          text: "The 760 MB result is valid JSON: Gronify parsed it to the end and counted all 20 million records. If whoever reads the file can take it, write JSON Lines instead, one object per line, so each line is a small string on the reading side too.",
        },
      ],
    },
    {
      id: "inspect-without-code",
      heading: "Inspect the file without writing code",
      blocks: [
        {
          kind: "paragraph",
          text: "Often the error appears while you only want to look inside the file: check its shape, count something, or pull out one record. Gronify is a Node.js CLI, but it tokenizes the raw bytes in chunks and writes each `json.path = value` line as it goes, so it never creates the long string. [Install Gronify](/#install), then:",
        },
        {
          kind: "terminal",
          label: "The first record and two counts from a 582 MB JSON file",
          lines: transcript`
$ gronify flatten --limit 15 export.json
json = []
json[0] = {}
json[0].id = "ord_00000000"
json[0].created = "2026-10-01T00:00:00.000Z"
json[0].status = "paid"
json[0].amount = {}
json[0].amount.value = 0
json[0].amount.currency = "EUR"
json[0].customer = {}
json[0].customer.id = "cus_0"
json[0].customer.country = "DE"
json[0].items = []
json[0].items[0] = {}
json[0].items[0].sku = "SKU-0"
json[0].items[0].qty = 1
Stopped after 15 lines (--limit); there may be more
$ gronify search export.json --count 'status = "refunded"'
560000
$ gronify search export.json --count card_declined
280000
`,
        },
        {
          kind: "paragraph",
          text: "`flatten --limit 15` printed the first record and stopped reading. The counts read the whole file. Including ` = ` and the quotes in the first term pins it to the `status` value, so a refund note in another field would not be counted.",
        },
        { kind: "subheading", text: "Find one record and get it back as JSON" },
        {
          kind: "paragraph",
          text: "`-m 1` finds the record's array index and stops reading. A regex on that index then selects every line of the record, `sed` renames the record's path to the root, and `gronify unflatten` turns the lines back into JSON:",
        },
        {
          kind: "terminal",
          label:
            "Locating one record by id and extracting it as JSON from a 582 MB file",
          lines: transcript`
$ gronify search export.json -m 1 ord_01234567
json[1234567].id = "ord_01234567"
Stopped after 1 match (--max-count); there may be more
$ gronify search export.json --regex '^json\[1234567\]' | sed 's/^json\[1234567\]/json/' | gronify --pretty unflatten
{
  "id": "ord_01234567",
  "created": "2026-10-15T06:56:07.000Z",
  "status": "paid",
  "amount": {
    "value": 289.79,
    "currency": "EUR"
  },
  "customer": {
    "id": "cus_136073",
    "country": "US"
  },
  "items": [
    {
      "sku": "SKU-667",
      "qty": 2
    }
  ]
}
`,
        },
        {
          kind: "paragraph",
          text: "The `\\]` in the pattern matters: without it, `^json\\[1234567` would also match records 12345670 to 12345679 in a larger file.",
        },
        { kind: "subheading", text: "Memory" },
        {
          kind: "terminal",
          label: "Time and peak memory of gronify search on a 582 MB file",
          lines: transcript`
$ /usr/bin/time -l gronify search export.json --count 'status = "refunded"' 2>&1 | grep -E '^[0-9]+$|real|maximum resident'
560000
        2.22 real         2.19 user         0.05 sys
            55787520  maximum resident set size
`,
        },
        {
          kind: "paragraph",
          text: "Peak memory was 53 MiB, and it does not grow with the number of records. For more on searching files this size, including gzip input and `jq --stream`, see [search a multi-gigabyte JSON file](/guides/large-json-files).",
        },
      ],
    },
    {
      id: "which-fix",
      heading: "Which fix to use",
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [
            "Your program needs every record: stream the file into a parser such as stream-json.",
            "Your program writes the file: write one record at a time, or write JSON Lines.",
            "You need to look inside the file, count values, or pull out a record: `gronify search` and `gronify flatten --limit`, with no code.",
            "You need to filter or reshape records from the shell: `jq --stream`, as shown in [the jq alternative guide](/guides/jq-alternative) and [searching large JSON files](/guides/large-json-files#jq-stream).",
          ],
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Does --max-old-space-size fix ERR_STRING_TOO_LONG?",
      answer:
        "No. The flag raises the heap limit, and the string limit is a fixed constant of V8. It does fix a different error, `JavaScript heap out of memory`, which appears when the file fits in one string but the parsed objects do not fit in the heap.",
    },
    {
      question: "What file size causes RangeError: Invalid string length?",
      answer:
        "About 512 MB of ASCII JSON on current Node.js, where `buffer.constants.MAX_STRING_LENGTH` is 536,870,888. Print the constant on your own Node version, since the Node.js documentation says it may depend on the JavaScript engine.",
    },
    {
      question:
        "How do I see what is inside a JSON file that is too big to open?",
      answer:
        "`gronify flatten --limit 30 big.json` prints the first 30 paths and stops reading, which is enough to learn the shape of a record. `gronify search big.json --count term` counts matches without loading the file.",
    },
    {
      question:
        "Why does gronify not hit the string limit when it runs on Node.js?",
      answer:
        "It reads the input in chunks, tokenizes the raw bytes, and writes each output line as soon as it is complete. No step joins the file into one JavaScript string.",
    },
  ],
  related: ["large-json-files", "json-for-ai-agents", "unflatten-json"],
};
