import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.3.1 run on macOS with zsh,
// Apple diff (based on FreeBSD diff), jq 1.8.2, and git 2.54.0. jd and dyff
// were not installed, so they are described from their READMEs and not shown.
export const compareJsonFiles: Guide = {
  slug: "compare-json-files",
  title: "Compare two JSON files, ignoring key order | Gronify",
  description:
    "Flatten both JSON files with gronify flatten --sort so the keys line up, then run the system diff. Every changed line shows the full path to its value.",
  h1: "Compare two JSON files with diff, ignoring key order",
  lede: "To compare two JSON files whose keys are in different orders, flatten each one with `gronify flatten --sort` and hand the two outputs to the system `diff`. Gronify has no compare command. It writes one `json.path = value` line per value with object keys sorted at every level, and `diff` does the comparing, so every changed line carries the full path to its value.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "sort-then-diff",
      heading: "Flatten both files with --sort, then run diff",
      blocks: [
        {
          kind: "paragraph",
          text: "The examples use two versions of a small deployment config. `new.json` has one changed value, one added key, one removed key, and its keys in a different order:",
        },
        {
          kind: "terminal",
          label: "The two JSON files being compared",
          lines: transcript`
$ cat old.json
{"name":"shop","services":{"api":{"replicas":3,"limits":{"cpu":"500m","memory":"256Mi"},"env":{"LOG_LEVEL":"info","REGION":"eu-west-1"}},"worker":{"replicas":2,"limits":{"cpu":"250m","memory":"256Mi"},"env":{"LOG_LEVEL":"info","REGION":"eu-west-1"}}}}
$ cat new.json
{"services":{"worker":{"env":{"REGION":"eu-west-1"},"limits":{"memory":"512Mi","cpu":"250m"},"replicas":2},"api":{"limits":{"memory":"256Mi","cpu":"500m"},"env":{"REGION":"eu-west-1","TIMEOUT_MS":3000,"LOG_LEVEL":"info"},"replicas":3}},"name":"shop"}
`,
        },
        {
          kind: "paragraph",
          text: "Plain `diff old.json new.json` reports the one line as changed and prints both documents in full. In bash or zsh, process substitution gives `diff` two flattened, sorted streams and needs no temporary files:",
        },
        {
          kind: "terminal",
          label:
            "System diff run on the sorted flatten output of two JSON files",
          lines: transcript`
$ diff <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json)
7a8
> json.services.api.env.TIMEOUT_MS = 3000
14d14
< json.services.worker.env.LOG_LEVEL = "info"
18c18
< json.services.worker.limits.memory = "256Mi"
---
> json.services.worker.limits.memory = "512Mi"
`,
        },
        {
          kind: "paragraph",
          text: "`>` marks lines found only in the second file and `<` lines found only in the first. `TIMEOUT_MS` was added under `services.api.env`, `LOG_LEVEL` was removed from `services.worker.env`, and the worker's memory limit went from `256Mi` to `512Mi`. Every line starts at the root, so it says which service a `memory` value belongs to. The reordered keys produce no output, because `--sort` put both documents in the same order before `diff` read them.",
        },
        {
          kind: "paragraph",
          text: "`--no-color` is a global flag, accepted before or after the command name. Gronify already leaves color off when its output is a pipe, and the flag makes that explicit. The npm command is under [install](/#install), and the line format has its own guide on [flattening JSON from the command line](/guides/flatten-json).",
        },
      ],
    },
    {
      id: "without-process-substitution",
      heading: "Without process substitution: write two files, then diff",
      blocks: [
        {
          kind: "paragraph",
          text: "`<( )` is a bash and zsh feature. POSIX `sh` and dash stop with a syntax error at the parenthesis. In those shells, write each flattened file with `-o` and compare the files:",
        },
        {
          kind: "terminal",
          label: "Writing two sorted flatten files and comparing them",
          lines: transcript`
$ gronify --no-color -o old.gron flatten --sort old.json
Output written to old.gron
$ gronify --no-color -o new.gron flatten --sort new.json
Output written to new.gron
$ diff old.gron new.gron
7a8
> json.services.api.env.TIMEOUT_MS = 3000
14d14
< json.services.worker.env.LOG_LEVEL = "info"
18c18
< json.services.worker.limits.memory = "256Mi"
---
> json.services.worker.limits.memory = "512Mi"
`,
        },
        {
          kind: "paragraph",
          text: "The saved files also let you try several `diff` flags without flattening again. When one side comes from a command, pass `-` and `diff` reads that side from standard input:",
        },
        {
          kind: "terminal",
          label: "Comparing a saved flatten file with JSON read from a pipe",
          lines: transcript`
$ cat new.json | gronify --no-color flatten --sort | diff old.gron -
7a8
> json.services.api.env.TIMEOUT_MS = 3000
14d14
< json.services.worker.env.LOG_LEVEL = "info"
18c18
< json.services.worker.limits.memory = "256Mi"
---
> json.services.worker.limits.memory = "512Mi"
`,
        },
        {
          kind: "paragraph",
          text: "If Gronify fails on one side, it prints the error to stderr and exits with status 1, but `diff` still runs on whatever reached it. A missing file gives `diff` empty input. JSON that breaks partway through a top-level array gives it the lines flattened before the error. Either way the diff shows a large block of removed or added lines, so read stderr before trusting it.",
        },
      ],
    },
    {
      id: "jq-sort-keys",
      heading: "How this differs from diff with jq -S",
      blocks: [
        {
          kind: "paragraph",
          text: "The usual answer to this question is `diff <(jq -S . a.json) <(jq -S . b.json)`. [jq](https://github.com/jqlang/jq) with `-S` pretty-prints the document with object keys sorted, so reordered keys disappear there too. This is jq 1.8.2 on the same pair of files:",
        },
        {
          kind: "terminal",
          label:
            "System diff run on jq sorted-key output of the same two files",
          lines: transcript`
$ diff <(jq -S . old.json) <(jq -S . new.json)
7c7,8
<         "REGION": "eu-west-1"
---
>         "REGION": "eu-west-1",
>         "TIMEOUT_MS": 3000
17d17
<         "LOG_LEVEL": "info",
22c22
<         "memory": "256Mi"
---
>         "memory": "512Mi"
`,
        },
        {
          kind: "paragraph",
          text: 'The same three changes are reported, with less to locate them by. `"memory": "256Mi"` appears under both services, and the diff gives only line 22 of the pretty-printed text, so you read upward from there to find the parents. The added key also makes `REGION` count as changed, because that line gained a trailing comma. Flattened lines have no commas, so one added key is one added line.',
        },
        {
          kind: "paragraph",
          text: "The jq form is a good choice for small files, where the parents sit a few lines up, and it needs nothing installed besides jq. It also copes better with an element inserted into an array, as the next section shows.",
        },
      ],
    },
    {
      id: "sort-and-arrays",
      heading: "What --sort does, and why arrays compare by position",
      blocks: [
        {
          kind: "paragraph",
          text: "`--sort` orders the keys of every object, at every depth, by UTF-16 code unit, the order of JavaScript's default `sort()`. Each key's subtree stays directly under it, and values are untouched. Arrays keep their index order, which follows JSON itself: [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) defines an object as an unordered collection of name/value pairs and an array as an ordered sequence of values.",
        },
        {
          kind: "paragraph",
          text: "The cost shows when an element is added at the front of an array. Every later element gets a new index, so its line changes:",
        },
        {
          kind: "terminal",
          label:
            "An element inserted at the front of an array, compared both ways",
          lines: transcript`
$ cat hosts-old.json
{"hosts":["db1","db2","db3"],"region":"eu-west-1"}
$ cat hosts-new.json
{"hosts":["db0","db1","db2","db3"],"region":"eu-west-1"}
$ diff <(gronify --no-color flatten --sort hosts-old.json) <(gronify --no-color flatten --sort hosts-new.json)
3,5c3,6
< json.hosts[0] = "db1"
< json.hosts[1] = "db2"
< json.hosts[2] = "db3"
---
> json.hosts[0] = "db0"
> json.hosts[1] = "db1"
> json.hosts[2] = "db2"
> json.hosts[3] = "db3"
$ diff <(jq -S . hosts-old.json) <(jq -S . hosts-new.json)
2a3
>     "db0",
`,
        },
        {
          kind: "paragraph",
          text: "One host was added. The flattened comparison reports three changed lines and one new line, and that count grows with the length of the array. Pretty-printed JSON carries no indexes, so the jq form reports the insertion as a single line. Neither form recognizes an array whose elements were only reordered.",
        },
        {
          kind: "paragraph",
          text: "For arrays that shift or reorder, use a tool that compares the parsed structure. [jd](https://github.com/josephburnett/jd) compares JSON and YAML values, and its README documents `jd -set a.json b.json` to treat arrays as sets, `-mset` for multisets, and `-setkeys` to name the keys that identify an object in a set. [dyff](https://github.com/homeport/dyff) describes itself as a diff tool for YAML files, and sometimes JSON. Its command is `dyff between old.json new.json`, and its help text lists `--ignore-order-changes` to ignore order changes in lists.",
        },
      ],
    },
    {
      id: "diff-flags",
      heading: "Useful diff flags for flattened output",
      blocks: [
        {
          kind: "paragraph",
          text: "These ran with the `diff` that ships with macOS. GNU diff 3.10 accepts the same flags and printed the same output.",
        },
        { kind: "subheading", text: "Unified output with readable names" },
        {
          kind: "paragraph",
          text: "`-u` prints unified hunks with three lines of context, and `-U1` cuts that to one. With process substitution the header shows names such as `/dev/fd/12`. `--label` replaces them:",
        },
        {
          kind: "terminal",
          label: "Unified diff of sorted flatten output with file labels",
          lines: transcript`
$ diff -U1 --label old.json --label new.json <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json)
--- old.json
+++ new.json
@@ -7,2 +7,3 @@
 json.services.api.env.REGION = "eu-west-1"
+json.services.api.env.TIMEOUT_MS = 3000
 json.services.api.limits = {}
@@ -13,3 +14,2 @@
 json.services.worker.env = {}
-json.services.worker.env.LOG_LEVEL = "info"
 json.services.worker.env.REGION = "eu-west-1"
@@ -17,3 +17,3 @@
 json.services.worker.limits.cpu = "250m"
-json.services.worker.limits.memory = "256Mi"
+json.services.worker.limits.memory = "512Mi"
 json.services.worker.replicas = 2
`,
        },
        { kind: "subheading", text: "Only the changed lines" },
        {
          kind: "paragraph",
          text: "To get a list you can paste into a ticket or pipe into another tool, drop the line-number markers and separators:",
        },
        {
          kind: "terminal",
          label: "Filtering diff output down to the changed lines",
          lines: transcript`
$ diff <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json) | grep '^[<>]'
> json.services.api.env.TIMEOUT_MS = 3000
< json.services.worker.env.LOG_LEVEL = "info"
< json.services.worker.limits.memory = "256Mi"
> json.services.worker.limits.memory = "512Mi"
`,
        },
        { kind: "subheading", text: "A yes-or-no answer for scripts" },
        {
          kind: "paragraph",
          text: "`diff -q` prints one line when the inputs differ and nothing when they match. The exit status is 1 for a difference and 0 for none, so an `if` can branch on it:",
        },
        {
          kind: "terminal",
          label: "Quiet diff and its exit status",
          lines: transcript`
$ diff -q old.gron new.gron; echo $?
Files old.gron and new.gron differ
1
`,
        },
      ],
    },
    {
      id: "git-diff-json",
      heading: "Make git diff show path-level changes for JSON",
      blocks: [
        {
          kind: "paragraph",
          text: "Git can run a command on each version of a file and compare the results, which it calls a textconv driver. Git appends the file name to the command, so `gronify --no-color flatten --sort` works as written. One line in `.gitattributes` assigns a driver to `*.json` and one config entry defines it. The driver name `flatjson` is arbitrary.",
        },
        {
          kind: "terminal",
          label: "Setting up a git textconv driver and its git diff output",
          lines: transcript`
$ echo '*.json diff=flatjson' >> .gitattributes
$ git config diff.flatjson.textconv "gronify --no-color flatten --sort"
$ git diff -U0 config.json
diff --git a/config.json b/config.json
index af94cd3..2eb3520 100644
--- a/config.json
+++ b/config.json
@@ -7,0 +8 @@ json.services.api.env.REGION = "eu-west-1"
+json.services.api.env.TIMEOUT_MS = 3000
@@ -14 +14,0 @@ json.services.worker.env = {}
-json.services.worker.env.LOG_LEVEL = "info"
@@ -18 +18 @@ json.services.worker.limits.cpu = "250m"
-json.services.worker.limits.memory = "256Mi"
+json.services.worker.limits.memory = "512Mi"
`,
        },
        {
          kind: "paragraph",
          text: "That is Git 2.54.0, with `config.json` changed from the contents of `old.json` to those of `new.json`. Git still does the comparing, and Gronify only turns each side into text. `git log -p` and `git show` use the driver too. The text after each `@@` is the line above the hunk, which is a path. A change that only reorders keys prints nothing in `git diff`, while `git status` still lists the file as modified.",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "`.gitattributes` can be committed. The `git config` line is stored in each clone's `.git/config`, so every collaborator runs it once.",
            "The converted output is for reading and cannot be applied as a patch. `git format-patch` ignores the driver, and `git diff --no-textconv` shows the raw text.",
            "If a version of the file is not valid JSON, Gronify exits with an error and Git stops with `fatal: unable to read files to diff`.",
          ],
        },
      ],
    },
    {
      id: "large-files",
      heading: "Comparing large JSON files",
      blocks: [
        {
          kind: "paragraph",
          text: "How much `--sort` holds in memory depends on the root of the document. A top-level array, the usual shape of a large export, is written as it is read, one record at a time. Everything inside an object is held until the document ends, or until the enclosing record ends when the root is an array. Gronify keeps up to 64 MiB of line data in memory (`GRONIFY_SORT_MEMORY` changes the limit), then moves buffers to an anonymous temp file in `$TMPDIR`, finished ones first, and reads them back at the end. A file that is one very large object therefore needs temp space of roughly the size of its flattened output.",
        },
        {
          kind: "paragraph",
          text: "`diff` then reads two text files that are larger than the minified JSON they came from, because every line repeats its full path. Write the flattened files once with `-o` and reuse them. When only one part of the document matters, filter both sides first. `search --sort` filters, then sorts only the lines that match:",
        },
        {
          kind: "terminal",
          label: "Comparing one subtree of two JSON files",
          lines: transcript`
$ diff <(gronify --no-color search --sort old.json services.worker) <(gronify --no-color search --sort new.json services.worker)
3d2
< json.services.worker.env.LOG_LEVEL = "info"
7c6
< json.services.worker.limits.memory = "256Mi"
---
> json.services.worker.limits.memory = "512Mi"
`,
        },
        {
          kind: "paragraph",
          text: "Search terms and patterns are covered in the guide on [how to grep JSON](/guides/grep-json), and memory use on multi-gigabyte input in the guide on [searching large JSON files](/guides/large-json-files). Measured figures are under [benchmarks](/#benchmarks).",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Why does diff report 1.0 and 1 as different?",
      answer:
        "Gronify prints every number exactly as it is written in the file, so `1.0` and `1` are different text and `diff` reports the line. jq 1.8.2 keeps the literal too, so the `jq -S` form reports the same difference. To treat numerically close values as equal, [jd](https://github.com/josephburnett/jd) has a `-precision` option.",
    },
    {
      question: "Does indentation or whitespace change the result?",
      answer:
        "No. Gronify parses the JSON, so a minified file and a pretty-printed copy of it flatten to identical lines and `diff` prints nothing. Keys, values, and array positions are all that count.",
    },
    {
      question:
        "How do I ignore a field that changes on every run, such as a timestamp?",
      answer:
        "Remove its lines from both sides with an inverted search: `diff <(gronify --no-color search --sort -v old.json generatedAt) <(gronify --no-color search --sort -v new.json generatedAt)`. `-v` drops every line that contains the term, so choose a term that appears only in the path you want to skip.",
    },
    {
      question: "Can I get a JSON Patch out of this?",
      answer:
        "No. The result is a line diff for people to read. The README of [jd](https://github.com/josephburnett/jd) documents `-f patch` for RFC 6902 JSON Patch, `-f merge` for RFC 7386 merge patches, and `-p` to apply a patch.",
    },
  ],
  related: ["flatten-json", "large-json-files", "grep-json"],
};
