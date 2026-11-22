---
name: gronify-json-flatten-search
description: Flattens and searches nested JSON as path = value lines using the Gronify CLI (flatten, search, unflatten, --exit-status, piped curl JSON). Use as the general Gronify CLI reference or for quick single-file JSON grep and shell branching.
license: MIT
compatibility: Requires Node.js 20+ and the gronify CLI (npm install -g gronify, brew install 1solomonwakhungu/tap/gronify, or npx gronify).
metadata:
  author: 1solomonwakhungu
  homepage: https://gronify.vercel.app
  repository: https://github.com/1solomonwakhungu/gronify
---

# Gronify: Flatten, Search, and Unflatten JSON

Gronify turns nested JSON into one assignment per path (`json.users[0].name = "Ann"`), searches those lines in one streaming pass, and converts gron lines back to JSON. All three commands (`flatten`, `search`, `unflatten`) stream, so multi-gigabyte files work without loading the whole document into memory or context.

## When to use Gronify vs. other tools

- **Small JSON file (under 50 KB):** read it directly.
- **Large, minified, or unknown JSON / JSONL:** use `gronify` with `--no-color`, `--count`, and `-m` / `--limit` to inspect shape and matches without flooding context.
- **Known schema + reshaping, grouping, or arithmetic:** find the path with `gronify search`, then switch to `jq`.

## Check availability and flags

Check `command -v gronify` (PowerShell: `Get-Command gronify`) before running commands. If missing, run one-off commands with `npx gronify ...` or ask the user before installing:

```bash
npm install -g gronify
brew install 1solomonwakhungu/tap/gronify
```

Gronify requires Node.js 20 or newer. To build from a local checkout: `cd src/packages/cli && npm ci && npm run build && npm link`.

Verify feature support on older installs before relying on newer flags:

- **1.2.0+** (`-m`, `--limit`, `--sort`, `--exit-status`): check `gronify search --help | grep -e --max-count`. On 1.1.0 or older, update (`npm install -g gronify@latest`) or cap with `| head -n 20` and skip `--sort`.
- **Newer than 1.3.2** (`-s`/`--stream`/`--jsonl` and parent-synthesizing `unflatten`): check `gronify flatten --help | grep -e --jsonl`. On 1.3.2 or older, use `jq -c` on JSON Lines files and keep ancestor lines when unflattening filtered output.

## Explore without flooding context

Pass `--no-color` in every captured command (or set `NO_COLOR=1`). In PTY-backed agent terminals, omitting `--no-color` adds ANSI codes and forces `unflatten` to buffer the whole document in memory. For any unknown or large file, go from cheap to specific:

```bash
gronify --no-color flatten --limit 50 payload.json                                 # 1. learn top-level shape
gronify --no-color search payload.json error --count                               # 2. check match volume (one number)
gronify --no-color search payload.json error -m 20                                 # 3. inspect first 20 matches
gronify --no-color search payload.json --regex 'users\[[0-9]+\]\.email = ' -m 20   # 4. narrow by path, still capped
```

- `-m/--max-count <n>` (`search`) and `--limit <n>` (`flatten`) stop reading the input at `n` lines and exit `0`. `n` must be a positive integer.
- When a cap ends the run, a notice goes to stderr (`Stopped after 20 matches (--max-count); there may be more`) and stdout holds only path lines. Never rerun without a cap until `--count` confirms the volume is small.
- Input past a cap is never read or validated, so a syntax error later in the file is not reported.
- Never `cat` a large JSON file into context.

## Commands, key options, and CLI traps

- `gronify flatten [file]`: one `json.path = value` line per value (reads stdin if no file). Options: `--limit <n>`, `--sort`, `-s/--stream` (alias `--jsonl`).
- `gronify search <file_or_term> [term]`: flattens and filters in one pass. Plain terms are case-insensitive substring matches on the whole line (path and value). Options: `-r/--regex` (JavaScript RegExp; `\d` works, POSIX `[[:digit:]]` does not), `-c/--case-sensitive`, `--count`, `-v/--invert-match`, `-m/--max-count <n>`, `--sort`, `--exit-status`, `-s/--stream` (alias `--jsonl`).
- `gronify unflatten [file]`: converts gron lines back to JSON. Document-order output from `flatten`, `flatten --sort`, and filtered subsets streams in one pass.
- Global options: `--no-color`, `--color`, `--pretty`, `-o/--output <file>` (atomic replace on success only).

```bash
curl -sS https://example.com/api/status | gronify --no-color search version -m 5
```

Critical CLI traps to avoid:

