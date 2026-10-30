---
name: gronify-json-flatten-search
description: Flattens, searches, and diffs JSON as greppable key-value path lines using the Gronify CLI (gron and ungron workflow), with result caps and exact numbers. Use when an AI agent needs to explore a large or unknown JSON file without flooding its context, grep nested JSON, inspect API payloads, diff two JSON documents as key-sorted lines, check whether a path or value exists, or replace jq with path-based queries.
---

# Gronify

Gronify turns nested JSON into one assignment per path (`json.users[0].name = "Ann"`), searches those paths, and converts gron assignments back to JSON. `flatten` and `search` stream, so multi-gigabyte files work.

## Check availability

Run `command -v gronify` before using the CLI. If it is missing and the user wants it installed:

```bash
npm install -g gronify        # or: npx gronify ...
brew install 1solomonwakhungu/tap/gronify
```

Gronify needs Node.js 20 or newer. To build from a checkout instead: `cd src/packages/cli && npm ci && npm run build && npm link`.

## Explore without flooding your context

Use `--no-color` in every captured command. For any file you have not seen, or that may be large, go from cheap to specific:

```bash
gronify --no-color search payload.json error --count      # 1. how many matches? prints one number
gronify --no-color search payload.json error -m 20        # 2. the first 20 matches only
gronify --no-color flatten --limit 50 payload.json        # 3. the first 50 lines to learn the shape
gronify --no-color search payload.json --regex 'users\[[0-9]+\]\.email' -m 20   # 4. narrow, still capped
```

- `-m/--max-count <n>` (search) and `--limit <n>` (flatten) stop after `n` lines, stop reading the input, and exit 0. A 5 GB file returns in milliseconds if the cap is hit early. `n` must be a positive integer.
- When a cap ended the run, stderr says so (`Stopped after 20 matches (--max-count); there may be more`) and stdout holds only gron lines. If you need more, raise `n` or narrow the term. Do not rerun without a cap on an unknown file.
- Everything after the cap is never read, so a syntax error there is not reported.
- Prefer a file path or a pipe over loading the JSON into your own context. Do not `cat` a large JSON file.

## Commands

- `gronify flatten [file]`: every value with its full path. Reads stdin when no file is given.
- `gronify search [file] <term>`: path or value filtering, no separate `grep` needed. Plain terms are case-insensitive and literal. Options: `--regex`, `--case-sensitive`, `--count`, `-v/--invert-match`, `-m/--max-count`, `--sort`, `--exit-status`. Quote shell-sensitive patterns.
- `gronify unflatten [file]`: gron assignments back to JSON; the root and parent containers must appear before their children.

```bash
curl -sS https://example.com/api/status | gronify --no-color search version -m 5
```

## Order and diffing

**Default output is document order**, not sorted: keys appear as they do in the input. To compare two documents or get a stable order, add `--sort`, which sorts object keys at every level (UTF-16 order, as `gron` and JS `sort()` do) and leaves array order alone:

```bash
diff <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json)
```

- `--sort` works on `flatten` and `search` (it filters first, then sorts). It is ignored with `--count`.
- A top-level array is sorted record by record as it streams. A large object at the root is buffered until it closes, using up to 64 MiB of memory and then a temp file in `$TMPDIR`, so budget disk and time (about 4x slower than unsorted) on multi-gigabyte objects.
- Caps apply to the sorted order, so with `--sort` a root object is read to the end before its first line is printed.

## Check the exit status

- Default: exit 0 for success, including a search with no matches (a message goes to stderr), and exit 1 for an error (invalid JSON, missing file, bad option).
- For yes/no questions add `--exit-status`: `0` = something matched, `1` = nothing matched, `2` = error. Use it instead of parsing output:

```bash
if gronify --no-color search --exit-status config.json -m 1 'debug = true' > /dev/null; then echo on; fi
```

- A cap reached counts as a match. `--count --exit-status` prints the count and exits 1 when it is `0`.
- On stdout, output is written while the input is still being read, so for invalid input (a truncated file is only noticed at the end) most of the lines may already be printed. Always check the exit status, use `set -o pipefail` when piping into another command, and never treat output as complete when the status is not 0.
- `-o <file>` is atomic: the file is replaced only after the run succeeded, a failed run leaves an existing file untouched, and a capped run commits exactly the lines that were printed. Prefer `-o` when a later step reads the result.

## Exact values

Gronify prints numbers exactly as written in the source: `12345678901234567890`, `1.10`, `1e2`, and `-0` survive unchanged. `jq` parses numbers as doubles, so depending on its version an integer above 2^53 (a 64-bit ID, a nanosecond timestamp) can come back rounded and `1.10` as `1.1`. Search for the original digits and trust the printed ones.

Input must be strict JSON (no comments or trailing commas). Duplicate keys produce one line per occurrence. A syntax error exits non-zero and reports the byte offset, line, and column.

## Reconstruct JSON

```bash
gronify --no-color unflatten payload.gron
gronify --no-color flatten payload.json | gronify --no-color unflatten
```

`unflatten` still reads its whole input into memory.

Do not overwrite the source JSON during exploration. Write reconstructed JSON to a new file first, parse it, and compare it with the source before replacing anything:

```bash
gronify --no-color unflatten edited.gron > reconstructed.json
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' reconstructed.json
```

Gronify accepts JSON, not arbitrary JavaScript objects or comments. If parsing fails, report the failing input and error rather than silently rewriting the data.
