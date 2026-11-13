import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.3.1 and jq 1.8.2 run against
// the account.json shown in the first transcript. The gron 0.7.1, fastgron
// 0.7.7, and JSONPath (jsonpath-rfc9535 2.0.2) statements were run the same day.
export const findJsonPath: Guide = {
  slug: "find-json-path",
  title: "Find the path to a key or value in JSON | Gronify",
  description:
    "Print the full path of any key or value in a JSON file with gronify search, turn that path into a jq filter, or list paths with jq alone using paths(scalars).",
  h1: "Find the path to any key or value in a JSON file",
  lede: 'To find where a key or value sits in a JSON file, flatten the file so that every value prints next to its full path, then filter those lines. `gronify search account.json grace@example.com` prints `json.users[1].email = "grace@example.com"`, and the same path without the leading `json` is the jq filter `.users[1].email`.',
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "find-key",
      heading: "Find every path where a key appears",
      blocks: [
        {
          kind: "paragraph",
          text: "The examples use a small account record saved as `account.json`. With Gronify [installed](/#install), `flatten` prints it as one `json.path = value` line per value:",
        },
        {
          kind: "terminal",
          label: "The account record flattened to one path per line",
          lines: transcript`
$ gronify flatten account.json
json = {}
json.account = {}
json.account.id = 48213
json.account.email = "billing@example.com"
json.account.notes = "Send invoices to the billing email on file"
json.users = []
json.users[0] = {}
json.users[0].name = "Ada"
json.users[0].email = "ada@example.com"
json.users[0].active = true
json.users[0].manager = null
json.users[1] = {}
json.users[1].name = "Grace"
json.users[1].email = "grace@example.com"
json.users[1].active = false
json.users[1].manager = "Ada"
json.settings = {}
json.settings.email_notifications = true
json.settings["display name"] = "Team Ops"
json.settings["api.example.com"] = {}
json.settings["api.example.com"].timeout = 30
json.settings["api.example.com"].retries = 3
`,
        },
        {
          kind: "paragraph",
          text: "A plain search compares the term with the whole line. Searching for `email` returns the three `email` keys, and also a `notes` value that mentions the word and the longer key `email_notifications`:",
        },
        {
          kind: "terminal",
          label: "A plain search for a key name also matches values",
          lines: transcript`
$ gronify search account.json email
json.account.email = "billing@example.com"
json.account.notes = "Send invoices to the billing email on file"
json.users[0].email = "ada@example.com"
json.users[1].email = "grace@example.com"
json.settings.email_notifications = true
`,
        },
        {
          kind: "paragraph",
          text: "To match the key alone, describe its position on the line. The last key of a path is always followed by ` = `, and a key that needs no quoting always has a dot in front of it. The pattern `\\.email = ` requires both:",
        },
        {
          kind: "terminal",
          label: "A regex anchored on the key position matches only the key",
          lines: transcript`
$ gronify search account.json --regex '\.email = '
json.account.email = "billing@example.com"
json.users[0].email = "ada@example.com"
json.users[1].email = "grace@example.com"
`,
        },
        {
          kind: "paragraph",
          text: "A key that holds an object or an array has a line of its own, so `\\.settings = ` returns `json.settings = {}`. Search ignores case unless you pass `-c`, which means the pattern above would also match a key spelled `Email`. A string value can contain the text `.email = ` too. If your data might, use `^[^=]*\\.email = `, which accepts the key only when no equals sign comes before it. The regex dialect and the other search flags are in the guide on [how to grep nested JSON](/guides/grep-json), and the line format is described in the guide on [flattening JSON](/guides/flatten-json).",
        },
      ],
    },
    {
      id: "find-value",
      heading: "Find the path to a known value",
      blocks: [
        {
          kind: "paragraph",
          text: "Values print to the right of ` = ` the way JSON writes them: strings in double quotes, numbers as written, and `true`, `false`, and `null` bare. Keep the ` = ` in the search term so the match stays on the value side.",
        },
        { kind: "subheading", text: "A string" },
        {
          kind: "paragraph",
          text: "Include the quotes so the term matches the whole string and not a longer one that contains it. `Ada` is the value of two different keys, and each line says which:",
        },
        {
          kind: "terminal",
          label: "Finding every path that holds a string value",
          lines: transcript`
$ gronify search account.json '= "Ada"'
json.users[0].name = "Ada"
json.users[1].manager = "Ada"
`,
        },
        { kind: "subheading", text: "A number" },
        {
          kind: "paragraph",
          text: "Plain search is a substring match, so `= 3` also finds `30`. Switch to a regex and anchor the end of the line with `$`:",
        },
        {
          kind: "terminal",
          label: "Finding the path of an exact number",
          lines: transcript`
$ gronify search account.json '= 3'
json.settings["api.example.com"].timeout = 30
json.settings["api.example.com"].retries = 3
$ gronify search account.json --regex ' = 3$'
json.settings["api.example.com"].retries = 3
`,
        },
        { kind: "subheading", text: "true, false, and null" },
        {
          kind: "paragraph",
          text: "The three literals are never quoted, so the same anchor tells `null` apart from a string that contains the word:",
        },
        {
          kind: "terminal",
          label: "Finding the paths of null and boolean values",
          lines: transcript`
$ gronify search account.json --regex ' = null$'
json.users[0].manager = null
$ gronify search account.json --regex ' = (true|false)$'
json.users[0].active = true
json.users[1].active = false
json.settings.email_notifications = true
`,
        },
        { kind: "subheading", text: "A value inside an array of objects" },
        {
          kind: "paragraph",
          text: "The array index is part of the path, so a match inside a list of records names the record it came from. This address belongs to the second user, at index 1:",
        },
        {
          kind: "terminal",
          label: "Finding which array element holds a value",
          lines: transcript`
$ gronify search account.json grace@example.com
json.users[1].email = "grace@example.com"
`,
        },
      ],
    },
    {
      id: "path-to-jq-filter",
      heading: "Turn the printed path into a jq filter",
      blocks: [
        {
          kind: "paragraph",
          text: "Gronify writes paths with the dot and bracket notation that [jq](https://github.com/jqlang/jq) filters use. Delete the leading `json` and the rest is a filter that returns the value:",
        },
        {
          kind: "terminal",
          label: "Running the printed path as a jq filter",
          lines: transcript`
$ jq '.users[1].email' account.json
"grace@example.com"
`,
        },
        {
          kind: "paragraph",
          text: 'A key that is not a plain identifier, because it contains a space, a dot, or a hyphen, or starts with a digit, prints in bracket-quote form: `json.settings["display name"]`. jq accepts that form as it stands, so the rule does not change. Do not expand a dotted key into `.settings.api.example.com`. jq reads that as four nested keys and returns `null`.',
        },
        {
          kind: "terminal",
          label: "Bracket-quoted keys used unchanged in jq filters",
          lines: transcript`
$ gronify search account.json --regex 'display name|timeout'
json.settings["display name"] = "Team Ops"
json.settings["api.example.com"].timeout = 30
$ jq '.settings["display name"]' account.json
"Team Ops"
$ jq '.settings["api.example.com"].timeout' account.json
30
$ jq '.settings.api.example.com.timeout' account.json
null
`,
        },
        {
          kind: "paragraph",
          text: "One kind of key needs a rewrite. Gronify treats `$` as an identifier character and prints a key such as `$ref` bare, but jq 1.8.2 stops on `.$ref` with a syntax error. Quote it in brackets:",
        },
        {
          kind: "terminal",
          label: "A key that starts with a dollar sign needs brackets in jq",
          lines: transcript`
$ echo '{"$ref":"#/defs/user"}' | gronify flatten
json = {}
json.$ref = "#/defs/user"
$ echo '{"$ref":"#/defs/user"}' | jq '.["$ref"]'
"#/defs/user"
`,
        },
        {
          kind: "table",
          caption: "Converting a path printed by Gronify into a jq filter",
          columns: ["Gronify prints", "jq filter", "What changed"],
          rows: [
            [
              "`json.users[1].email`",
              "`.users[1].email`",
              "The leading `json` is removed",
            ],
            [
              '`json.settings["display name"]`',
              '`.settings["display name"]`',
              "Only the leading `json` is removed",
            ],
            [
              "`json[1].id` in a file whose root is an array",
              "`.[1].id`",
              "The filter starts with a dot",
            ],
            [
              "`json.users[1].email`, wanted for every user",
              "`.users[].email`",
              "The index is deleted",
            ],
            ["`json.$ref`", '`.["$ref"]`', "The key is quoted in brackets"],
          ],
        },
        {
          kind: "paragraph",
          text: "With the filter in hand, jq can select records by a condition and reshape them, which a path search cannot do. The guide on [using Gronify alongside jq](/guides/jq-alternative) covers where each tool fits.",
        },
      ],
    },
    {
      id: "jq-only",
      heading: "Find paths with jq alone",
      blocks: [
        {
          kind: "paragraph",
          text: "On a machine that has jq and where you cannot install anything else, jq can report paths by itself. It prints a path as an array of keys and indexes. `paths(scalars)` lists the path of every leaf value:",
        },
        {
          kind: "terminal",
          label: "jq listing the path of every leaf value",
          lines: transcript`
$ jq -c 'paths(scalars)' account.json | head -5
["account","id"]
["account","email"]
["account","notes"]
["users",0,"name"]
["users",0,"email"]
`,
        },
        {
          kind: "paragraph",
          text: "To find a key, keep the paths whose last element is the key name. To find a value, wrap a recursive descent in `path()`, or pass the test to `paths()`, which is shorter:",
        },
        {
          kind: "terminal",
          label: "jq finding the paths of a key and of a value",
          lines: transcript`
$ jq -c 'paths | select(.[-1] == "email")' account.json
["account","email"]
["users",0,"email"]
["users",1,"email"]
$ jq -c 'path(.. | select(. == "grace@example.com"))' account.json
["users",1,"email"]
$ jq -c 'paths(. == "Ada")' account.json
["users",0,"name"]
["users",1,"manager"]
`,
        },
        {
          kind: "paragraph",
          text: "`getpath` takes one of those arrays and returns the value. For a filter you can paste into another command, join the array into bracket form, which jq accepts for every key:",
        },
        {
          kind: "terminal",
          label:
            "jq reading a value by path array and printing a path as a filter",
          lines: transcript`
$ jq 'getpath(["users",1,"email"])' account.json
"grace@example.com"
$ jq -r 'paths(. == 30) | map("[\(tojson)]") | "." + join("")' account.json
.["settings"]["api.example.com"]["timeout"]
$ jq '.["settings"]["api.example.com"]["timeout"]' account.json
30
`,
        },
        {
          kind: "paragraph",
          text: 'These comparisons are exact: `. == 30` does not match `300`, and `. == "Ada"` does not match a longer string. For a partial, case-insensitive match on strings, `jq -c \'paths(strings | test("ada"; "i"))\' account.json` also returns the path of `ada@example.com`.',
        },
      ],
    },
    {
      id: "leaf-paths-not-defined",
      heading: 'Fix "leaf_paths/0 is not defined" in jq',
      blocks: [
        {
          kind: "paragraph",
          text: "Many older answers list leaf paths with `leaf_paths`. The jq 1.6 manual calls it an alias of `paths(scalars)` and marks it deprecated, and the [jq 1.7 release](https://github.com/jqlang/jq/releases/tag/jq-1.7) removed it. On jq 1.8.2 the old command fails like this:",
        },
        {
          kind: "terminal",
          label: "The error jq 1.8.2 prints for the removed leaf_paths filter",
          lines: transcript`
$ jq -c 'leaf_paths' account.json
jq: error: leaf_paths/0 is not defined at <top-level>, line 1, column 1:
    leaf_paths
    ^^^^^^^^^^
jq: 1 compile error
`,
        },
        {
          kind: "paragraph",
          text: "Replace `leaf_paths` with `paths(scalars)`. Nothing else in the filter needs to change, and the result is the list of arrays shown in the previous section.",
        },
      ],
    },
    {
      id: "large-or-private-files",
      heading: "Large or private files",
      blocks: [
        {
          kind: "paragraph",
          text: "A browser-based JSON path finder works on a document that you paste or upload into a web page. That stops being practical when the file is too large for a text box, and it may not be permitted for a file that holds customer records or credentials.",
        },
        {
          kind: "paragraph",
          text: "A command-line tool reads the file where it already is. Gronify parses the input as a stream and does not load it whole, so memory does not grow with the number of records. When one path is all you need, `-m 1` stops reading at the first match:",
        },
        {
          kind: "terminal",
          label: "Stopping at the first path that matches",
          lines: transcript`
$ gronify search account.json -m 1 --regex '\.email = '
json.account.email = "billing@example.com"
Stopped after 1 match (--max-count); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "Measured time and memory for large inputs are in the [benchmarks](/#benchmarks). [gron](https://github.com/tomnomnom/gron) and [fastgron](https://github.com/adamritter/fastgron) print the same `json.users[1].email` paths, so if either is already installed, piping its output through grep finds the same lines and the jq conversion above applies unchanged. To browse a document by hand, a terminal viewer such as [jless](https://github.com/PaulJuliusMartinez/jless) is the better fit.",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Is the path Gronify prints a JSONPath expression?",
      answer:
        'Almost. Replace the leading `json` with `$` and it is JSONPath as defined in [RFC 9535](https://www.rfc-editor.org/rfc/rfc9535): `$.users[1].email`, or `$.settings["display name"]` for a bracketed key. Both returned the expected values in the Python package jsonpath-rfc9535 2.0.2.',
    },
    {
      question: "How do I print only the paths, without the values?",
      answer:
        "Cut each line at the ` = ` separator. `gronify search account.json --regex '\\.email = ' | sed 's/ = .*//'` prints `json.account.email`, `json.users[0].email`, and `json.users[1].email`, one per line.",
    },
    {
      question: "How do I print the whole object that contains a match?",
      answer:
        "Drop the last segment of the path. The match `json.users[1].email` sits in the object at `.users[1]`, so `jq -c '.users[1]' account.json` prints that user's full record.",
    },
    {
      question: "Can I find paths in a JSON Lines (NDJSON) file?",
      answer:
        "Not with Gronify, which reads one JSON document per run and stops with an error at the second line. jq reads a stream of documents, so `jq -c 'path(.. | select(. == \"x\"))' log.ndjson` prints the matching path for each line. `gron -s` and `fastgron -s` flatten every line under its own index, such as `json[0]` and `json[1]`.",
    },
  ],
  related: ["grep-json", "jq-alternative", "flatten-json"],
};