- **Never pass an empty search term (`''`):** `gronify search file.json ''` drops the empty argument, treats `file.json` as the term, and hangs waiting on stdin. Use `flatten` to list lines or `'= ""'` to match empty strings.
- **Hyphen-prefixed search terms:** Put `--` before terms starting with `-` (for example `gronify --no-color search file.json -- -500`), otherwise the term is parsed as an unknown option.
- **Shell quoting:** In bash/zsh and PowerShell 7+, wrap patterns containing `$`, `[`, `]`, or `"` in single quotes (`'\$ref'`). In Windows PowerShell 5.1, escape embedded double quotes inside single quotes (`'\"error\"'`). In `cmd.exe`, use double quotes.

## JSON Lines / NDJSON logs

For `.jsonl` / `.ndjson` files and line-delimited streams, pass `-s`, `--stream`, or `--jsonl` to `flatten` or `search`. Each non-blank line becomes `json[0]`, `json[1]`, ... under `json = []`:

```bash
gronify --no-color flatten --jsonl --limit 40 app.jsonl
gronify --no-color search --jsonl app.jsonl --count '.level = "error"'
gronify --no-color search --jsonl app.jsonl -m 20 '.level = "error"'
```

- `[i]` is the 0-based non-blank record index (not necessarily the file line number). Blank lines and `\r\n` are handled.
- Each line must hold one complete JSON value; do not pass `-s` on pretty-printed JSON.

## Stable key order for `diff`

Default output preserves document key order. Pass `--sort` on `flatten` or `search` to sort object keys at every depth by UTF-16 code unit while keeping subtrees contiguous and array indexes in order (`[2]` before `[10]`):

```bash
diff -U1 <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json)
```

- Do not pipe Gronify output through plain `sort` (it puts `[10]` before `[2]` and splits subtrees). `--sort` order also differs from `gron`'s UTF-8 bare-keys-first order.
- Top-level arrays stream one sorted record at a time; a large root object buffers up to 64 MiB (configurable via `GRONIFY_SORT_MEMORY`, e.g. `256MiB`) before spilling to `$TMPDIR`. With `--sort` on a root object, caps apply after the object finishes.

## Exit codes, atomic output, and exact numbers

- **Default exit codes:** `0` on success (including search with zero matches), `1` on error.
- **Deterministic branching (`--exit-status`):** `0` = matched, `1` = no match, `2` = error (in PowerShell, check `$LASTEXITCODE`):

```bash
if gronify --no-color search --exit-status config.json -m 1 'debug = true' > /dev/null 2>&1; then echo on; fi
```

- **Pipelines:** stdout streams before EOF, so a truncated file can emit lines before failing. Use `set -o pipefail` on uncapped pipelines and verify exit code `0`. On capped pipes (`-m` / `--limit`), an upstream producer (`gzip`, `curl`) may exit `141` (SIGPIPE) or `23` when Gronify closes stdin early.
- **Atomic writes (`-o <file>`):** replaces the target only after a clean finish; failures leave any existing file untouched.
- **Exact numbers:** `12345678901234567890`, `1.10`, `1e2`, and `-0` print verbatim (never rounded to 64-bit floats).

## Path to `jq` filter quick map

| Gronify output         | `jq` filter        | Rule                       |
| ---------------------- | ------------------ | -------------------------- |
| `json.users[1].email`  | `.users[1].email`  | Drop leading `json`        |
| `json.cfg["api.host"]` | `.cfg["api.host"]` | Keep bracketed keys intact |
| `json[0].id`           | `.[0].id`          | Prefix `.` before `[`      |
| `json.$ref`            | `.["$ref"]`        | Quote `$` keys in brackets |

## Reconstruct JSON with `unflatten`

```bash
gronify --no-color flatten payload.json | gronify --no-color unflatten
gronify --no-color search payload.json region | gronify --no-color unflatten
```

- On releases newer than 1.3.2, `unflatten` synthesizes missing root and parent containers from filtered output (skipped array indexes become `null`). On 1.3.2 and older, keep container lines (`search -v` or `--regex '^json = |...'`).
- Never overwrite source JSON in place during exploration: write to a new file with `-o reconstructed.json` and validate before replacing.
- Conflicting types (`json.a = 1` then `json.a.b = 2`) fail with `line N: ...`. Input must be strict JSON (no comments or trailing commas).

Reference: [Website & CLI docs](https://gronify.vercel.app) · [Full LLM reference](https://gronify.vercel.app/llms-full.txt) · [GitHub](https://github.com/1solomonwakhungu/gronify)
