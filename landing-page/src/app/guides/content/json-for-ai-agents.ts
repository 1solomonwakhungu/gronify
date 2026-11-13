import { transcript, type Guide } from "../types";

// Every transcript below is pasted from gronify 1.3.1 (plus wc, head, diff,
// cat, and jq 1.8.2) run on macOS against events.json: one minified document
// holding a header object and 4,000 generated request events. The skill
// install was run with skills 1.8.1 in an empty project directory.
export const jsonForAiAgents: Guide = {
  slug: "json-for-ai-agents",
  title: "A JSON search tool for Claude Code and AI coding agents",
  description:
    "Keep a coding agent from reading a huge JSON file whole. Gronify shows the shape, counts matches, and prints a capped sample. Agent skill install included.",
  h1: "Let a coding agent search large JSON without reading it all",
  lede: "A coding agent that opens a large JSON file whole fills its context window with records it never needed. Have it run `gronify search events.json error --count` and then `gronify search events.json error -m 5` instead: the first prints one number, and the second prints five `path = value` lines and stops reading the file.",
  published: "2026-11-12",
  updated: "2026-11-12",
  sections: [
    {
      id: "why-not-read-whole",
      heading: "Why an agent should not read a large JSON file whole",
      blocks: [
        {
          kind: "paragraph",
          text: "A context window is a fixed budget, and a file read spends it whether or not the content answers the question. Exports and API responses are usually minified, so the whole document is one line. The sample file on this page, `events.json`, is a gateway export of 4,000 request events:",
        },
        {
          kind: "terminal",
          label:
            "Size of the sample export in bytes, lines, and flattened lines",
          lines: transcript`
$ wc -c events.json
  899858 events.json
$ wc -l events.json
       1 events.json
$ head -n 20 events.json | wc -c
  899858
$ gronify --no-color flatten events.json | wc -l
   44679
$ gronify --no-color flatten events.json | wc -c
 1806856
`,
        },
        {
          kind: "paragraph",
          text: "That is 899,858 bytes on a single line, so `head -n 20` prints the entire file and a read tool that pages by line number returns all of it. Flattening everything does not help: each line repeats its path, and the 44,679 lines come to 1,806,856 bytes, twice the source. The cap is what keeps output small.",
        },
        {
          kind: "paragraph",
          text: "Most of the file is also irrelevant to any one task. The question used below concerns 4 of the 4,000 events.",
        },
      ],
    },
    {
      id: "narrowing-loop",
      heading: "The narrowing loop: shape, count, sample, exact paths",
      blocks: [
        {
          kind: "paragraph",
          text: "Say the agent is asked which requests in that export failed with `PAYMENT_PROVIDER_DOWN`. Five steps answer it. Each prints a small, known amount and tells the agent what to ask next.",
        },
        { kind: "subheading", text: "Shape first" },
        {
          kind: "paragraph",
          text: "`flatten --limit 18` prints the first 18 path lines and stops. That shows the header object, the name of the array, and every field of one record.",
        },
        {
          kind: "terminal",
          label: "The first 18 flattened lines of the export",
          lines: transcript`
$ gronify --no-color flatten --limit 18 events.json
json = {}
json.export = {}
json.export.source = "api-gateway"
json.export.generated_at = "2026-11-10T06:00:00.000Z"
json.export.window_hours = 24
json.export.event_count = 4000
json.events = []
json.events[0] = {}
json.events[0].id = "evt_000001"
json.events[0].ts = "2026-11-09T06:00:00.313Z"
json.events[0].service = "search"
json.events[0].region = "ap-southeast-2"
json.events[0].request = {}
json.events[0].request.method = "GET"
json.events[0].request.path = "/v1/search"
json.events[0].request.trace_id = "b32ed95cc7f620548d05aa2110b500c5"
json.events[0].status = 200
json.events[0].duration_ms = 30
Stopped after 18 lines (--limit); there may be more
`,
        },
        { kind: "subheading", text: "Then volume" },
        {
          kind: "paragraph",
          text: "The first record succeeded, so the shape does not show where failures are recorded. `--count` prints one number, which tells the agent whether a term is safe to print.",
        },
        {
          kind: "terminal",
          label: "Counting matches for a broad term and a specific one",
          lines: transcript`
$ gronify --no-color search events.json --count error
672
$ gronify --no-color search events.json --count PAYMENT_PROVIDER_DOWN
4
`,
        },
        {
          kind: "paragraph",
          text: "672 lines mention `error`, which is too many to print. The code from the question appears 4 times.",
        },
        { kind: "subheading", text: "Then a sample" },
        {
          kind: "paragraph",
          text: "`-m 4` prints the first four matches in document order. Here they are one complete error object, so the agent learns its fields without seeing the other 668 lines.",
        },
        {
          kind: "terminal",
          label: "A four-line sample of the broad search",
          lines: transcript`
$ gronify --no-color search events.json -m 4 error
json.events[33].error = {}
json.events[33].error.code = "RATE_LIMITED"
json.events[33].error.message = "too many requests for this API key"
json.events[33].error.retryable = true
Stopped after 4 matches (--max-count); there may be more
`,
        },
        { kind: "subheading", text: "Then the exact paths" },
        {
          kind: "paragraph",
          text: "With a count of 4, the specific term can be printed in full, and each line carries the array index of a failing event. The guide to [finding a JSON path](/guides/find-json-path) goes deeper on this step.",
        },
        {
          kind: "terminal",
          label: "The four paths that hold the error code from the question",
          lines: transcript`
$ gronify --no-color search events.json PAYMENT_PROVIDER_DOWN
json.events[611].error.code = "PAYMENT_PROVIDER_DOWN"
json.events[1874].error.code = "PAYMENT_PROVIDER_DOWN"
json.events[1875].error.code = "PAYMENT_PROVIDER_DOWN"
json.events[3302].error.code = "PAYMENT_PROVIDER_DOWN"
`,
        },
        { kind: "subheading", text: "Then only the values" },
        {
          kind: "paragraph",
          text: "A regex on the path side reads three fields from those four records. Patterns are JavaScript regular expressions, and the guide on [how to grep JSON](/guides/grep-json) explains the matching rules.",
        },
        {
          kind: "terminal",
          label: "Reading three fields from the four matching records",
          lines: transcript`
$ gronify --no-color search events.json --regex 'events\[(611|1874|1875|3302)\]\.(ts|region|duration_ms) '
json.events[611].ts = "2026-11-09T09:39:58.460Z"
json.events[611].region = "eu-west-1"
json.events[611].duration_ms = 10294
json.events[1874].ts = "2026-11-09T17:14:39.152Z"
json.events[1874].region = "us-east-1"
json.events[1874].duration_ms = 10069
json.events[1875].ts = "2026-11-09T17:15:00.071Z"
json.events[1875].region = "eu-west-1"
json.events[1875].duration_ms = 10094
json.events[3302].ts = "2026-11-10T01:48:43.457Z"
json.events[3302].region = "ap-southeast-2"
json.events[3302].duration_ms = 10370
`,
        },
        {
          kind: "paragraph",
          text: "The six commands above printed 42 lines, 1,630 bytes in total with the stderr notices included, from a file of 899,858 bytes.",
        },
        { kind: "subheading", text: "What a cap does to the read" },
        {
          kind: "paragraph",
          text: "`-m` and `--limit` stop reading the input at the cap, so the cost of a capped command follows how far into the file its last line sits. The `Stopped after` notice goes to stderr, and stdout holds only path lines:",
        },
        {
          kind: "terminal",
          label: "The cap notice is absent from stdout",
          lines: transcript`
$ gronify --no-color search events.json -m 4 error 2>/dev/null | wc -l
       4
`,
        },
        {
          kind: "paragraph",
          text: "Input after the cap is never parsed, so it is never validated. On a copy of the export cut off at 450,000 bytes, the capped search exits 0 and the count, which has to read to the end, fails:",
        },
        {
          kind: "terminal",
          label:
            "A capped search succeeds on a truncated file and a full read fails",
          lines: transcript`
$ head -c 450000 events.json > truncated.json
$ gronify --no-color search truncated.json -m 2 error.code; echo $?
json.events[33].error.code = "RATE_LIMITED"
json.events[64].error.code = "VALIDATION_FAILED"
Stopped after 2 matches (--max-count); there may be more
0
$ gronify --no-color search truncated.json --count error.code; echo $?
Error: searching JSON: Unterminated string at byte offset 449976 (line 1, column 449977)
1
`,
        },
        {
          kind: "paragraph",
          text: "A capped result is a sample from a file the agent has not finished checking. The guide to [searching large JSON files](/guides/large-json-files) covers the streaming read on multi-gigabyte inputs.",
        },
      ],
    },
    {
      id: "flags-for-agents",
      heading: "Flags that keep output safe for a model to read",
      blocks: [
        { kind: "subheading", text: "Plain text with --no-color" },
        {
          kind: "paragraph",
          text: "Gronify colors output only when stdin and stdout are both terminals and `NO_COLOR` is unset, so output captured through a pipe is already plain. Some agent harnesses run commands in a pseudo-terminal, and under one the line for `json.events[611]` began `^[[34mjson^[[39m^[[90m.^[[39m^[[36mevents^[[39m` in `cat -v`. `--no-color` removes the escape codes in every case.",
        },
        { kind: "subheading", text: "Stable order with --sort" },
        {
          kind: "paragraph",
          text: "Default output follows the key order of the document. `--sort` orders the keys of every object, so the same data always prints the same lines and two runs can be compared with the system `diff`:",
        },
        {
          kind: "terminal",
          label: "Two files with the same data in a different key order",
          lines: transcript`
$ cat a.json
{"name":"api","port":8080,"flags":{"debug":false,"trace":true}}
$ cat b.json
{"flags":{"trace":true,"debug":false},"port":8080,"name":"api"}
$ diff <(gronify --no-color flatten --sort a.json) <(gronify --no-color flatten --sort b.json) && echo same
same
`,
        },
        {
          kind: "paragraph",
          text: "Leave `--sort` off exploratory commands when the root of the document is an object, as in the export above. Sorted output cannot start until that object closes, so a cap no longer ends the read early.",
        },
        { kind: "subheading", text: "Branching with --exit-status" },
        {
          kind: "paragraph",
          text: "A yes-or-no question needs no output at all. With `--exit-status`, the exit code is 0 for a match, 1 for no match, and 2 for an error such as invalid JSON:",
        },
        {
          kind: "terminal",
          label: "Exit codes for a match, no match, and a broken file",
          lines: transcript`
$ gronify --no-color search --exit-status events.json -m 1 PAYMENT_PROVIDER_DOWN > /dev/null 2>&1; echo $?
0
$ gronify --no-color search --exit-status events.json -m 1 DISK_FULL > /dev/null 2>&1; echo $?
1
$ gronify --no-color search --exit-status truncated.json DISK_FULL > /dev/null 2>&1; echo $?
2
`,
        },
        { kind: "subheading", text: "Atomic files with -o" },
        {
          kind: "paragraph",
          text: "`-o` saves a result for a later step and replaces the file only after the run succeeds. Below, the second run fails partway through its input and the 56 lines from the first run stay in place:",
        },
        {
          kind: "terminal",
          label: "A failed run leaves the earlier output file untouched",
          lines: transcript`
$ gronify --no-color -o payment.gron search events.json --regex 'events\[(611|1874|1875|3302)\]\.'
Output written to payment.gron
$ wc -l payment.gron
      56 payment.gron
$ gronify --no-color -o payment.gron search truncated.json --regex 'events\[(611|1874|1875|3302)\]\.'; echo $?
Error: searching JSON (invalid regex or JSON): Unterminated string at byte offset 449976 (line 1, column 449977)
1
$ wc -l payment.gron
      56 payment.gron
`,
        },
      ],
    },
    {
      id: "install-skill",
      heading: "Install the Gronify agent skill",
      blocks: [
        {
          kind: "paragraph",
          text: "The repository ships a skill named `gronify-json-flatten-search` that teaches an agent this routine. Install it with the open [skills CLI](https://github.com/vercel-labs/skills):",
        },
        {
          kind: "terminal",
          label: "Installing the Gronify skill with the skills CLI",
          lines: transcript`
$ npx skills add https://github.com/1solomonwakhungu/gronify --skill gronify-json-flatten-search
`,
        },
        {
          kind: "paragraph",
          text: "With skills 1.8.1, that command wrote `.agents/skills/gronify-json-flatten-search/SKILL.md` into the project and linked it under `.claude/skills/`. The CLI's help lists `-a` to choose agents (its examples use `claude-code` and `cursor`), `-g` to install at user level, and `--list` to preview a repository without installing. The skill has a page on [skills.sh](https://skills.sh/1solomonwakhungu/gronify/gronify-json-flatten-search).",
        },
        {
          kind: "paragraph",
          text: "The skill is one Markdown file. It tells the agent to:",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "Run `command -v gronify` and check the version first: the caps, `--sort`, and `--exit-status` need 1.2.0 or newer.",
            "Pass `--no-color` in every captured command.",
            "Go from cheap to specific on an unfamiliar file: `--count`, then `-m 20`, then `flatten --limit 50`, then a narrower regex that still has a cap.",
            "Never `cat` a large JSON file or rerun without a cap on an unknown one.",
            "Check the exit status, and never treat output as complete when it is not 0.",
          ],
        },
        {
          kind: "paragraph",
          text: "The skill lists the count before the shape, the reverse of the loop above. Count first when the agent already has a search term, and look at the shape first when it does not. The skill does not install the CLI. That comes from npm or Homebrew, as the [install section](/#install) shows.",
        },
      ],
    },
    {
      id: "project-instructions",
      heading: "Instructions to paste into CLAUDE.md or AGENTS.md",
      blocks: [
        {
          kind: "paragraph",
          text: "An agent without the skill can follow the same routine from its project instructions file: `CLAUDE.md` for Claude Code, `AGENTS.md` for Codex CLI and other agents that read it. These lines agree with the skill:",
        },
        {
          kind: "terminal",
          label: "A project instructions block for JSON files",
          lines: transcript`
$ cat AGENTS.md
## JSON files
- Check the size before opening any .json file: wc -c <file>
- Under 50 KB, read the file normally.
- Over 50 KB, never cat it or open it with a file-read tool. Use gronify, always with --no-color.
- Learn the shape first: gronify --no-color flatten --limit 50 <file>
- Count before printing: gronify --no-color search <file> <term> --count
- Print a capped sample: gronify --no-color search <file> <term> -m 20
- Narrow with --regex on the path. Drop the cap only after --count shows the result is small.
- "Stopped after" on stderr means more lines may exist. A non-zero exit means the output is incomplete.
- If command -v gronify prints nothing, ask before running: npm install -g gronify
`,
        },
        {
          kind: "paragraph",
          text: "The 50 KB threshold is a guess to start from. Lower it for a model with a small context window, and raise it if most JSON in the repository is small config.",
        },
      ],
    },
    {
      id: "when-to-use-something-else",
      heading: "When the agent should use something else",
      blocks: [
        {
          kind: "paragraph",
          text: "A small file should be read directly. A config of a few hundred bytes costs less to read than the commands that would explore it.",
        },
        {
          kind: "paragraph",
          text: "Once the shape is known and the task is a transformation or an aggregate, [jq](https://jqlang.org/manual/) is the better tool. Gronify has no query language, so it cannot group, sum, or join. One jq program counts every error code in the export:",
        },
        {
          kind: "terminal",
          label: "jq 1.8.2 counting events by error code",
          lines: transcript`
$ jq -r '.events[].error.code // empty' events.json | sort | uniq -c
  40 NOT_FOUND
   4 PAYMENT_PROVIDER_DOWN
  50 RATE_LIMITED
  43 UPSTREAM_TIMEOUT
  31 VALIDATION_FAILED
`,
        },
        {
          kind: "paragraph",
          text: "JSON Lines logs need another tool too. Gronify reads one JSON document per run, so a log with one object per line fails at line 2. jq reads a stream of values, and line tools such as [ripgrep](https://github.com/BurntSushi/ripgrep) work because each line is one record:",
        },
        {
          kind: "terminal",
          label: "Gronify rejects a JSON Lines log that jq 1.8.2 filters",
          lines: transcript`
$ cat app.jsonl
{"level":"info","msg":"started"}
{"level":"error","msg":"db timeout"}
{"level":"info","msg":"stopped"}
$ gronify --no-color search app.jsonl error; echo $?
Error: searching JSON: Unexpected '{' after the top-level value at byte offset 33 (line 2, column 1)
1
$ jq -c 'select(.level == "error")' app.jsonl
{"level":"error","msg":"db timeout"}
`,
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Does Gronify have an MCP server?",
      answer:
        "No. Gronify is a command-line program that an agent runs through its shell tool, the same way it runs `git`. The skill is a Markdown file of instructions, so there is no server to configure.",
    },
    {
      question: "What does the skill put on my machine?",
      answer:
        "One `SKILL.md` file with no scripts. A project install with skills 1.8.1 put it in `.agents/skills/gronify-json-flatten-search/` and also wrote `skills-lock.json`. The skill tells the agent to install the Gronify CLI only when it is missing and you want it.",
    },
    {
      question: "Does the agent need jq or grep installed too?",
      answer:
        "Not for searching. `gronify search` does its own matching, so it needs only Node.js 20 or newer, and `npx gronify` runs it without a global install.",
    },
    {
      question: "Why does the agent get the error unknown option '-m'?",
      answer:
        "The installed Gronify is older than 1.2.0, which `-m`, `--limit`, `--sort`, and `--exit-status` all need. Version 1.1.0 exits 1 with `error: unknown option '-m'`. Update with `npm install -g gronify@latest`.",
    },
  ],
  related: ["large-json-files", "grep-json", "find-json-path"],
};
