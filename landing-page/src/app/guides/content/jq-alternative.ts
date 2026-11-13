import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.3.1 and jq 1.8.2 run against
// the deploys.json shown in the first transcript. The jaq sentence was checked
// with jaq 3.1.2. Quotes from other projects come from their READMEs as read
// on 2026-11-12.
export const jqAlternative: Guide = {
  slug: "jq-alternative",
  title: "A jq alternative for exploring unknown JSON | Gronify",
  description:
    "jq transforms JSON whose structure you already know. For a payload you have not seen, Gronify prints every path so you can find a value and write the jq filter.",
  h1: "A jq alternative for exploring JSON you do not know yet",
  lede: 'Gronify does not replace jq: [jq](https://github.com/jqlang/jq) is the right tool for reshaping, filtering, and computing over JSON whose structure you already know. The alternative is for the step before that, when a payload is new to you and you need to learn where things are. `gronify search deploys.json failed` prints `json.data.projects[0].envs[0].deploy.status = "failed"`, the full path next to the value, and that path is what the jq filter is written from.',
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "when-to-use-jq",
      heading: "When jq is the right tool",
      blocks: [
        {
          kind: "paragraph",
          text: "jq is a query language, and its output can have a different shape from its input. Gronify has three commands, `flatten`, `search`, and `unflatten`, and no query language, so it shows what is in a document and cannot compute anything new from it. The examples on this page use one API response saved as `deploys.json`:",
        },
        {
          kind: "terminal",
          label: "The sample API response used on this page",
          lines: transcript`
$ cat deploys.json
{"meta":{"request_id":"req_8f3a","took_ms":42},"data":{"workspace":{"id":"ws_acme","plan":"team"},"projects":[{"name":"api","envs":[{"name":"prod","deploy":{"status":"failed","duration_s":312,"commit":{"sha":"9c1e4b7","author":{"email":"ada@example.com"}}}},{"name":"staging","deploy":{"status":"ok","duration_s":95,"commit":{"sha":"9c1e4b7","author":{"email":"ada@example.com"}}}}]},{"name":"web","envs":[{"name":"prod","deploy":{"status":"ok","duration_s":148,"commit":{"sha":"41d0aa2","author":{"email":"grace@example.com"}}}}]}]}}
`,
        },
        {
          kind: "paragraph",
          text: "Three jobs on that file need jq: building new objects from parts of old ones, adding up a field, and writing CSV with a value from a parent record on every row.",
        },
        {
          kind: "terminal",
          label: "jq reshaping objects, summing a field, and writing CSV",
          lines: transcript`
$ jq -c '.data.projects[] | {project: .name, envs: [.envs[].name]}' deploys.json
{"project":"api","envs":["prod","staging"]}
{"project":"web","envs":["prod"]}
$ jq '[.data.projects[].envs[].deploy.duration_s] | add' deploys.json
555
$ jq -r '.data.projects[] | .name as $p | .envs[] | [$p, .name, .deploy.status, .deploy.duration_s] | @csv' deploys.json
"api","prod","failed",312
"api","staging","ok",95
"web","prod","ok",148
`,
        },
        {
          kind: "paragraph",
          text: "Gronify cannot do any of the three. If you already know the paths, use jq and skip Gronify. One caveat on arithmetic: jq 1.7 and later print a number as written until a calculation touches it, and then it becomes a double, which [the guide to JSON number precision](/guides/json-number-precision) covers.",
        },
      ],
    },
    {
      id: "exploring-with-jq",
      heading: "Exploring unknown JSON structure with jq",
      blocks: [
        {
          kind: "paragraph",
          text: "Every one of those filters starts from a path, and with a new payload you do not have one. The usual way to get it is to ask for the keys one level at a time:",
        },
        {
          kind: "terminal",
          label:
            "Walking down a JSON document with jq keys, one level per command",
          lines: transcript`
$ jq -c keys deploys.json
["data","meta"]
$ jq -c '.data | keys' deploys.json
["projects","workspace"]
$ jq -c '.data.projects | keys' deploys.json
[0,1]
$ jq -c '.data.projects[0] | keys' deploys.json
["envs","name"]
$ jq -c '.data.projects[0].envs[0] | keys' deploys.json
["deploy","name"]
$ jq -c '.data.projects[0].envs[0].deploy | keys' deploys.json
["commit","duration_s","status"]
`,
        },
        {
          kind: "paragraph",
          text: "Six commands reach `status`, and they describe only the first environment of the first project. `keys` sorts the names, so `data` prints before `meta` although the file has them the other way round. A guess that skips an array index stops with an error:",
        },
        {
          kind: "terminal",
          label: "jq error from indexing an array with a key name",
          lines: transcript`
$ jq '.data.projects.envs' deploys.json
jq: error (at deploys.json:1): Cannot index array with string "envs"
`,
        },
        {
          kind: "paragraph",
          text: "jq also has builtins that walk the whole document. `to_entries` lists keys in document order, here with the type of each value. `paths` prints every path, and `paths(f)` prints the paths whose value passes a test:",
        },
        {
          kind: "terminal",
          label: "jq to_entries, paths, and paths with a test on the value",
          lines: transcript`
$ jq -c 'to_entries | map({key, type: (.value | type)})' deploys.json
[{"key":"meta","type":"object"},{"key":"data","type":"object"}]
$ jq -c paths deploys.json | head -4
["meta"]
["meta","request_id"]
["meta","took_ms"]
["data"]
$ jq -c 'paths(. == "failed")' deploys.json
["data","projects",0,"envs",0,"deploy","status"]
`,
        },
        {
          kind: "paragraph",
          text: 'The last command answers the question in one step, so jq can do this job. It takes a new filter for each question, `==` compares the whole value (a substring needs `paths(strings | test("fail"))`), and the result is an array of path segments without the value. You then rewrite that array as `.data.projects[0].envs[0].deploy.status` by hand.',
        },
      ],
    },
    {
      id: "exploring-with-gronify",
      heading: "The same exploration with gronify flatten and search",
      blocks: [
        {
          kind: "paragraph",
          text: 'A gron-style tool prints the document as one `path = value` line per value, so the structure and the data arrive together. [gron](https://github.com/tomnomnom/gron) introduced the format, and its README answers the question "Why shouldn\'t I just use jq?" by calling jq "a lot more powerful than gron, but with that power comes complexity". It goes on: "gron\'s primary purpose is to make it easy to find the path to a value in a deeply nested JSON blob when you don\'t already know the structure; much of jq\'s power is unlocked only once you know that structure." ([gron README](https://github.com/tomnomnom/gron#why-shouldnt-i-just-use-jq))',
        },
        {
          kind: "paragraph",
          text: "Gronify is a gron-family CLI for Node.js 20 or newer, installed with `npm install -g gronify` ([install options](/#install)). Start with the top of the file. `--limit` stops reading the input at the cap, so the rest of a large file is never read:",
        },
        {
          kind: "terminal",
          label: "The first twelve flattened lines of the sample response",
          lines: transcript`
$ gronify flatten deploys.json --limit 12
json = {}
json.meta = {}
json.meta.request_id = "req_8f3a"
json.meta.took_ms = 42
json.data = {}
json.data.workspace = {}
json.data.workspace.id = "ws_acme"
json.data.workspace.plan = "team"
json.data.projects = []
json.data.projects[0] = {}
json.data.projects[0].name = "api"
json.data.projects[0].envs = []
Stopped after 12 lines (--limit); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "Those lines show the top-level keys in document order, that `projects` is an array of objects, and that each project has a `name` and an array called `envs`. To locate one thing, search for a word you expect to find in it:",
        },
        {
          kind: "terminal",
          label: "Searching the sample response by value and by key name",
          lines: transcript`
$ gronify search deploys.json failed
json.data.projects[0].envs[0].deploy.status = "failed"
$ gronify search deploys.json email
json.data.projects[0].envs[0].deploy.commit.author.email = "ada@example.com"
json.data.projects[0].envs[1].deploy.commit.author.email = "ada@example.com"
json.data.projects[1].envs[0].deploy.commit.author.email = "grace@example.com"
`,
        },
        {
          kind: "paragraph",
          text: "Each match is a full path with its value, array indexes included, and neither search needed a filter. The term is matched as a case-insensitive substring of the whole line, so it can sit in a key or in a value. Regex, counting, and the other search flags are in [the guide to grepping JSON](/guides/grep-json).",
        },
      ],
    },
    {
      id: "path-to-jq-filter",
      heading: "From one path to a jq filter over every record",
      blocks: [
        {
          kind: "paragraph",
          text: "The path Gronify prints is close to a jq filter already. Three edits turn `json.data.projects[0].envs[0].deploy.status` into a query over every deploy:",
        },
        {
          kind: "list",
          style: "numbered",
          items: [
            "Drop the leading `json`. What is left, `.data.projects[0].envs[0].deploy.status`, is a valid jq path to that one value.",
            "Replace an index such as `[0]` with `[]` to visit every element of the array: `.data.projects[].envs[]`.",
            "Put the condition in `select`, then name the field you want back. Its path, `.deploy.commit.author.email`, comes from the `email` search above.",
          ],
        },
        {
          kind: "terminal",
          label:
            "A jq filter written from the path that gronify search printed",
          lines: transcript`
$ jq '.data.projects[0].envs[0].deploy.status' deploys.json
"failed"
$ jq -r '.data.projects[].envs[] | select(.deploy.status == "failed") | .deploy.commit.author.email' deploys.json
ada@example.com
`,
        },
        {
          kind: "paragraph",
          text: 'The second command selects a record by one field and returns another, which a line filter cannot do. Keys that are not plain identifiers carry over as well: Gronify prints `json.headers["content-type"]`, and `.headers["content-type"]` is valid jq. More cases, such as searching by key name only, are in [the guide to finding a JSON path](/guides/find-json-path).',
        },
      ],
    },
    {
      id: "other-jq-alternatives",
      heading: "Other jq alternatives and what each is for",
      blocks: [
        {
          kind: "paragraph",
          text: "Tools that get listed as jq alternatives do one of three things. Some run jq's own language in a different implementation, some are interactive viewers, and some flatten JSON for line tools the way gron does.",
        },
        {
          kind: "table",
          caption: "jq alternatives by kind and by the job each one fits",
          columns: ["Tool", "Kind", "Use it for"],
          rows: [
            [
              "[jaq](https://github.com/01mf02/jaq)",
              "jq implementation in Rust",
              'Running jq programs. Its README calls it "a clone of the JSON data processing tool jq" and adds YAML, CBOR, TOML, and XML support.',
            ],
            [
              "[gojq](https://github.com/itchyny/gojq)",
              "jq implementation in Go",
              "Running jq programs with arbitrary-precision integer arithmetic and YAML input. It does not keep object key order.",
            ],
            [
              "[fx](https://github.com/antonmedv/fx)",
              "Interactive viewer and processor",
              "Browsing a document in the terminal, or processing it with JavaScript expressions in place of jq syntax.",
            ],
            [
              "[jless](https://github.com/PaulJuliusMartinez/jless)",
              "Interactive viewer",
              "Reading a document by hand: expand and collapse objects and arrays, move around, and search with a regex.",
            ],
            [
              "[jnv](https://github.com/ynqa/jnv)",
              "Interactive jq filter editor",
              "Typing a jq filter next to a view of the document. It applies the filter with jaq, so jq does not have to be installed.",
            ],
            [
              "[gron](https://github.com/tomnomnom/gron)",
              "Flattener in Go",
              "The original `path = value` output for grep, with `gron -u` to turn filtered lines back into JSON.",
            ],
            [
              "[fastgron](https://github.com/adamritter/fastgron)",
              "Flattener in C++",
              "gron output on big files. Its README says it is 50x faster than gron there, and it adds a fixed-string filter (`-F`) and path queries.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Only jaq and gojq replace jq in the literal sense, and neither removes the exploration step, because their filters need a path too. jaq 3.1.2 printed the same output as jq 1.8.2 for every filter on this page that succeeds. How the three flatteners differ is covered in [the gron alternatives comparison](/guides/gron-alternative).",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "How do I list all keys recursively in jq?",
      answer:
        "`jq -c '[.. | objects | keys[]] | unique' deploys.json` prints every distinct key name in the document as one array, and `jq -c paths deploys.json` prints every path as an array of segments. To see each key with its position and its value, run `gronify flatten deploys.json`, which prints one `path = value` line per value.",
    },
    {
      question: "Can Gronify read JSON Lines or NDJSON the way jq does?",
      answer:
        "No. Gronify reads one JSON document per run and stops with an error at the second line of an NDJSON file. jq reads a sequence of documents by default, so `jq -c .a lines.ndjson` handles every line. gron and fastgron accept the same input with `-s`.",
    },
    {
      question: "Can Gronify change a value in a JSON file?",
      answer:
        'Only by editing lines. `gronify flatten deploys.json | sed \'s/"failed"/"ok"/\' | gronify unflatten` writes the document back with that value replaced, because `unflatten` receives every line. Adding a field to each record, deleting records by a condition, and other structural edits are jq\'s job.',
    },
    {
      question: "Does jq load the whole JSON file into memory?",
      answer:
        "Without `--stream`, jq parses each JSON text completely before the filter runs. With `--stream`, the program receives `[path, leaf]` events in place of the document and has to rebuild values itself. `gronify flatten` and `gronify search` read the input in chunks and write each line as it is produced, with no flag. Measured time and memory for both tools are in the [benchmarks](/#benchmarks).",
    },
  ],
  related: ["find-json-path", "gron-alternative", "json-number-precision"],
};
