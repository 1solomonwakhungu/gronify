import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gron 0.7.1, fastgron 0.7.7 (both from
// Homebrew), and gronify 1.3.1, run on 2026-11-12 against the service.json and
// events.jsonl shown in the transcripts. Release, commit, and issue dates come
// from the GitHub API and the npm registry on the same day. Benchmark figures
// are copied from src/packages/cli/BENCHMARKS.md (generated 2026-11-05).
export const gronAlternative: Guide = {
  slug: "gron-alternative",
  title: "gron alternatives: gron vs fastgron vs Gronify compared",
  description:
    "gron, fastgron and Gronify compared with dates: latest releases, install methods, output format, speed, memory on large files, npm and Windows support.",
  h1: "gron alternatives: gron, fastgron and Gronify compared",
  lede: "This page compares gron with two alternatives that print the same `json.path = value` lines. [fastgron](https://github.com/adamritter/fastgron) is a C++ tool that flattened every record file from 1 MB to 1 GB faster than the other two in our benchmark. Gronify is a Node.js CLI that installs with `npm install -g gronify` and streams its input, so its memory use barely moves between a 1 MB file and a 1 GB one. [gron](https://github.com/tomnomnom/gron) still runs and has the widest packaging; its latest release is from April 2022. The facts below were checked on 2026-11-12 against gron 0.7.1, fastgron 0.7.7, and Gronify 1.3.1.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "comparison-table",
      heading: "gron vs fastgron vs Gronify at a glance",
      blocks: [
        {
          kind: "paragraph",
          text: "All three turn JSON into one assignment per line and back again. The table lists where they differ.",
        },
        {
          kind: "table",
          caption:
            "gron 0.7.1, fastgron 0.7.7, and Gronify 1.3.1, checked on 2026-11-12. Memory is peak RSS while flattening, from the benchmark run on 2026-11-05.",
          columns: ["Property", "gron", "fastgron", "Gronify"],
          rows: [
            [
              "Language and runtime",
              "Go, no runtime dependencies",
              "C++20, built on simdjson",
              "TypeScript, runs on Node.js 20 or newer",
            ],
            [
              "Latest release",
              "v0.7.1, 2022-04-13",
              "v0.7.7, 2023-12-06",
              "1.3.1, 2026-11-05",
            ],
            [
              "Install methods",
              "Release binaries, `brew install gron`, `go install`, Scoop",
              "Release binaries, `brew install fastgron`, Arch (`fastgron-git`), Nix",
              "`npm install -g gronify`, `npx gronify`, a Homebrew tap",
            ],
            [
              "Default output order",
              "Sorted by key, and each line ends with `;`",
              "Document order, no `;`",
              "Document order, no `;`",
            ],
            [
              "Built-in filtering",
              "None, pipe to grep",
              "`-F` fixed string, and path queries",
              "`search` with plain text or a JavaScript regex",
            ],
            [
              "Ungron of grep-filtered lines",
              "Yes, `-u`",
              "Yes, `-u`",
              "No, `unflatten` needs every container line",
            ],
            [
              "JSON Lines input",
              "Yes, `-s`",
              "Yes, `-s`",
              "No, one document per run",
            ],
            [
              "URL input",
              "Yes",
              "Yes, except in the Windows binary",
              "No, pipe from `curl`",
            ],
            [
              "Memory on large files",
              "Reads the whole document: 3.74 GiB on a 100 MB file",
              "Grows with the file: 1.85 GiB on a 1 GB file",
              "Streams: 65 MiB on a 1 GB file",
            ],
            [
              "Number handling",
              "Printed as written",
              "Printed as written",
              "Printed as written",
            ],
          ],
        },
      ],
    },
    {
      id: "maintenance",
      heading: "Is gron still maintained?",
      blocks: [
        {
          kind: "paragraph",
          text: "These are the dates on 2026-11-12, read from each project's GitHub repository and from the npm registry.",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "gron: latest release v0.7.1 on 2022-04-13, latest commit on 2025-05-31, 57 open issues and pull requests. Two of the issues concern memory: [#50, Inexplicably high memory usage](https://github.com/tomnomnom/gron/issues/50), opened in September 2018, and [#61, Issues processing large JSON files](https://github.com/tomnomnom/gron/issues/61), opened in February 2019.",
            "fastgron: latest release v0.7.7 on 2023-12-06, latest commit on 2026-07-04.",
            "Gronify: latest release 1.3.1 on 2026-11-05.",
          ],
        },
        {
          kind: "paragraph",
          text: "gron 0.7.1 ran every gron command on this page correctly. Both memory issues were still open on that date.",
        },
      ],
    },
    {
      id: "install",
      heading: "Installing from npm and on Windows",
      blocks: [
        {
          kind: "subheading",
          text: "The gron package on npm is a different project",
        },
        {
          kind: "paragraph",
          text: "`npm install -g gron` does not install tomnomnom's gron. [The npm package named gron](https://www.npmjs.com/package/gron) is published from the FGRibreau/gron repository, a separate Node.js program that puts its own `gron` and `ungron` commands on your PATH. Its latest version is 4.4.0, published in November 2016. Neither tomnomnom's gron nor fastgron lists npm in its install instructions.",
        },
        {
          kind: "paragraph",
          text: "The npm package for the tool on this site is `gronify`. `npm install -g gronify` installs it, and `npx gronify --help` runs it without installing. The other routes are in the [install section](/#install) of the home page.",
        },
        { kind: "subheading", text: "Windows" },
        {
          kind: "list",
          style: "bullet",
          items: [
            "gron publishes Windows zips for 386, amd64, and arm64 with v0.7.1, and Scoop's main bucket carries the same version.",
            "fastgron publishes `fastgron.exe`. Its README says that binary is built without libcurl, so it cannot read `http` or `https` URLs directly.",
            "Gronify installs through npm on any system with Node.js 20 or newer. Its CI runs the tests on Linux and macOS and has no Windows job, so the project does not test Windows itself.",
          ],
        },
      ],
    },
    {
      id: "output-differences",
      heading: "Output differences that break scripts when you switch",
      blocks: [
        {
          kind: "paragraph",
          text: "Here is one small file through each tool:",
        },
        {
          kind: "terminal",
          label: "The same JSON file flattened by gron, fastgron, and Gronify",
          lines: transcript`
$ cat service.json
{"service":"checkout","version":"2.4.1","regions":["us-east-1","eu-west-1"],"owner":{"team":"payments","id":12345678901234567890}}
$ gron service.json
json = {};
json.owner = {};
json.owner.id = 12345678901234567890;
json.owner.team = "payments";
json.regions = [];
json.regions[0] = "us-east-1";
json.regions[1] = "eu-west-1";
json.service = "checkout";
json.version = "2.4.1";
$ fastgron service.json
json = {}
json.service = "checkout"
json.version = "2.4.1"
json.regions = []
json.regions[0] = "us-east-1"
json.regions[1] = "eu-west-1"
json.owner = {}
json.owner.team = "payments"
json.owner.id = 12345678901234567890
$ gronify flatten service.json
json = {}
json.service = "checkout"
json.version = "2.4.1"
json.regions = []
json.regions[0] = "us-east-1"
json.regions[1] = "eu-west-1"
json.owner = {}
json.owner.team = "payments"
json.owner.id = 12345678901234567890
`,
        },
        {
          kind: "paragraph",
          text: "gron sorted the keys and ended every line with `;`. fastgron and Gronify printed identical bytes, in document order and with no semicolon. All three kept the 20-digit `id` as written. A script written against gron's format needs a flag: `fastgron --sort --semicolon` printed exactly what gron printed for this file, and `gronify flatten --sort` printed gron's order without the `;`. The same sorted output is what lines two files up for `diff`; see [comparing two JSON files](/guides/compare-json-files).",
        },
        {
          kind: "paragraph",
          text: "The semicolon also decides which tool can read which output. `gron -u` rejects a line that lacks one. `fastgron -u` and `gronify unflatten` accept lines with or without it.",
        },
        {
          kind: "terminal",
          label: "Feeding one tool's flattened output to another tool's ungron",
          lines: [
            {
              kind: "command",
              text: "gron service.json | gronify unflatten",
            },
            {
              kind: "output",
              text: '{"owner":{"id":12345678901234567890,"team":"payments"},"regions":["us-east-1","eu-west-1"],"service":"checkout","version":"2.4.1"}',
            },
            {
              kind: "command",
              text: "fastgron service.json | gronify unflatten",
            },
            {
              kind: "output",
              text: '{"service":"checkout","version":"2.4.1","regions":["us-east-1","eu-west-1"],"owner":{"team":"payments","id":12345678901234567890}}',
            },
            {
              kind: "command",
              text: "gronify flatten service.json | gron -u",
            },
            {
              kind: "output",
              text: "ungron failed for `json = {}`: statement has no value",
            },
          ],
        },
        {
          kind: "table",
          caption:
            "Each pairing was run on service.json with gron 0.7.1, fastgron 0.7.7, and Gronify 1.3.1.",
          columns: ["Flattened by", "Read by", "Result"],
          rows: [
            [
              "`gron`",
              "`gronify unflatten`",
              "Works. Keys keep gron's sorted order",
            ],
            ["`gron`", "`fastgron -u`", "Works"],
            [
              "`fastgron`",
              "`gron -u`",
              "Fails with `statement has no value`. Works with `fastgron --semicolon`",
            ],
            [
              "`fastgron`",
              "`gronify unflatten`",
              "Works. Keys keep document order",
            ],
            [
              "`gronify flatten`",
              "`gron -u`",
              "Fails with `statement has no value`. Works after `sed 's/$/;/'`",
            ],
            [
              "`gronify flatten`",
              "`fastgron -u`",
              "Works. Keys come out sorted",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Key order after a round trip differs too. `gron -u` and `fastgron -u` wrote the keys in alphabetical order and indented the JSON, even when the lines arrived in document order. `gronify unflatten` writes keys in the order the lines arrive and prints compact JSON unless you add the global `--pretty` flag.",
        },
      ],
    },
    {
      id: "speed-and-memory",
      heading: "Speed and memory on large files",
      blocks: [
        {
          kind: "paragraph",
          text: "fastgron is the fastest of the three at flattening a whole file. In the benchmark published with Gronify 1.3.1 (run on 2026-11-05 on an Apple M5 Pro, against gron 0.7.1 and fastgron 0.7.7), it flattened record files from 1 MB to 1 GB faster than both other tools, and its `-F` filter counted matches faster than `gronify search` at every size. On the 1 GB file fastgron took 1.78 s and Gronify 3.63 s. gron did not finish, because the harness stops any process that passes 8 GiB of memory.",
        },
        {
          kind: "paragraph",
          text: "Memory use is the reverse. On that 1 GB file fastgron peaked at 1.85 GiB and Gronify at 65 MiB, because Gronify parses the input as a stream and does not keep the document. gron decodes the whole document and then sorts it. On the 100 MB file it peaked at 3.74 GiB, and `--no-sort` did not lower that. Unflattening the 1 GB file peaked at 7.46 GiB in fastgron and 97 MiB in Gronify.",
        },
        {
          kind: "paragraph",
          text: "Gronify was faster than fastgron at unflattening the 100 MB and 1 GB files and in capped runs on those sizes, where `--limit` and `-m` stop reading the input once they have enough lines. On small files fastgron leads on both time and memory.",
        },
        {
          kind: "paragraph",
          text: "The full tables and the exact commands are in the [benchmarks](/#benchmarks) on the home page. For a file that does not fit in RAM, see the guide to [large JSON files](/guides/large-json-files).",
        },
      ],
    },
    {
      id: "what-gronify-lacks",
      heading: "What gron and fastgron do that Gronify does not",
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [
            "JSON Lines. `gron -s` and `fastgron -s` read one JSON document per line and number them as elements of one array. Gronify reads one document per run and stops with an error at the second.",
            "URLs. `gron https://api.github.com/repos/tomnomnom/gron` fetches the URL itself, and so does fastgron outside Windows. Gronify reads files and stdin only, so pipe the response in: `curl -s https://api.github.com/repos/tomnomnom/gron | gronify flatten`.",
            "Ungron of a filtered subset. `gron -u` and `fastgron -u` rebuild JSON from whatever lines grep left and pad skipped array positions with `null`. `gronify unflatten` needs every container line and fails without them. The ways around that are in the guide to [turning gron lines back into JSON](/guides/unflatten-json).",
            "Path queries. `fastgron service.json .owner.team` prints only that path, and its README documents wildcards and slices. Gronify has no query language; `search` filters the flattened lines by text or regex, as shown in [how to grep JSON](/guides/grep-json).",
          ],
        },
        {
          kind: "terminal",
          label:
            "Subset ungron in gron, Gronify, and fastgron, and a fastgron path query",
          lines: transcript`
$ gron service.json | grep regions | gron -u
{
  "regions": [
    "us-east-1",
    "eu-west-1"
  ]
}
$ gronify flatten service.json | grep regions | gronify unflatten
Error: unflattening gron: line 1: root must be assigned before child paths
Tip: Gron lines should look like: json.path = value
$ gronify flatten service.json | grep regions | fastgron -u
{
  "regions": [
    "us-east-1",
    "eu-west-1"
  ]
}
$ fastgron service.json .owner.team
json.owner.team = "payments"
`,
        },
        {
          kind: "paragraph",
          text: "In the third command Gronify flattens the file with its low memory use, and fastgron rebuilds the small filtered result.",
        },
        {
          kind: "terminal",
          label: "JSON Lines input in gron and in Gronify",
          lines: transcript`
$ cat events.jsonl
{"id":1,"status":"ok"}
{"id":2,"status":"failed"}
$ gron -s events.jsonl
json = [];
json[0] = {};
json[0].id = 1;
json[0].status = "ok";
json[1] = {};
json[1].id = 2;
json[1].status = "failed";
$ gronify flatten events.jsonl
Error: flattening JSON: Unexpected '{' after the top-level value at byte offset 23 (line 2, column 1)
Tip: Validate your JSON with a linter like https://jsonlint.com
`,
        },
      ],
    },
    {
      id: "which-to-use",
      heading: "Which one should I use?",
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [
            "If your files are a few megabytes and you want one binary with no runtime and sorted output, installed from Homebrew, Scoop, or `go install`, use gron.",
            "If speed matters most and the file fits in RAM about twice over, or you need JSON Lines, path queries, or ungron of filtered lines, use fastgron.",
            "If you want an npm install, regex search in one command, the original key order, or files larger than your RAM, use Gronify.",
          ],
        },
        {
          kind: "paragraph",
          text: "If you already know the path and want to select or reshape records, none of the three fits. That is [what jq is for](/guides/jq-alternative).",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Does gron --stream lower memory use on a large file?",
      answer:
        "No. gron's help describes `-s, --stream` as \"Treat each line of input as a separate JSON object\", which means JSON Lines input. gron still decodes one large document whole. fastgron's `-s` flag has the same meaning.",
    },
    {
      question: "Does gron --no-sort keep the original key order?",
      answer:
        "No. The first key `gron --no-sort` printed for the sample file changed from run to run (`service`, `version`, `regions`, and `owner` all appeared). fastgron and Gronify print keys in document order on every run.",
    },
    {
      question: "Is fastgron a drop-in replacement for gron?",
      answer:
        "Not with its default flags, because its output is unsorted and has no `;`. `fastgron --sort --semicolon` printed the same bytes as `gron` for the sample file on this page, and fastgron accepts gron's `-u` and `-s` flags and URL arguments. fastgron 0.7.7 has no `--values` or `--json` mode, and its `-v` inverts a `-F` match.",
    },
    {
      question: "Does gronify flatten --sort print the same order as gron?",
      answer:
        'For plain ASCII keys, yes, minus the `;`. The orders differ once an object mixes bare and bracketed keys: gron 0.7.1 puts every bare key such as `json.b` before every bracketed key such as `json["10"]`.',
    },
  ],
  related: ["jq-alternative", "unflatten-json", "large-json-files"],
};
