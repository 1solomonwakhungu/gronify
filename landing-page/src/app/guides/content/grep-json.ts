import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.3.1 (plus grep, jq 1.8.2,
// gzip, and curl) run against the orders.json shown in the first transcript.
export const grepJson: Guide = {
  slug: "grep-json",
  title: "How to grep JSON: search nested JSON from the command line",
  description:
    "Plain grep prints a whole minified line or a key with no parent. Flatten JSON to one path per line and filter it with gronify search to locate each match.",
  h1: "How to grep nested JSON from the command line",
  lede: "To grep JSON, flatten it first so that every value sits on its own line next to its full path, then filter those lines. `gronify search orders.json pending` does both in one streaming pass and prints each match as `json.path = value`, so you can see where in the document the match lives.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "why-grep-fails",
      heading: "Why plain grep fails on JSON",
      blocks: [
        {
          kind: "paragraph",
          text: "grep works one line at a time, and JSON does not put one fact on one line. APIs and export jobs usually write it minified, so the whole document is a single line and any hit prints all of it. The examples on this page use a small orders payload saved as `orders.json`:",
        },
        {
          kind: "terminal",
          label: "grep on minified JSON prints the entire document",
          lines: transcript`
$ grep pending orders.json
{"service":{"name":"checkout","status":"degraded"},"orders":[{"id":1001,"status":"shipped","customer":{"email":"ada@example.com"}},{"id":1002,"status":"Pending","customer":{"email":"grace@example.com"}},{"id":1003,"status":"pending","customer":{"email":"alan@example.org"},"error":{"code":"CARD_DECLINED"}}]}
`,
        },
        {
          kind: "paragraph",
          text: "Pretty-printing first gives grep one key per line, and then the matching line has lost its parents:",
        },
        {
          kind: "terminal",
          label: "grep on pretty-printed JSON prints a key with no parent path",
          lines: transcript`
$ jq . orders.json | grep pending
      "status": "pending",
`,
        },
        {
          kind: "paragraph",
          text: "That output says some `status` is `pending`. It does not say which order, or whether the key sits under `orders` at all. It also skipped order 1002, whose status is spelled `Pending`, because grep is case-sensitive unless you pass `-i`.",
        },
      ],
    },
    {
      id: "flatten-then-filter",
      heading: "Flatten first, then filter",
      blocks: [
        {
          kind: "paragraph",
          text: "The fix comes from [gron](https://github.com/tomnomnom/gron): rewrite the document as one assignment per value, each with its full path from the root. After that, a line filter returns complete answers.",
        },
        {
          kind: "terminal",
          label: "The orders payload flattened to one path assignment per line",
          lines: transcript`
$ gronify flatten orders.json
json = {}
json.service = {}
json.service.name = "checkout"
json.service.status = "degraded"
json.orders = []
json.orders[0] = {}
json.orders[0].id = 1001
json.orders[0].status = "shipped"
json.orders[0].customer = {}
json.orders[0].customer.email = "ada@example.com"
json.orders[1] = {}
json.orders[1].id = 1002
json.orders[1].status = "Pending"
json.orders[1].customer = {}
json.orders[1].customer.email = "grace@example.com"
json.orders[2] = {}
json.orders[2].id = 1003
json.orders[2].status = "pending"
json.orders[2].customer = {}
json.orders[2].customer.email = "alan@example.org"
json.orders[2].error = {}
json.orders[2].error.code = "CARD_DECLINED"
`,
        },
        {
          kind: "paragraph",
          text: "Any line tool works on this output, so `gronify flatten orders.json | grep pending` is a valid pipeline. `gronify search` runs the flatten and the filter in one process. That saves a second tool on machines without grep, such as a stock Windows shell, and it lets Gronify stop reading the file as soon as it has the matches you asked for.",
        },
      ],
    },
    {
      id: "search-text-and-regex",
      heading: "Search with plain text or a regex",
      blocks: [
        {
          kind: "paragraph",
          text: "`gronify search <file> <term>` prints every flattened line that contains the term. The term is compared against the whole line, so it can be part of a key, part of a value, or an array position such as `orders[2]`.",
        },
        {
          kind: "terminal",
          label: "Plain-text search for a value in nested JSON",
          lines: transcript`
$ gronify search orders.json pending
json.orders[1].status = "Pending"
json.orders[2].status = "pending"
`,
        },
        {
          kind: "paragraph",
          text: "For patterns, add `--regex` (short form `-r`). The pattern is a JavaScript regular expression. Alternation, groups, anchors, and character classes behave as they do in `grep -E`. POSIX classes such as `[[:digit:]]` are not understood, so write `[0-9]`. Because each line starts with the path, a pattern can pin a match to one place in the document:",
        },
        {
          kind: "terminal",
          label: "Regex search on the path side and on the value side",
          lines: transcript`
$ gronify search orders.json --regex "orders\[[0-9]+\]\.customer\.email"
json.orders[0].customer.email = "ada@example.com"
json.orders[1].customer.email = "grace@example.com"
json.orders[2].customer.email = "alan@example.org"
$ gronify search orders.json --regex 'status = "(pending|degraded)"'
json.service.status = "degraded"
json.orders[1].status = "Pending"
json.orders[2].status = "pending"
`,
        },
        {
          kind: "paragraph",
          text: "The first pattern returns the email of every order and skips any other line that happens to contain `email`. The second matches on the value side of the assignment, quotes included.",
        },
      ],
    },
    {
      id: "case-sensitivity",
      heading: "Case sensitivity",
      blocks: [
        {
          kind: "paragraph",
          text: "Search ignores case by default, which is the reverse of grep. That is why `pending` also found `Pending` above. Pass `--case-sensitive` (short form `-c`) for an exact-case match, with or without `--regex`.",
        },
        {
          kind: "terminal",
          label: "Case-sensitive search returns only the lowercase match",
          lines: transcript`
$ gronify search orders.json --case-sensitive pending
json.orders[2].status = "pending"
`,
        },
        {
          kind: "paragraph",
          text: "In grep, `-c` counts matches. In Gronify, `-c` means case-sensitive, and counting is spelled `--count`.",
        },
      ],
    },
    {
      id: "count-cap-invert",
      heading: "Count, cap, and invert matches",
      blocks: [
        { kind: "subheading", text: "Count before printing" },
        {
          kind: "paragraph",
          text: "`--count` prints the number of matching lines and nothing else.",
        },
        {
          kind: "terminal",
          label: "Counting matching lines",
          lines: transcript`
$ gronify search orders.json --count status
4
`,
        },
        { kind: "subheading", text: "Stop after the first matches" },
        {
          kind: "paragraph",
          text: "`-m <n>` (long form `--max-count`) prints the first n matches in document order and then stops reading the input, so a match near the top of a large file returns without scanning the rest. The notice on the last line goes to stderr, so it stays out of a pipe or a redirected file.",
        },
        {
          kind: "terminal",
          label: "Capping a search at two matches",
          lines: transcript`
$ gronify search orders.json -m 2 status
json.service.status = "degraded"
json.orders[0].status = "shipped"
Stopped after 2 matches (--max-count); there may be more
`,
        },
        { kind: "subheading", text: "Print everything except a pattern" },
        {
          kind: "paragraph",
          text: "`-v` (long form `--invert-match`) keeps the lines that do not match.",
        },
        {
          kind: "terminal",
          label: "Inverted search that drops every line under orders",
          lines: transcript`
$ gronify search orders.json -v orders
json = {}
json.service = {}
json.service.name = "checkout"
json.service.status = "degraded"
`,
        },
      ],
    },
    {
      id: "exit-status",
      heading: "Use the result in a shell script",
      blocks: [
        {
          kind: "paragraph",
          text: "By default `gronify search` exits 0 whether or not anything matched, so an empty result does not break an existing script. Add `--exit-status` to get grep's convention: 0 when at least one line matched, 1 when none did, and 2 for an error such as invalid JSON, a missing file, or a bad pattern.",
        },
        {
          kind: "terminal",
          label: "Branching on the exit status of a JSON search",
          lines: transcript`
$ gronify search --exit-status orders.json refunded; echo $?
Warning: No matches found for 'refunded'
Tip: Search is a case-insensitive substring match; use --regex for patterns
1
$ if gronify search --exit-status orders.json -m 1 CARD_DECLINED > /dev/null 2>&1; then echo "an order was declined"; fi
an order was declined
`,
        },
        {
          kind: "paragraph",
          text: "With `-m 1`, Gronify stops reading at the first hit, which is all a yes-or-no test needs.",
        },
      ],
    },
    {
      id: "stdin",
      heading: "Search JSON from curl, gzip, or any pipe",
      blocks: [
        {
          kind: "paragraph",
          text: "Leave out the file name and Gronify reads standard input. The only argument left is the search term.",
        },
        {
          kind: "terminal",
          label: "Searching an API response and a gzipped file through a pipe",
          lines: transcript`
$ curl -s https://api.github.com/repos/1solomonwakhungu/gronify | gronify search -m 3 license
json.license = {}
json.license.key = "mit"
json.license.name = "MIT License"
Stopped after 3 matches (--max-count); there may be more
$ gzip -dc orders.json.gz | gronify search -m 1 email
json.orders[0].customer.email = "ada@example.com"
Stopped after 1 match (--max-count); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "Input is parsed as it arrives and is not loaded whole, so memory does not grow with the number of records. With `-m`, Gronify closes the pipe once it has enough matches. Each run reads exactly one JSON document. A log with one object per line (NDJSON) stops with an error at the second object, and that is a job for ripgrep or jq.",
        },
      ],
    },
    {
      id: "back-to-json",
      heading: "Turn matches back into JSON",
      blocks: [
        {
          kind: "paragraph",
          text: "`gronify unflatten` reads flattened lines and writes JSON. It needs every container line, such as `json = {}` and `json.orders = []`, before the values inside it. A narrow search prints only leaf lines, so piping it straight into `unflatten` fails with `root must be assigned before child paths`. There are two ways to keep the containers.",
        },
        {
          kind: "paragraph",
          text: "The first is to remove what you do not want with `-v`, which leaves every parent in place. This drops the customer records and rebuilds the rest:",
        },
        {
          kind: "terminal",
          label:
            "Removing a subtree with an inverted search and rebuilding JSON",
          lines: transcript`
$ gronify search orders.json -v customer | gronify unflatten
{"service":{"name":"checkout","status":"degraded"},"orders":[{"id":1001,"status":"shipped"},{"id":1002,"status":"Pending"},{"id":1003,"status":"pending","error":{"code":"CARD_DECLINED"}}]}
`,
        },
        {
          kind: "paragraph",
          text: "The second is to name the parents in the pattern. Here `^json = ` keeps the root line, and `service` keeps the `json.service` container along with its values:",
        },
        {
          kind: "terminal",
          label:
            "Extracting one object by keeping its parent lines in the regex",
          lines: transcript`
$ gronify search orders.json --regex '^json = |service' | gronify --pretty unflatten
{
  "service": {
    "name": "checkout",
    "status": "degraded"
  }
}
`,
        },
      ],
    },
    {
      id: "jq-or-ripgrep",
      heading: "When jq or ripgrep is the better choice",
      blocks: [
        {
          kind: "paragraph",
          text: "Searching flattened paths suits a document whose shape you do not know yet, or a one-off look that is not worth a query. Other jobs have better tools.",
        },
        {
          kind: "paragraph",
          text: "[jq](https://github.com/jqlang/jq) is the right choice once you know the path. It selects whole records by a condition and returns a different field of the same record, which a line filter cannot do:",
        },
        {
          kind: "terminal",
          label: "jq selecting a record by one field and printing another",
          lines: transcript`
$ jq -r '.orders[] | select(.status == "pending") | .customer.email' orders.json
alan@example.org
`,
        },
        {
          kind: "paragraph",
          text: "[ripgrep](https://github.com/BurntSushi/ripgrep) is the right choice for many files at once, for NDJSON logs where each line is already one record, and for a plain test of whether a string occurs anywhere. It does not parse JSON, so it cannot report a path.",
        },
        {
          kind: "table",
          caption: "Which tool fits which JSON search job",
          columns: ["Job", "Tool", "Why"],
          rows: [
            [
              "Find where a key or value lives in an unfamiliar document",
              "`gronify search`",
              "Each match prints with its full path",
            ],
            [
              "Read a field whose path you already know",
              "`jq`",
              "`.orders[2].status` is the whole query",
            ],
            [
              "Select records by a condition, or reshape the output",
              "`jq`",
              "It has `select`, `map`, and arithmetic",
            ],
            [
              "Search a directory of files or an NDJSON log",
              "`ripgrep`",
              "It walks directories and matches line by line",
            ],
            [
              "Check whether a string occurs anywhere in a file",
              "`grep -q` or `ripgrep`",
              "No JSON parsing is needed",
            ],
          ],
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Can I pipe Gronify output into grep, ripgrep, or awk?",
      answer:
        "Yes. `gronify flatten file.json` writes plain `json.path = value` lines, and color is switched off automatically when the output is a pipe, so `gronify flatten orders.json | rg -i pending` works as written. Pass `--no-color` to force plain output anywhere else.",
    },
    {
      question: "How do I search JSON on Windows without grep?",
      answer:
        "Install Gronify with `npm install -g gronify` on Node.js 20 or newer. `gronify search` does its own matching, so the same command runs in PowerShell, CMD, macOS, and Linux without grep or `Select-String`.",
    },
    {
      question: "How do I match a value only under a specific key?",
      answer:
        "Put the key in the pattern. `gronify search orders.json --regex 'customer\\.email = \".*@example\\.org\"'` matches `.org` addresses under `customer.email` and ignores the same text anywhere else in the document.",
    },
    {
      question: "Can gronify search handle very large JSON files?",
      answer:
        "Yes. It reads the file as a stream and prints matches as it finds them, and `-m` stops at the cap without reading the rest. Measured time and memory for large inputs are in the [benchmarks](/#benchmarks) on the home page.",
    },
  ],
  related: ["flatten-json", "find-json-path", "jq-alternative"],
};
