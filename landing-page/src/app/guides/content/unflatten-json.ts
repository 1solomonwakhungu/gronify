import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.3.1 (plus gron 0.7.1,
// fastgron 0.7.7, jq 1.8.2, grep, and sed) run against the deploy.json shown
// in the first transcript.
export const unflattenJson: Guide = {
  slug: "unflatten-json",
  title: "Ungron: unflatten gron lines back into JSON | Gronify",
  description:
    "gronify unflatten turns json.path = value lines back into JSON. See the round trip, which gron and fastgron output it reads, and why filtered lines can fail.",
  h1: "Unflatten gron lines back into JSON (ungron)",
  lede: "To turn gron lines back into JSON, pipe them into `gronify unflatten` or pass a file: `gronify unflatten data.gron`. It reads the `json.path = value` lines written by `gronify flatten`, gron, or fastgron and writes one JSON document with numbers and key order unchanged. It needs every container line and does not create missing parents, so a grep-filtered subset that `gron --ungron` accepts is rejected here; see [filtered lines](#filtered-lines) for the two ways around that.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "round-trip",
      heading: "The round trip: flatten, then unflatten",
      blocks: [
        {
          kind: "paragraph",
          text: "The examples use a small deployment file saved as `deploy.json`, with Gronify [installed](/#install) from npm. `gronify flatten` writes one assignment per value, a format described in [flatten JSON](/guides/flatten-json). `gronify unflatten` reads those lines from standard input and prints the document again:",
        },
        {
          kind: "terminal",
          label: "Flattening a JSON file and unflattening it through a pipe",
          lines: transcript`
$ cat deploy.json
{"service":"api","build":12345678901234567890,"ratio":1.10,"image":{"repo":"registry.example.com/api","tag":"1.4.2"},"env":[{"name":"LOG_LEVEL","value":"info"},{"name":"REGION","value":"eu-west-1"}]}
$ gronify flatten deploy.json
json = {}
json.service = "api"
json.build = 12345678901234567890
json.ratio = 1.10
json.image = {}
json.image.repo = "registry.example.com/api"
json.image.tag = "1.4.2"
json.env = []
json.env[0] = {}
json.env[0].name = "LOG_LEVEL"
json.env[0].value = "info"
json.env[1] = {}
json.env[1].name = "REGION"
json.env[1].value = "eu-west-1"
$ gronify flatten deploy.json | gronify unflatten
{"service":"api","build":12345678901234567890,"ratio":1.10,"image":{"repo":"registry.example.com/api","tag":"1.4.2"},"env":[{"name":"LOG_LEVEL","value":"info"},{"name":"REGION","value":"eu-west-1"}]}
`,
        },
        {
          kind: "paragraph",
          text: "The result is compact JSON on one line. The `build` number is larger than 2^53 and `ratio` ends in a zero, and both come back as written. To read a file, pass its name. `-o` (long form `--output`) writes the JSON to a file, and `--pretty` indents it:",
        },
        {
          kind: "terminal",
          label:
            "Unflattening a gron file to an output file and with indentation",
          lines: transcript`
$ gronify flatten deploy.json > deploy.gron
$ gronify -o rebuilt.json unflatten deploy.gron
Output written to rebuilt.json
$ gronify --pretty unflatten deploy.gron
{
  "service": "api",
  "build": 12345678901234567890,
  "ratio": 1.10,
  "image": {
    "repo": "registry.example.com/api",
    "tag": "1.4.2"
  },
  "env": [
    {
      "name": "LOG_LEVEL",
      "value": "info"
    },
    {
      "name": "REGION",
      "value": "eu-west-1"
    }
  ]
}
`,
        },
        {
          kind: "paragraph",
          text: "`--pretty` prints two-space indentation with one key or array element per line, the layout of `JSON.stringify(value, null, 2)`, and writes empty containers as `{}` and `[]`. It changes whitespace only, so `1.10` stays `1.10`. Both options work before or after the word `unflatten`. `-o` writes to a temporary file and renames it once the whole input has converted, so a failed run leaves an existing target untouched and `-o` may name the input file.",
        },
      ],
    },
    {
      id: "filtered-lines",
      heading: "Why filtered lines fail, and how to keep a subset",
      blocks: [
        {
          kind: "paragraph",
          text: "The usual gron habit is to flatten, grep for a few lines, and ungron what is left. `gronify unflatten` rejects that input. Every line needs its container lines before it, starting with the root `json = {}`, and a filter that keeps only leaf lines has removed them:",
        },
        {
          kind: "terminal",
          label:
            "Unflatten errors for a missing root line and a missing nested parent",
          lines: transcript`
$ gronify flatten deploy.json | grep tag | gronify unflatten
Error: unflattening gron: line 1: root must be assigned before child paths
Tip: Gron lines should look like: json.path = value
$ gronify search deploy.json --regex '^json = |tag' | gronify unflatten
Error: unflattening gron: line 2: parent path must be assigned before its children
Tip: Gron lines should look like: json.path = value
`,
        },
        {
          kind: "paragraph",
          text: "The second command keeps the root line and still fails, because `json.image = {}` is missing. Both runs exit with status 1 and print no JSON. Two approaches keep the parents in place.",
        },
        { kind: "subheading", text: "Remove what you do not want" },
        {
          kind: "paragraph",
          text: "`gronify search -v` prints every line that does not match, so the containers of whatever remains are still there. This drops the `env` array and rebuilds the rest:",
        },
        {
          kind: "terminal",
          label:
            "Dropping one array with an inverted search, then unflattening",
          lines: transcript`
$ gronify search deploy.json -v env | gronify unflatten
{"service":"api","build":12345678901234567890,"ratio":1.10,"image":{"repo":"registry.example.com/api","tag":"1.4.2"}}
`,
        },
        { kind: "subheading", text: "Keep every ancestor in the pattern" },
        {
          kind: "paragraph",
          text: "To extract one nested branch, a `--regex` has to match the root line and each container on the way down. For the second `env` entry that takes three alternatives:",
        },
        {
          kind: "terminal",
          label:
            "Extracting a nested array element by matching each ancestor line",
          lines: transcript`
$ gronify search deploy.json --regex '^json = |^json\.env = |^json\.env\[1\]'
json = {}
json.env = []
json.env[1] = {}
json.env[1].name = "REGION"
json.env[1].value = "eu-west-1"
$ gronify search deploy.json --regex '^json = |^json\.env = |^json\.env\[1\]' | gronify unflatten
{"env":[null,{"name":"REGION","value":"eu-west-1"}]}
`,
        },
        {
          kind: "paragraph",
          text: "The array keeps its positions. Index 0 has no lines, so it is written as `null` and the entry stays at index 1. The search flags and regex syntax are explained in [how to grep JSON](/guides/grep-json).",
        },
        {
          kind: "subheading",
          text: "When gron or fastgron is the better fit",
        },
        {
          kind: "paragraph",
          text: '`gron --ungron` and `fastgron -u` create the missing parents themselves, and [gron\'s README](https://github.com/tomnomnom/gron#ungronning) says "arrays are padded with `null` when values are missing". If you want to grep a few lines and rebuild a partial document, those tools do it in one step:',
        },
        {
          kind: "terminal",
          label: "gron and fastgron rebuilding JSON from grep-filtered lines",
          lines: transcript`
$ gron deploy.json | grep tag | gron --ungron
{
  "image": {
    "tag": "1.4.2"
  }
}
$ gronify flatten deploy.json | grep REGION | fastgron -u
{
  "env": [
    null,
    {
      "name": "REGION"
    }
  ]
}
`,
        },
        {
          kind: "paragraph",
          text: "Those runs used gron 0.7.1 and [fastgron](https://github.com/adamritter/fastgron) 0.7.7. gron 0.7.1 parses only lines that end in `;`, so it rejects Gronify's output with `statement has no value` until you add the semicolons. fastgron reads Gronify's lines as they are.",
        },
      ],
    },
    {
      id: "accepted-input",
      heading: "Which gron output it accepts",
      blocks: [
        {
          kind: "paragraph",
          text: "The root must be named `json`. Blank lines are skipped, a trailing `;` is ignored, and the spaces around `=` are optional. These inputs were run through Gronify 1.3.1:",
        },
        {
          kind: "table",
          caption: "What gronify unflatten 1.3.1 does with each kind of input",
          columns: ["Input", "Result"],
          rows: [
            [
              "`gronify flatten` output, with or without `--sort`",
              "Accepted and converted in one streaming pass. With `--sort` the keys come back sorted.",
            ],
            [
              "gron 0.7.1 output, where every line ends in `;`",
              "Accepted. Keys come back in gron's sorted order.",
            ],
            [
              "fastgron 0.7.7 output, also with `--semicolon`, `--no-spaces`, or `--sort`",
              "Accepted.",
            ],
            [
              "Shuffled lines where each container still precedes its children",
              "Accepted. The document is rebuilt in memory.",
            ],
            [
              "Lines run through `sort`, so `json.ids[10]` precedes `json.ids[2]`",
              "Accepted. The array comes back in index order.",
            ],
            [
              "A child line before its container, such as reversed input",
              "Rejected with `parent path must be assigned before its children` or `root must be assigned before child paths`.",
            ],
            [
              "A root other than `json`, as `fastgron --root data` writes",
              "Rejected with `expected a gron assignment`.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Lines in document order (each container before its children, siblings together, array indexes ascending) convert in a single pass. Input that breaks this order is still accepted when the problem shows up within the first 16 MiB of input, and Gronify then rebuilds the whole document in memory. Once 16 MiB of input has been read or 16 MiB of output produced, an out-of-order line stops the run with an error that names the line, because part of the JSON may already be on stdout.",
        },
        {
          kind: "paragraph",
          text: "In a test for this page, a 24 MB gron file with one misplaced line at the end exited with status 1 after printing part of the document, and with `-o` no output file was created. Regenerate such input with `gronify flatten`. For sorted lines, `gronify flatten --sort` writes them in document order, which plain `sort` does not.",
        },
      ],
    },
    {
      id: "edit-with-sed",
      heading: "Edit JSON with sed and rebuild it",
      blocks: [
        {
          kind: "paragraph",
          text: "Each flattened line carries its full path, so `sed` can change one value without touching another key of the same name. Flatten to a file, edit the file, and unflatten it:",
        },
        {
          kind: "terminal",
          label: "Changing one value in a flattened file with sed",
          lines: transcript`
$ gronify flatten deploy.json > deploy.gron
$ sed -i.bak 's/^json\.image\.tag = .*/json.image.tag = "1.5.0"/' deploy.gron
$ gronify -o deploy.json unflatten deploy.gron
Output written to deploy.json
$ cat deploy.json
{"service":"api","build":12345678901234567890,"ratio":1.10,"image":{"repo":"registry.example.com/api","tag":"1.5.0"},"env":[{"name":"LOG_LEVEL","value":"info"},{"name":"REGION","value":"eu-west-1"}]}
$ jq -r .image.tag deploy.json
1.5.0
`,
        },
        {
          kind: "paragraph",
          text: "The result parses as JSON, and nothing but the tag changed. Appending a line such as `json.replicas = 3` adds a key at the end of the document, and deleting a line removes its key. When you already know the path, [jq](https://github.com/jqlang/jq) makes the same edit without the intermediate file: `jq '.image.tag = \"1.5.0\"' deploy.json`.",
        },
      ],
    },
    {
      id: "what-is-preserved",
      heading: "What is preserved and what is normalized",
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [
            "Numbers are validated, not parsed, so `12345678901234567890`, `1.10`, `-0`, and `1e-7` come out unchanged.",
            'Keys keep the order of the lines. Integer-like keys such as `"2"` are not moved ahead of the others, which `JSON.parse` in JavaScript would do. gron 0.7.1 and fastgron 0.7.7 wrote keys in alphabetical order when ungronning the same lines.',
            "Strings are rewritten the way `JSON.stringify` writes them. An escaped slash and a `\\u00e9` escape become plain characters, and a control character keeps its escape.",
            "Whitespace is not kept. The output is compact, or indented with `--pretty`, whatever the original file looked like.",
          ],
        },
        {
          kind: "terminal",
          label: "String escapes normalized and a number kept during unflatten",
          lines: transcript`
$ cat strings.gron
json = {}
json.path = "A\/B"
json.name = "caf\u00e9"
json.ctl = "\u0001"
json.n = 1.10
$ gronify unflatten strings.gron
{"path":"A/B","name":"café","ctl":"\u0001","n":1.10}
`,
        },
      ],
    },
    {
      id: "large-files",
      heading: "Unflatten large gron files",
      blocks: [
        {
          kind: "paragraph",
          text: "Document-order input is read as a byte stream and the JSON is written as it goes, so memory does not grow with the number of records. Out-of-order input is rebuilt in memory, as described above. Colored output (`--color`, or a terminal without `--no-color`) needs the whole document too, so pass `--no-color` for very large inputs.",
        },
        {
          kind: "paragraph",
          text: "The flatten and search side of big inputs has its own page, [large JSON files](/guides/large-json-files). Measured time and peak memory are in the [benchmarks](/#benchmarks) on the home page. The full table in [BENCHMARKS.md](https://github.com/1solomonwakhungu/gronify/blob/main/src/packages/cli/BENCHMARKS.md) lists unflatten next to gron and fastgron, including the 1 MB and 10 MB inputs where `fastgron -u` is faster.",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Is there an ungron or norg command for Gronify?",
      answer:
        "`gronify unflatten` is the ungron command; there is no separate binary. gron's README suggests aliasing `ungron` and `norg` to `gron --ungron`, and the same works here: with `alias ungron='gronify unflatten'` in your shell profile, `gronify flatten deploy.json | ungron` prints the document again.",
    },
    {
      question:
        "Can I convert gron output back to JSON without installing gron?",
      answer:
        "Yes. `gronify unflatten` reads the lines gron 0.7.1 writes, trailing semicolons included, and installs with `npm install -g gronify` on Node.js 20 or newer. The file has to be complete, because a subset that gron itself would pad with missing parents is rejected.",
    },
    {
      question: "How do I delete an array element without leaving null behind?",
      answer:
        "Unflatten keeps array positions, so removing the lines of `json.env[0]` leaves `null` at index 0. Removing the lines of the last element shortens the array. To remove an element and renumber the rest, use jq: `jq -c 'del(.env[0])' deploy.json` returns the array with one entry.",
    },
    {
      question: "What happens if an edited line is not valid?",
      answer:
        "Each value is validated as it is read. A line such as `json.a = tru` stops the run with `invalid JSON value` and its line number, a line with no assignment gives `expected a gron assignment`, and the exit status is 1. With `-o`, the existing output file is left as it was.",
    },
  ],
  related: ["flatten-json", "gron-alternative", "grep-json"],
};
