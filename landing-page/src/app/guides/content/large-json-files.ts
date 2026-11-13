import { transcript, type Guide } from "../types";

// Every transcript below is pasted from a real run on macOS arm64: gronify
// 1.3.1, Node v22.23.1, jq 1.8.2, stream-json 3.9.0, Apple gzip 479, and zstd
// 1.5.7. events.json is 609,375,097 bytes: one minified array of 3,200,000
// log records. small.json holds its first three records.
export const largeJsonFiles: Guide = {
  slug: "large-json-files",
  title: "Search a large JSON file without loading it | Gronify",
  description:
    "Node stops at ERR_STRING_TOO_LONG near 512 MB and jq parses the whole file first. Search a large JSON file as a stream with gronify search or jq --stream.",
  h1: "Search a multi-gigabyte JSON file from the command line",
  lede: "To search a JSON file that is too large to open, read it as a stream instead of loading it. `gronify search big.json timeout --count` tokenizes the file in chunks and tests each `json.path = value` line as it is produced, so memory does not grow with the number of records.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "why-tools-fail",
      heading: "Why JSON.parse, jq, and editors fail on large JSON files",
      blocks: [
        {
          kind: "paragraph",
          text: "The usual tools read the whole document before they do any work, so their memory grows with the file.",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "`JSON.parse` takes a string. The whole file must become one JavaScript string, and then the parser builds every object and array before it returns. In Node.js the first step fails on a file over about 512 MB.",
            '[jq](https://github.com/jqlang/jq) does not stream by default. Its [FAQ](https://github.com/jqlang/jq/wiki/FAQ) describes the `--stream` parser as the way "to avoid having to read JSON texts completely before processing them". Without it, jq parses each JSON text completely before the filter runs, and a file that is one large array is one text.',
            "[gron](https://github.com/tomnomnom/gron) 0.7.1 decodes the whole document before it prints, and so does any editor or browser viewer that loads the file before it shows anything.",
          ],
        },
      ],
    },
    {
      id: "string-length-error",
      heading:
        'What "Cannot create a string longer than 0x1fffffe8 characters" means',
      blocks: [
        {
          kind: "paragraph",
          text: "Node.js throws this error when one operation would produce a JavaScript string longer than the engine allows. The limit is on the length of one string, so free RAM does not change it. Here it is on Node v22.23.1 with a 609 MB file:",
        },
        {
          kind: "terminal",
          label:
            "Node.js failing to read a 609 MB JSON file with ERR_STRING_TOO_LONG",
          lines: transcript`
$ wc -c events.json
 609375097 events.json
$ node -e 'JSON.parse(require("fs").readFileSync("events.json", "utf8"))' 2>&1 | grep -E "Error|code"
Error: Cannot create a string longer than 0x1fffffe8 characters
  code: 'ERR_STRING_TOO_LONG'
`,
        },
        { kind: "subheading", text: "What the number is" },
        {
          kind: "paragraph",
          text: "`0x1fffffe8` is hexadecimal for 536,870,888, or 2^29 minus 24. That is the longest string V8, the JavaScript engine inside Node, will create, counted in UTF-16 code units. Node exposes it as `buffer.constants.MAX_STRING_LENGTH`:",
        },
        {
          kind: "terminal",
          label: "Printing the maximum string length of the running Node.js",
          lines: transcript`
$ node -p 'require("buffer").constants.MAX_STRING_LENGTH'
536870888
`,
        },
        {
          kind: "paragraph",
          text: 'In ASCII JSON one byte becomes one code unit, so the ceiling is a file of about 512 MB. The [Node.js documentation](https://nodejs.org/api/buffer.html#bufferconstantsmax_string_length) says the value "may depend on the JS engine that is being used", so print the constant on your own version before you rely on 512 MB.',
        },
        { kind: "subheading", text: "What triggers it" },
        {
          kind: "paragraph",
          text: "Any call that turns more than that many bytes into one string triggers it. On Node v22.23.1, each of these failed with `ERR_STRING_TOO_LONG` on the 609 MB file:",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            '`fs.readFileSync(path, "utf8")`',
            "`buffer.toString()`, including `Buffer.concat(chunks).toString()`",
            "`JSON.parse(buffer)`, which converts the Buffer to a string first",
            '`require("./events.json")`',
            "`new TextDecoder().decode(buffer)` and `new Response(buffer).text()`",
          ],
        },
        {
          kind: "paragraph",
          text: 'The same limit has a second message. When JavaScript code builds the string, V8 throws `RangeError: Invalid string length`, with no `code` property. `fs.promises.readFile(path, "utf8")`, `data += chunk` in a stream handler, and `chunks.join("")` all ended that way in the same test.',
        },
        {
          kind: "subheading",
          text: "Why --max-old-space-size does not help",
        },
        {
          kind: "paragraph",
          text: "`--max-old-space-size` raises the ceiling of V8's heap. The string limit is a constant of the engine, so a 16 GB heap fails the same way:",
        },
        {
          kind: "terminal",
          label: "The same error with a 16 GB heap limit",
          lines: transcript`
$ node --max-old-space-size=16384 -e 'JSON.parse(require("fs").readFileSync("events.json", "utf8"))' 2>&1 | grep -E "Error|code"
Error: Cannot create a string longer than 0x1fffffe8 characters
  code: 'ERR_STRING_TOO_LONG'
`,
        },
        {
          kind: "paragraph",
          text: "The flag fixes a different failure. A 300 MB file fits in one string, but with a 512 MB heap `JSON.parse` died with `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`. With `--max-old-space-size=8192` the same file parsed.",
        },
        { kind: "subheading", text: "The 2 GiB limit above it" },
        {
          kind: "paragraph",
          text: "Reading a file larger than 2 GiB in one call, with no encoding, fails with [`ERR_FS_FILE_TOO_LARGE`](https://nodejs.org/api/errors.html#err_fs_file_too_large). On a 3 GiB file, Node v22.23.1 reported `File size (3221225472) is greater than 2 GiB`. So between 512 MB and 2 GiB a file fits in a Buffer but cannot become a string, and above 2 GiB it cannot be read in one call.",
        },
        { kind: "subheading", text: "How to fix it" },
        {
          kind: "paragraph",
          text: "Stop creating the string:",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "In a program, pipe `fs.createReadStream()` into a streaming parser such as [stream-json](https://github.com/uhop/stream-json) or [@streamparser/json](https://github.com/juanjoDiaz/streamparser-json), which hands your code one record at a time.",
            "If you control the writer, write JSON Lines, one object per line, so each line is a small string.",
            "If you only need to look inside the file, use a streaming command-line tool, as in the sections below.",
          ],
        },
        {
          kind: "paragraph",
          text: "This script uses stream-json 3.9.0 to count the error records in the file that `JSON.parse` could not read:",
        },
        {
          kind: "terminal",
          label:
            "Counting records in a 609 MB JSON file with a streaming parser in Node.js",
          lines: transcript`
$ cat count-errors.mjs
import fs from "node:fs";
import chain from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";

let errors = 0;
const records = chain([
  fs.createReadStream(process.argv[2]),
  parser(),
  streamArray(),
]);
records.on("data", ({ value }) => {
  if (value.level === "error") errors += 1;
});
records.on("end", () => console.log(errors));
$ node count-errors.mjs events.json
47762
`,
        },
      ],
    },
    {
      id: "streaming-search",
      heading: "Search a large JSON file as a stream",
      blocks: [
        {
          kind: "paragraph",
          text: "`events.json` is the 609,375,097-byte file from the error above: one minified array of 3.2 million log records. It is that size because 609 MB is just past Node's string limit; the same commands run unchanged on a multi-gigabyte file. [Install Gronify](/#install), and three commands answer most first questions about it.",
        },
        {
          kind: "terminal",
          label:
            "Counting matches, capping matches, and printing the first paths of a 609 MB JSON file",
          lines: transcript`
$ gronify search events.json timeout --count
47762
$ gronify search events.json -m 3 timeout
json[1].message = "upstream timeout after 30000 ms"
json[68].message = "upstream timeout after 30000 ms"
json[135].message = "upstream timeout after 30000 ms"
Stopped after 3 matches (--max-count); there may be more
$ gronify flatten --limit 12 events.json
json = []
json[0] = {}
json[0].id = 1000000
json[0].ts = "2026-10-01T00:00:00.000Z"
json[0].level = "info"
json[0].service = "checkout"
json[0].message = "request completed"
json[0].request = {}
json[0].request.id = "req-00000000"
json[0].request.path = "/api/orders/4000"
json[0].request.status = 200
json[0].request.ms = 8
Stopped after 12 lines (--limit); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "`--count` reads the whole file and prints the number of matching lines. `-m 3` stops reading at the third match. `flatten --limit 12` prints the first twelve paths, enough to learn the shape of a record. The flags are explained in the guide on [how to grep JSON](/guides/grep-json), and [the guide to JSON for AI agents](/guides/json-for-ai-agents) explains why the caps matter for a model's context window.",
        },
        {
          kind: "paragraph",
          text: "In the project's benchmark run of 5 November 2026 (gronify 1.3.1, Apple M5 Pro), counting matches in a 1 GB array of records peaked at 55 MiB of memory. [fastgron](https://github.com/adamritter/fastgron) 0.7.7 with its `-F` filter finished the same count sooner, with memory that grew with the file, so it is the better choice when you have about twice the file's size in free RAM. The full table is under [benchmarks](/#benchmarks).",
        },
      ],
    },
    {
      id: "compressed-files",
      heading: "Search gzip and zstd files without unpacking them",
      blocks: [
        {
          kind: "paragraph",
          text: "Gronify has no decompressor of its own. Leave out the file name and it reads standard input, so the decompressor streams into it and nothing is unpacked to disk.",
        },
        {
          kind: "terminal",
          label: "Searching gzip and zstd compressed JSON through a pipe",
          lines: transcript`
$ gzip -dc events.json.gz | gronify search -m 2 "status = 504"
json[1].request.status = 504
json[68].request.status = 504
Stopped after 2 matches (--max-count); there may be more
$ zstd -dc events.json.zst | gronify search --count timeout
47762
`,
        },
        {
          kind: "paragraph",
          text: "With `-m`, Gronify closes the pipe once it has its matches, which kills the decompressor. In the first command gzip exited with status 141 (SIGPIPE) and Gronify with 0, so under `set -o pipefail` the pipeline reports 141 for a search that succeeded.",
        },
      ],
    },
    {
      id: "jq-stream",
      heading: "What jq --stream looks like for the same search",
      blocks: [
        {
          kind: "paragraph",
          text: "With `--stream`, a jq program no longer receives the document. It receives one `[path, leaf]` array per scalar, plus a one-element `[path]` event each time an object or array closes. `small.json` holds the first three records of the large file. These are the events for the first record in jq 1.8.2:",
        },
        {
          kind: "terminal",
          label: "The path and leaf events jq --stream emits for one record",
          lines: transcript`
$ jq -c --stream . small.json | head -11
[[0,"id"],1000000]
[[0,"ts"],"2026-10-01T00:00:00.000Z"]
[[0,"level"],"info"]
[[0,"service"],"checkout"]
[[0,"message"],"request completed"]
[[0,"request","id"],"req-00000000"]
[[0,"request","path"],"/api/orders/4000"]
[[0,"request","status"],200]
[[0,"request","ms"],8]
[[0,"request","ms"]]
[[0,"request"]]
`,
        },
        {
          kind: "paragraph",
          text: "Each event carries the same information as one flattened line, so a search is a `select` on the leaf:",
        },
        {
          kind: "terminal",
          label: "The same search written for jq --stream and for gronify",
          lines: transcript`
$ jq -c --stream 'select(.[1] == "error")' small.json
[[1,"level"],"error"]
$ gronify search small.json error
json[1].level = "error"
`,
        },
        {
          kind: "paragraph",
          text: "`jq --stream` is still the right tool when the answer needs jq's language on a file too large for its normal mode, such as selecting whole records by a condition or reshaping them. The idiom from the jq FAQ rebuilds one top-level array element at a time and passes it to an ordinary filter:",
        },
        {
          kind: "terminal",
          label:
            "Rebuilding records from a jq stream and filtering them with a normal jq program",
          lines: transcript`
$ jq -cn --stream 'fromstream(1 | truncate_stream(inputs)) | select(.level == "error") | {id, path: .request.path}' small.json
{"id":1000001,"path":"/api/cart/4001"}
`,
        },
        {
          kind: "paragraph",
          text: "The same command ran unchanged on the 609 MB file. A line filter sees one value at a time, so Gronify cannot do this. The [jq alternative guide](/guides/jq-alternative) covers how the two tools divide the work.",
        },
      ],
    },
    {
      id: "limits",
      heading: "Limits of Gronify on large files",
      blocks: [
        {
          kind: "paragraph",
          text: "Streaming removes the dependence on record count. These limits remain:",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "One JSON document per run. A JSON Lines file stops at its second object with `Unexpected '{' after the top-level value` and exit status 1. jq, `gron -s`, and `fastgron -s` read JSON Lines.",
            "Memory follows the largest single token and the nesting depth. One string or number must fit in memory, and the output of a very deep document grows with the square of the depth.",
            "`--sort` buffers the members of one object until it closes, and spills to a temporary file in `$TMPDIR` past 64 MiB. A top-level array is still written one record at a time.",
            "`unflatten` streams only input in document order. Out-of-order lines within the first 16 MiB make it rebuild the whole document in memory. After that they are an error.",
            "Colored `unflatten` output builds the whole document in memory, so pass `--no-color` for large inputs.",
            "Errors can arrive late. Output is written while the input is read, so a truncated file prints lines before the error. Check the exit status.",
          ],
        },
      ],
    },
  ],
  faqs: [
    {
      question: "How do I look at the first record of a huge JSON array?",
      answer:
        "Flatten the first few lines and stop: `gronify flatten --limit 12 events.json` printed the first record of the 609 MB file above without reading the rest. To get that record back as JSON, pipe the same lines into `gronify unflatten`, which closes the open array for you. The limit has to end on a record boundary, or the output includes part of the next record.",
    },
    {
      question:
        "Gronify runs on Node.js. Why does it not hit the string length limit?",
      answer:
        "It never builds the string. `flatten` and `search` read the input in chunks (1 MiB from a file path, 64 KiB from standard input), tokenize the raw bytes, and write each line as it is produced. No step holds the file as one JavaScript string, so neither the 512 MB string limit nor the 2 GiB read limit applies.",
    },
    {
      question: "Does --count count records or matching lines?",
      answer:
        "Lines. A record with the term in two values counts twice. To count records, match one key that appears once per record: `gronify search events.json --count 'level = \"error\"'` printed 47762 on the file above, one line per error record.",
    },
    {
      question: "How do I split a large JSON array into smaller files?",
      answer:
        "Stream the elements out as JSON Lines and split on line count: `jq -cn --stream 'fromstream(1 | truncate_stream(inputs))' events.json | split -l 1000000 - part-` wrote four files from the 3.2 million records above, each line one complete record. Gronify does not write JSON Lines, so this is a job for jq.",
    },
  ],
  related: ["grep-json", "json-for-ai-agents", "jq-alternative"],
};
