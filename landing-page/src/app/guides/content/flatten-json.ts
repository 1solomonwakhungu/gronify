import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.3.1 (plus jq 1.8.2 and grep) run against the config.json, keys.json, and dots.json files shown in
// the transcripts. Statements about gron 0.7.1, fastgron 0.7.7, and the npm
// package flat 6.0.1 come from running those versions on the same files.
export const flattenJson: Guide = {
  slug: "flatten-json",
  title: "Flatten nested JSON on the command line | Gronify",
  description:
    "Flatten nested JSON to one path = value line per value with gronify flatten. See how arrays, empty objects, and odd keys print, and how to reverse it.",
  h1: "Flatten nested JSON to one line per value",
  lede: "To flatten nested JSON on the command line, run `gronify flatten file.json`, or pipe JSON into `gronify flatten`. It prints one `json.path = value` line for every value, with array positions in brackets, so each value carries its full path and the output works with grep, sort, diff, and awk.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "flatten-file-or-stdin",
      heading: "Flatten a JSON file or standard input",
      blocks: [
        {
          kind: "paragraph",
          text: "Install Gronify with `npm install -g gronify` on Node.js 20 or newer ([install options](/#install)). The examples on this page use a small service config saved as `config.json`:",
        },
        {
          kind: "terminal",
          label: "A nested config file flattened to one line per value",
          lines: transcript`
$ cat config.json
{"name":"api","port":8080,"debug":false,"owner":null,"tags":["web","eu"],"db":{"host":"db.internal","replicas":[{"host":"r1","lag":0.5},{"host":"r2","lag":1.25}]},"grid":[[1,2],[3,4]],"limits":{},"plugins":[]}
$ gronify flatten config.json
json = {}
json.name = "api"
json.port = 8080
json.debug = false
json.owner = null
json.tags = []
json.tags[0] = "web"
json.tags[1] = "eu"
json.db = {}
json.db.host = "db.internal"
json.db.replicas = []
json.db.replicas[0] = {}
json.db.replicas[0].host = "r1"
json.db.replicas[0].lag = 0.5
json.db.replicas[1] = {}
json.db.replicas[1].host = "r2"
json.db.replicas[1].lag = 1.25
json.grid = []
json.grid[0] = []
json.grid[0][0] = 1
json.grid[0][1] = 2
json.grid[1] = []
json.grid[1][0] = 3
json.grid[1][1] = 4
json.limits = {}
json.plugins = []
`,
        },
        {
          kind: "paragraph",
          text: "Each object and array gets a line of its own, such as `json.db = {}`, ahead of the values inside it. Strings keep their JSON quotes, and numbers, `true`, `false`, and `null` print as they appear in the file. Lines follow the order of the document, and the file is read as a stream, so it is never loaded whole.",
        },
        {
          kind: "paragraph",
          text: "Leave out the file name and Gronify reads standard input. The root does not have to be an object:",
        },
        {
          kind: "terminal",
          label: "Flattening a top-level array piped on standard input",
          lines: transcript`
$ echo '[1,[2,3],{"a":null}]' | gronify flatten
json = []
json[0] = 1
json[1] = []
json[1][0] = 2
json[1][1] = 3
json[2] = {}
json[2].a = null
`,
        },
      ],
    },
    {
      id: "arrays-and-empty-containers",
      heading: "How arrays, nested arrays, and empty containers print",
      blocks: [
        {
          kind: "paragraph",
          text: "The two transcripts above contain every case but the last:",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "An array element is its zero-based position in brackets: `json.tags[0]`, then `json.tags[1]`.",
            "An array of objects prints one `= {}` line per element, then that element's fields: `json.db.replicas[0] = {}`, then `json.db.replicas[0].host`.",
            "A nested array stacks the brackets, outer position first: `json.grid[1][0] = 3` is the first item of the second row.",
            "An empty object or array is a single line, `json.limits = {}` or `json.plugins = []`. A container with children opens with the same line, so it is empty only when the next line does not extend its path.",
            'A root array starts with `json = []` and its elements are `json[0]`, `json[1]`. A document that is one string or number is one line, such as `json = "hello"`.',
          ],
        },
      ],
    },
    {
      id: "special-keys",
      heading: "Keys with dots, spaces, quotes, or non-ASCII characters",
      blocks: [
        {
          kind: "paragraph",
          text: "A key is written bare after a dot only when it starts with an ASCII letter, `_`, or `$` and continues with ASCII letters, digits, `_`, or `$`. Any other key goes in brackets as a JSON string:",
        },
        {
          kind: "terminal",
          label:
            "Keys that are not plain identifiers print in brackets as JSON strings",
          lines: transcript`
$ cat keys.json
{"a.b":1,"first name":2,"say \"hi\"":3,"naïve":4,"日本語":5,"":6,"123":7,"1st":8,"_ok":9,"$ref":10,"x-y":11}
$ gronify flatten keys.json
json = {}
json["a.b"] = 1
json["first name"] = 2
json["say \"hi\""] = 3
json["naïve"] = 4
json["日本語"] = 5
json[""] = 6
json["123"] = 7
json["1st"] = 8
json._ok = 9
json.$ref = 10
json["x-y"] = 11
`,
        },
        {
          kind: "paragraph",
          text: 'The brackets remove the ambiguity that dotted notation has. `json["a.b"]` is one key named `a.b`, while `json.a.b` is a key `b` inside an object `a`. `json["123"]` is an object key that looks like a number, and an array position would be `json[123]` with no quotes. The empty key is `json[""]`, and a quote inside a key is escaped with a backslash, as in JSON.',
        },
        {
          kind: "paragraph",
          text: "Accented and non-Latin keys such as `naïve` and `日本語` are always bracketed. gron 0.7.1 prints those two bare (`json.naïve`), a spelling that `gronify unflatten` rejects with `invalid character in path`.",
        },
      ],
    },
    {
      id: "limit-sort-output",
      heading: "Sample, sort, save, and indent the output",
      blocks: [
        { kind: "subheading", text: "Sample a big document with --limit" },
        {
          kind: "paragraph",
          text: "`--limit <n>` prints the first n lines and then stops reading the input, which is enough to see the shape of a file too large to scroll through.",
        },
        {
          kind: "terminal",
          label: "Printing only the first five flattened lines",
          lines: transcript`
$ gronify flatten --limit 5 config.json
json = {}
json.name = "api"
json.port = 8080
json.debug = false
json.owner = null
Stopped after 5 lines (--limit); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "The last line is a notice on stderr, so a pipe or a redirect receives only the five lines. The exit status is 0.",
        },
        { kind: "subheading", text: "Get a stable key order with --sort" },
        {
          kind: "paragraph",
          text: "By default, keys print in the order the document has them. `--sort` sorts the keys of every object at every depth and leaves arrays in their original order:",
        },
        {
          kind: "terminal",
          label: "Flattening with object keys sorted at every level",
          lines: transcript`
$ echo '{"b":1,"a":{"d":4,"c":3},"10":0,"2":0}' | gronify flatten --sort
json = {}
json["10"] = 0
json["2"] = 0
json.a = {}
json.a.c = 3
json.a.d = 4
json.b = 1
`,
        },
        {
          kind: "paragraph",
          text: 'Keys compare by UTF-16 code unit, which puts `"10"` before `"2"`. Two documents that differ only in key order give identical sorted output, so the system `diff` reports only real changes, as the guide to [comparing two JSON files](/guides/compare-json-files) shows.',
        },
        { kind: "subheading", text: "Write to a file with -o" },
        {
          kind: "paragraph",
          text: "`-o <file>` (long form `--output`) writes the lines to a file and confirms on stderr. A shell redirect with `>` gives the same file.",
        },
        {
          kind: "terminal",
          label: "Writing flattened lines to a file",
          lines: transcript`
$ gronify flatten config.json -o config.gron
Output written to config.gron
$ head -2 config.gron
json = {}
json.name = "api"
`,
        },
        { kind: "subheading", text: "What --pretty does to flattened lines" },
        {
          kind: "paragraph",
          text: '`--pretty` indents each line and adds blank lines. Each line is indented two spaces for every dot and opening bracket it contains beyond the first, up to twelve spaces. In Gronify 1.3.1 the count runs over the whole line, value included, so `lag = 0.5` sits one step deeper than `host = "r1"`. A blank line goes before each new top-level key, and also between a top-level `= {}` or `= []` line and its own children:',
        },
        {
          kind: "terminal",
          label: "Indented flatten output for one array of objects",
          lines: transcript`
$ gronify --pretty flatten config.json | grep replicas
    json.db.replicas = []
    json.db.replicas[0] = {}
      json.db.replicas[0].host = "r1"
        json.db.replicas[0].lag = 0.5
    json.db.replicas[1] = {}
      json.db.replicas[1].host = "r2"
        json.db.replicas[1].lag = 1.25
`,
        },
        {
          kind: "paragraph",
          text: "Indented lines still unflatten, but a pattern anchored at `^json` matches only 7 of this file's 26 lines once they are indented. Leave `--pretty` off when another program reads the output.",
        },
      ],
    },
    {
      id: "back-to-json",
      heading: "Turn flattened lines back into JSON",
      blocks: [
        {
          kind: "paragraph",
          text: "`gronify unflatten` reads the lines and writes JSON. Piping one command into the other returns the document unchanged. For this file the result is byte-identical to `config.json`:",
        },
        {
          kind: "terminal",
          label: "Round trip from JSON to lines and back",
          lines: transcript`
$ gronify flatten config.json | gronify unflatten
{"name":"api","port":8080,"debug":false,"owner":null,"tags":["web","eu"],"db":{"host":"db.internal","replicas":[{"host":"r1","lag":0.5},{"host":"r2","lag":1.25}]},"grid":[[1,2],[3,4]],"limits":{},"plugins":[]}
`,
        },
        {
          kind: "paragraph",
          text: "`unflatten` needs every container line, such as `json = {}` and `json.tags = []`, ahead of the values inside it, so deleting lines takes more care than changing them. The guide to [unflattening gron lines back into JSON](/guides/unflatten-json) covers filtered input, line order, and indented output.",
        },
      ],
    },
    {
      id: "lines-or-flat-object",
      heading: "Flatten JSON with jq: lines or one flat object",
      blocks: [
        {
          kind: "paragraph",
          text: "Flattening JSON can mean two different results. One is the form on this page: one line per value, in the style of [gron](https://github.com/tomnomnom/gron), for grep, diff, and reading. The other is still JSON: a single one-level object whose keys are dotted paths. Gronify writes only the first.",
        },
        {
          kind: "paragraph",
          text: "[jq](https://github.com/jqlang/jq) can print the line form with a one-liner that is often quoted:",
        },
        {
          kind: "terminal",
          label: "The common jq one-liner that prints dotted paths and values",
          lines: transcript`
$ jq -r 'paths(scalars) as $p | "\($p|join(".")) = \(getpath($p))"' config.json
name = api
port = 8080
tags.0 = web
tags.1 = eu
db.host = db.internal
db.replicas.0.host = r1
db.replicas.0.lag = 0.5
db.replicas.1.host = r2
db.replicas.1.lag = 1.25
grid.0.0 = 1
grid.0.1 = 2
grid.1.0 = 3
grid.1.1 = 4
`,
        },
        {
          kind: "paragraph",
          text: "On jq 1.8.2 that is 13 lines where `gronify flatten` printed 26. The container lines are gone, which hides the empty `limits` and `plugins`. `debug` and `owner` are missing too, because `paths(scalars)` skips `false` and `null`. Writing `paths(scalars | true)` keeps them, and ending with `getpath($p) | tojson` keeps the quotes on strings. Array positions and keys look alike (`tags.0`).",
        },
        {
          kind: "paragraph",
          text: "For the flat-object form, collect the same paths into one object:",
        },
        {
          kind: "terminal",
          label: "A jq expression that builds one flat object with dotted keys",
          lines: transcript`
$ jq -c '[paths(scalars | true) as $p | {key: ($p | join(".")), value: getpath($p)}] | from_entries' config.json
{"name":"api","port":8080,"debug":false,"owner":null,"tags.0":"web","tags.1":"eu","db.host":"db.internal","db.replicas.0.host":"r1","db.replicas.0.lag":0.5,"db.replicas.1.host":"r2","db.replicas.1.lag":1.25,"grid.0.0":1,"grid.0.1":2,"grid.1.0":3,"grid.1.1":4}
`,
        },
        {
          kind: "paragraph",
          text: 'The npm package [flat](https://github.com/hughsk/flat) builds the same object without a jq program: `npx flat config.json` (flat 6.0.1) printed these keys plus `"limits": {}` and `"plugins": []`. Dotted keys cannot tell a dot inside a key from a level of nesting, so two paths can collide and one value is lost. The line form keeps both:',
        },
        {
          kind: "terminal",
          label:
            "Two paths that collide in a flat object and stay distinct as lines",
          lines: transcript`
$ cat dots.json
{"a.b":1,"a":{"b":2}}
$ jq -c '[paths(scalars | true) as $p | {key: ($p | join(".")), value: getpath($p)}] | from_entries' dots.json
{"a.b":2}
$ gronify flatten dots.json
json = {}
json["a.b"] = 1
json.a = {}
json.a.b = 2
`,
        },
        {
          kind: "paragraph",
          text: "If you need a flat object to load into a spreadsheet or a key-value store, jq or `flat` is the better tool, because Gronify has no flat-object output. For the line form, [how to grep JSON](/guides/grep-json) covers searching it, and [finding the path to a key](/guides/find-json-path) covers locating one value.",
        },
        {
          kind: "table",
          caption: "Which flattened form fits which job",
          columns: ["Job", "Form", "Tool"],
          rows: [
            [
              "Search, read, or compare a document whose shape you do not know",
              "One line per value",
              "`gronify flatten`, gron, or fastgron",
            ],
            [
              "Load the values into a spreadsheet or a key-value store",
              "Flat object",
              "jq or `flat`",
            ],
            [
              "Flatten a JSON Lines log with one object per line",
              "One line per value",
              "`gron -s` or `fastgron -s`",
            ],
          ],
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Does flattening JSON change large numbers or decimals?",
      answer:
        "Not with Gronify. It copies each number's text from the input, so `12345678901234567890`, `1.10`, and `1E2` print exactly as written. A tool that parses numbers into doubles changes them: `flat` 6.0.1 printed the same three values as `12345678901234567000`, `1.1`, and `100`. The guide on [JSON number precision](/guides/json-number-precision) has more.",
    },
    {
      question: "Can I flatten a JSON Lines or NDJSON file?",
      answer:
        "No. Each Gronify run reads one JSON document, and a second object on the next line stops it with `Unexpected '{' after the top-level value`. `gron -s` and [fastgron](https://github.com/adamritter/fastgron) with `-s` read one object per line and print them as elements of a root array.",
    },
    {
      question: "How do I flatten only one part of a JSON document?",
      answer:
        "Select the part with jq and flatten what it prints: `jq .db config.json | gronify flatten`. Paths then start at the selected value, so the line reads `json.host` instead of `json.db.host`. fastgron takes a path as a trailing argument and keeps the full path: `fastgron config.json .db.replicas`.",
    },
    {
      question: "Is Gronify's output the same as gron's?",
      answer:
        "Close. gron 0.7.1 ends each line with a semicolon, sorts keys by default, and prints non-ASCII keys bare. Gronify prints no semicolons, keeps document order unless you pass `--sort`, and brackets those keys. `gronify unflatten` accepted gron's semicolons and `fastgron -u` 0.7.7 read Gronify's lines, but `gron -u` rejected them with `statement has no value` until each line ended in a semicolon.",
    },
  ],
  related: ["unflatten-json", "grep-json", "find-json-path"],
};
