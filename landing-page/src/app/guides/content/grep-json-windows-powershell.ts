import { transcript, type Guide } from "../types";

// Every transcript below (drawn with a PS> prompt) is pasted from PowerShell 7.4.2 running in
// the mcr.microsoft.com/powershell Linux container (linux/amd64) with Node
// v22.23.5 and gronify 1.3.1. No Windows machine was available, so cmd.exe and
// Windows PowerShell 5.1 are described from Microsoft's documentation and are
// not shown as transcripts. orders.json is the payload from the grep-json
// guide; orders.pretty.json is the same file passed through `jq .`.
// api.github.com.json is github/rest-api-description at commit
// bbd57e64767616df3b37792a1186166334043761.
export const grepJsonWindowsPowershell: Guide = {
  slug: "grep-json-windows-powershell",
  title: "Grep JSON on Windows in PowerShell, without grep or WSL",
  description:
    "Select-String prints whole lines and ConvertFrom-Json needs a query per question. Search nested JSON on Windows by path with gronify search, no grep or WSL.",
  h1: "Search nested JSON in PowerShell and cmd without grep",
  lede: 'Windows has no grep, and the closest built-ins each miss half the job: `Select-String` matches lines without knowing where they sit in the JSON, and `ConvertFrom-Json` loads the document so you can navigate it once you know the path. `gronify search orders.json pending` prints every match with its full path, such as `json.orders[2].status = "pending"`, and runs the same way in PowerShell, cmd, and a Unix shell.',
  published: "2026-11-20",
  updated: "2026-11-20",
  sections: [
    {
      id: "select-string",
      heading: "Select-String has the same problem as grep",
      blocks: [
        {
          kind: "paragraph",
          text: "`Select-String` is PowerShell's line search. Like grep, it works one line at a time, and a minified JSON file is one line. The examples use the small orders payload from [how to grep JSON](/guides/grep-json), saved as `orders.json`:",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "Select-String on minified JSON returns the whole document",
          lines: transcript`
$ Select-String pending orders.json
orders.json:1:{"service":{"name":"checkout","status":"degraded"},"orders":[{"id":1001,"status":"shipped","customer":{"email":"ada@example.com"}},{"id":1002,"status":"Pending","customer":{"email":"grace@example.com"}},{"id":1003,"status":"pending","customer":{"email":"alan@example.org"},"error":{"code":"CARD_DECLINED"}}]}
`,
        },
        {
          kind: "paragraph",
          text: "On a pretty-printed copy each key gets its own line, and the match loses its parents. Line 23 says some `status` is `pending`; it does not say which order:",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label:
            "Select-String on pretty-printed JSON returns keys without paths",
          lines: transcript`
$ Select-String pending orders.pretty.json
orders.pretty.json:16:      "status": "Pending",
orders.pretty.json:23:      "status": "pending",
`,
        },
        {
          kind: "paragraph",
          text: "Unlike grep, `Select-String` ignores case by default, so it found `Pending` too. `-CaseSensitive` turns that off, and `-Context` prints neighbouring lines, which helps only when the parent key happens to be a few lines up. `findstr` in cmd has the same one-line view and a smaller regex syntax: it has no `|` alternation.",
        },
      ],
    },
    {
      id: "convertfrom-json",
      heading: "ConvertFrom-Json answers questions you already know how to ask",
      blocks: [
        {
          kind: "paragraph",
          text: "`ConvertFrom-Json` parses the text into PowerShell objects. Once you know the shape, that is the PowerShell equivalent of jq: filter with `Where-Object` and read a field by its path.",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "Filtering and navigating JSON with ConvertFrom-Json",
          lines: transcript`
$ $doc = Get-Content orders.json -Raw | ConvertFrom-Json
$ $doc.orders | Where-Object status -eq 'pending' | Select-Object id, status
id     : 1002
status : Pending
id     : 1003
status : pending
$ $doc.orders | Where-Object status -ceq 'pending' | Select-Object id, status
id     : 1003
status : pending
$ $doc.orders[2].error.code
CARD_DECLINED
`,
        },
        {
          kind: "paragraph",
          text: "`-eq` compares strings without case in PowerShell; `-ceq` is the exact match. The catch is the first step: to write `$doc.orders[2].error.code` you must already know that `error.code` lives under `orders`. For a file you have not seen, PowerShell has no built-in that lists every path. Three more things trip people up:",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            '`ConvertTo-Json` stops at depth 2 by default. PowerShell 7.4 prints a warning and turns deeper objects into strings such as `"@{email=ada@example.com}"`. Pass `-Depth 10` or higher when you write JSON back out.',
            "Keys that differ only in case, such as `Id` and `id`, are legal JSON, but `ConvertFrom-Json` refuses them. `-AsHashtable` reads them, and [Microsoft's documentation](https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/convertfrom-json) lists it as added in PowerShell 6.0, so Windows PowerShell 5.1 does not have it.",
            "The whole file is read into one string and then into objects, so memory grows with the file.",
          ],
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "ConvertTo-Json truncation and the case-insensitive key error",
          lines: transcript`
$ $doc | ConvertTo-Json
WARNING: Resulting JSON is truncated as serialization has exceeded the set depth of 2.
{
  "service": {
    "name": "checkout",
    "status": "degraded"
  },
  "orders": [
    {
      "id": 1001,
      "status": "shipped",
      "customer": "@{email=ada@example.com}"
    },
    {
      "id": 1002,
      "status": "Pending",
      "customer": "@{email=grace@example.com}"
    },
    {
      "id": 1003,
      "status": "pending",
      "customer": "@{email=alan@example.org}",
      "error": "@{code=CARD_DECLINED}"
    }
  ]
}
$ Get-Content keys.json
{"Id":"A-17","id":17,"total":12345678901234567890,"price":1.10}
$ Get-Content keys.json -Raw | ConvertFrom-Json
ConvertFrom-Json: Cannot convert the JSON string because it contains keys with different casing. Please use the -AsHashTable switch instead. The key that was attempted to be added to the existing key 'Id' was 'id'.
$ (Get-Content keys.json -Raw | ConvertFrom-Json -AsHashtable).Keys
Id
id
total
price
`,
        },
        { kind: "subheading", text: "A path walker in plain PowerShell" },
        {
          kind: "paragraph",
          text: "If you cannot install anything, a short recursive function prints each value with its path, and `Select-String` can filter that. It needs PowerShell 6 or newer for `-AsHashtable`, loads the whole file, and prints strings without their quotes:",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "A recursive PowerShell function that prints JSON paths",
          lines: transcript`
$ function Get-JsonPath($Node, $Path = 'json') {
>>   if ($Node -is [System.Collections.IDictionary]) {
>>     foreach ($key in $Node.Keys) { Get-JsonPath $Node[$key] "$Path.$key" }
>>   } elseif ($Node -is [System.Collections.IList]) {
>>     for ($i = 0; $i -lt $Node.Count; $i++) { Get-JsonPath $Node[$i] "$Path[$i]" }
>>   } else {
>>     "$Path = $Node"
>>   }
>> }
$ Get-JsonPath (Get-Content orders.json -Raw | ConvertFrom-Json -AsHashtable) | Select-String pending
json.orders[1].status = Pending
json.orders[2].status = pending
`,
        },
      ],
    },
    {
      id: "gronify-search",
      heading: "Search JSON by path with gronify search",
      blocks: [
        {
          kind: "paragraph",
          text: "Gronify does the walk and the filter in one streaming pass and keeps JSON types in the output, so strings stay quoted. It is an npm package: on Windows, install [Node.js](https://nodejs.org/) 20 or newer, then run `npm install -g gronify`. It needs neither grep, WSL, nor Git Bash.",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label:
            "gronify search in PowerShell: text, case-sensitive, and regex",
          lines: transcript`
$ gronify search orders.json pending
json.orders[1].status = "Pending"
json.orders[2].status = "pending"
$ gronify search orders.json -c pending
json.orders[2].status = "pending"
$ gronify search orders.json --regex 'orders\[[0-9]+\]\.customer\.email'
json.orders[0].customer.email = "ada@example.com"
json.orders[1].customer.email = "grace@example.com"
json.orders[2].customer.email = "alan@example.org"
`,
        },
        {
          kind: "paragraph",
          text: "Like `Select-String`, a search ignores case unless you ask otherwise. In Gronify that switch is `-c` (long form `--case-sensitive`). `--regex` takes a JavaScript regular expression, which is close to the .NET syntax `Select-String` uses for anchors, classes, groups, and `|`.",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "Counting, capping, and checking the exit code in PowerShell",
          lines: transcript`
$ gronify search orders.json --count status
4
$ gronify search orders.json -m 2 status
json.service.status = "degraded"
json.orders[0].status = "shipped"
Stopped after 2 matches (--max-count); there may be more
$ gronify search --exit-status orders.json refunded; $LASTEXITCODE
Warning: No matches found for 'refunded'
Tip: Search is a case-insensitive substring match; use --regex for patterns
1
`,
        },
        {
          kind: "paragraph",
          text: "`--count` prints the number of matching lines. `-m 2` stops reading the file after two matches. With `--exit-status`, `$LASTEXITCODE` is 0 when something matched, 1 when nothing did, and 2 on an error, so `if ($LASTEXITCODE -eq 1)` works in a script. The warning and the `Stopped after` notice go to stderr, so they stay out of a redirected file. The flags are explained in full in [how to grep JSON](/guides/grep-json).",
        },
      ],
    },
    {
      id: "quoting",
      heading: "Quoting search terms in PowerShell and cmd",
      blocks: [
        {
          kind: "paragraph",
          text: 'Most failed searches on Windows are quoting problems, not JSON problems. PowerShell expands `$name` inside double quotes, and OpenAPI files are full of `$ref` keys. Here PowerShell replaced `"$ref"` with the value of the unset variable `$ref`, an empty string. Gronify received an empty term, so it treated the run as a search of standard input, and nothing was piped in:',
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label:
            "Double quotes let PowerShell expand $ref before gronify sees it",
          lines: transcript`
$ gronify search orders.json "$ref" --count
Error: No input file provided and no data piped to stdin
Usage: gronify search <file> <term> OR cat file.json | gronify search <term>
`,
        },
        {
          kind: "paragraph",
          text: "Single quotes pass the text through unchanged, `$` and double quotes included. This finds where the GitHub REST API description refers to its `simple-user` schema:",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "Single-quoted search term with $ref and double quotes",
          lines: transcript`
$ gronify search api.github.com.json -m 2 '$ref = "#/components/schemas/simple-user"'
json.paths["/orgs/{org}/blocks"].get.responses["200"].content["application/json"].schema.items.$ref = "#/components/schemas/simple-user"
json.paths["/orgs/{org}/members"].get.responses["200"].content["application/json"].schema.items.$ref = "#/components/schemas/simple-user"
Stopped after 2 matches (--max-count); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "Rules that hold in both shells:",
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "In PowerShell, put every regex in single quotes. To include a single quote, double it: `'it''s'`.",
            "cmd does not treat single quotes as quotes, so use double quotes there. Outside quotes cmd reads `^` as its escape character and `|`, `<`, and `>` as operators, so an unquoted `^json` reaches Gronify as `json`.",
            "Double quotes inside a double-quoted argument are escaped differently by each shell. You can often avoid them: `.` matches the quote character in a regex, so `--regex 'status = .pending.'` matches `status = \"pending\"` in any shell.",
          ],
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label:
            "A regex that matches a quoted value without typing the quotes",
          lines: transcript`
$ gronify search orders.json --regex 'status = .pending.' -c
json.orders[2].status = "pending"
`,
        },
      ],
    },
    {
      id: "pipelines",
      heading: "Pipelines, Get-Content, and output files",
      blocks: [
        {
          kind: "paragraph",
          text: "Gronify reads standard input when you leave out the file name, so a PowerShell pipeline can feed it. The output is plain text lines, so `Select-String` can filter `gronify flatten` the way grep does on Linux:",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label:
            "Piping JSON into gronify and gronify output into Select-String",
          lines: transcript`
$ Get-Content orders.json -Raw | gronify search -m 1 email
json.orders[0].customer.email = "ada@example.com"
Stopped after 1 match (--max-count); there may be more
$ gronify flatten orders.json | Select-String customer
json.orders[0].customer = {}
json.orders[0].customer.email = "ada@example.com"
json.orders[1].customer = {}
json.orders[1].customer.email = "grace@example.com"
json.orders[2].customer = {}
json.orders[2].customer.email = "alan@example.org"
`,
        },
        {
          kind: "paragraph",
          text: "For a large file, pass the path instead of piping `Get-Content`: Gronify then streams the file itself, while `Get-Content -Raw` builds the whole file as one string first. To save results, use `-o` rather than `>`. It writes the file only after the run succeeds, and the bytes are exactly what Gronify produced, whatever encoding the shell's `>` would pick:",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "Writing search results to a file with -o",
          lines: transcript`
$ gronify search orders.json CARD_DECLINED -o declined.txt; Get-Content declined.txt
Output written to declined.txt
json.orders[2].error.code = "CARD_DECLINED"
`,
        },
        {
          kind: "paragraph",
          text: "To get JSON back, pipe lines into [`gronify unflatten`](/guides/unflatten-json). `-v` drops what you do not want and keeps the parent lines that `unflatten` needs:",
        },
        {
          kind: "terminal",
          prompt: "PS>",
          label: "Removing a subtree and rebuilding JSON in PowerShell",
          lines: transcript`
$ gronify search orders.json -v orders | gronify unflatten
{"service":{"name":"checkout","status":"degraded"}}
`,
        },
      ],
    },
    {
      id: "which-tool",
      heading: "Which tool to use on Windows",
      blocks: [
        {
          kind: "table",
          caption: "Searching JSON on Windows: built-ins and Gronify",
          columns: ["Job", "Tool", "Why"],
          rows: [
            [
              "Find where a key or value lives in an unfamiliar file",
              "`gronify search`",
              "Each match prints with its full path",
            ],
            [
              "Read or filter a field whose path you know",
              "`ConvertFrom-Json` with `Where-Object`",
              "Built in, and returns objects you can script with",
            ],
            [
              "Check whether a string occurs anywhere",
              "`Select-String` or `findstr`",
              "No JSON parsing is needed",
            ],
            [
              "Search a file too large to load",
              "`gronify search` with the file path",
              "It reads the file as a stream",
            ],
            [
              "Reshape JSON or compute over it",
              "jq, or `ConvertFrom-Json`",
              "Gronify only flattens, filters, and rebuilds",
            ],
          ],
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Is there a grep for JSON on Windows?",
      answer:
        "`Select-String` and `findstr` are the built-in line searches, and neither knows JSON structure. `npm install -g gronify` adds `gronify search`, which prints each match with its JSON path. Gronify's CI runs the test suite on Windows, Linux, and macOS; the transcripts on this page come from PowerShell 7.4 on Linux.",
    },
    {
      question:
        "PowerShell says gronify.ps1 cannot be loaded because running scripts is disabled",
      answer:
        "npm installs a small `.ps1` launcher next to `gronify.cmd`, and PowerShell's execution policy can block it. Run `gronify.cmd` instead, or allow local scripts for your account with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. See [about Execution Policies](https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_execution_policies) before you change the policy.",
    },
    {
      question: "Does gronify work in cmd.exe?",
      answer:
        "The commands are the same. Quote the search term with double quotes, since cmd does not treat single quotes as quotes and reads `^`, `|`, `<`, and `>` outside quotes as its own syntax.",
    },
    {
      question:
        "Why does ConvertTo-Json print @{...} instead of nested objects?",
      answer:
        "Its default `-Depth` is 2, and anything deeper is converted to a string. Pass `-Depth` with a number at least as deep as your document, for example `ConvertTo-Json -Depth 20`.",
    },
  ],
  related: ["grep-json", "find-json-path", "search-openapi-and-lockfiles"],
};
