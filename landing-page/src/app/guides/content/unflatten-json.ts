import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.4.0 (with historical 1.3.1
// notes where noted, plus gron 0.7.1, fastgron 0.7.7, jq 1.8.2, grep, and sed)
// run against the deploy.json shown in the first transcript.
export const unflattenJson: Guide = {
  slug: "unflatten-json",
  title: "Ungron: unflatten gron lines back into JSON | Gronify",
  description:
    "gronify unflatten turns json.path = value lines back into JSON. See the round trip, filtered search subsets, which gron output it reads, and sed edits.",
  h1: "Unflatten gron lines back into JSON (ungron)",
  lede: "To turn gron lines back into JSON, pipe them into `gronify unflatten` or pass a file: `gronify unflatten data.gron`. It reads the `json.path = value` lines written by `gronify flatten`, gron, or fastgron and writes one JSON document with numbers and key order unchanged. Missing parent containers are filled in automatically, so filtered subsets from `gronify search` or `grep` rebuild valid JSON directly; see [filtered lines](#filtered-lines).",
  published: "2026-11-12",
  updated: "2026-11-22",
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
      heading: "Unflatten filtered lines to keep a subset",
      blocks: [
        {
          kind: "paragraph",
          text: "A common gron workflow is to search or grep for a few lines and turn what is left back into JSON. `gronify unflatten` fills in any missing parent containers from the path segments, starting at the root: a key (`.image` or `[\"a.b\"]`) creates an object, an index (`[1]`) creates an array, and skipped array indexes become `null`:",
        },
        {
          kind: "terminal",
          label:
            "Unflattening filtered lines from gronify search and grep",
          lines: transcript`
$ gronify search deploy.json tag | gronify unflatten
{"image":{"tag":"1.4.2"}}
$ gronify flatten deploy.json | grep REGION | gronify unflatten
{"env":[null,{"name":"REGION"}]}
$ gronify search deploy.json 'env[1]' | gronify unflatten
{"env":[null,{"name":"REGION","value":"eu-west-1"}]}
`,
        },
        {
          kind: "paragraph",
          text: "The array keeps its positions. Index 0 has no lines, so it is written as `null` and the entry stays at index 1. Filtered lines in document order (which is what `gronify search` and `gronify flatten | grep` write) stream in a single pass just like full gron. (Gronify 1.3.2 and earlier did not synthesize missing parents and stopped with `root must be assigned before child paths`.)",
        },
        { kind: "subheading", text: "Remove what you do not want" },
        {
          kind: "paragraph",
          text: "To drop one subtree and keep everything else, invert the search with `-v` and pipe into `unflatten`. This removes the `env` array and rebuilds the rest:",
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
        { kind: "subheading", text: "Conflicting lines still fail" },
        {
          kind: "paragraph",
          text: "Synthesizing missing containers does not hide contradictions. Putting a child under a scalar, or using both a property and an array index on the same container, stops with exit status 1 and prints no JSON:",
        },
        {
          kind: "terminal",
          label: "Unflatten errors when two lines disagree on a container type",
          lines: transcript`
$ printf 'json.a = 1\njson.a.b = 2\n' | gronify unflatten
Error: unflattening gron: line 2: property does not match its parent container
Tip: Gron lines should look like: json.path = value
$ printf 'json.a = 1\njson[0] = 2\n' | gronify unflatten
Error: unflattening gron: line 2: property does not match its parent container
Tip: Gron lines should look like: json.path = value
`,
        },
        {
          kind: "paragraph",
          text: "The search flags and regex syntax are explained in [how to grep JSON](/guides/grep-json). `gron --ungron` and [fastgron](https://github.com/adamritter/fastgron) (`fastgron -u`) synthesize missing parents and pad skipped array positions with `null` in the same way. gron 0.7.1 parses only lines that end in `;`, so it rejects Gronify's output with `statement has no value` until you add semicolons, whereas `gronify unflatten` and `fastgron -u` accept lines with or without them.",
        },
      ],
    },
    {
      id: "accepted-input",
      heading: "Which gron and fastgron output gronify unflatten accepts",
      blocks: [
        {
          kind: "paragraph",
          text: "The root must be named `json`. Blank lines are skipped, a trailing `;` is ignored, and the spaces around `=` are optional. These inputs were run through Gronify 1.4.0:",
        },
        {
          kind: "table",
          caption: "What gronify unflatten 1.4.0 does with each kind of input",
          columns: ["Input", "Result"],
          rows: [
            [
              "`gronify flatten` output, with or without `--sort`",
              "Accepted and converted in one streaming pass. With `--sort` the keys come back sorted.",
            ],
            [
              "Filtered subsets from `gronify search` or `grep`, missing root or parent lines",
              "Accepted. Missing containers are filled in from the path, and document-order subsets stream in one pass.",
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
              "Shuffled or out-of-order lines within the first 16 MiB",
              "Accepted. The document is rebuilt in memory.",
            ],
            [
              "Lines run through `sort`, so `json.ids[10]` precedes `json.ids[2]`",
              "Accepted within the first 16 MiB. The array comes back in index order.",
            ],
            [
              "Conflicting container types (a child under a scalar, or a key and an index on one container)",
              "Rejected with `property does not match its parent container` or `path does not match its parent container`.",
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
        "Yes. `gronify unflatten` reads the lines gron 0.7.1 writes, trailing semicolons included, and installs with `npm install -g gronify` on Node.js 20 or newer. Filtered subsets work too: `gronify unflatten` creates missing parent containers automatically, as `gron --ungron` does.",
    },
    {
      question: "How do I delete an array element without leaving null behind?",
      answer:
        "Unflatten keeps array positions, so removing the lines of `json.env[0]` leaves `null` at index 0. Removing the lines of the last element shortens the array. To remove an element and renumber the rest, use jq: `jq -c 'del(.env[0])' deploy.json` prints the document with one entry left in `env`.",
    },
    {
      question: "What happens if an edited line is not valid?",
      answer:
        "Each value is validated as it is read. A line such as `json.a = tru` stops the run with `invalid JSON value` and its line number, a line with no assignment gives `expected a gron assignment`, and the exit status is 1. With `-o`, the existing output file is left as it was.",
    },
  ],
  related: ["flatten-json", "gron-alternative", "grep-json"],
};
