---
name: large-json-search
description: Searches large (over 50 KB to multi-GB), single-line minified, or gzipped (.json.gz) JSON files with Gronify caps (--limit, --count, -m). Use when a JSON file is too big for cat, file-read tools, or triggers ERR_STRING_TOO_LONG.
license: MIT
compatibility: Requires Node.js 20+ and the gronify CLI >= 1.2.0 (npm install -g gronify, brew install 1solomonwakhungu/tap/gronify, or npx gronify).
metadata:
  author: 1solomonwakhungu
  homepage: https://gronify.vercel.app
  repository: https://github.com/1solomonwakhungu/gronify
---

# Context-Safe Large JSON Search

A minified 900 KB JSON export is one line, so `head -n 20` and line-based file readers dump the entire file into context, and `JSON.parse()` fails past ~512 MB (`ERR_STRING_TOO_LONG` / `RangeError: Invalid string length`). Use Gronify's streaming commands with explicit caps so only the lines you ask for enter context.

## Prerequisites

Check `command -v gronify` (PowerShell: `Get-Command gronify`) and verify cap flags exist (`gronify search --help | grep -e --max-count`, requires 1.2.0+). If missing, use `npx gronify ...` or ask the user before running `npm install -g gronify` or `brew install 1solomonwakhungu/tap/gronify`.

## Mandatory size gate

Before opening any unfamiliar `.json` file, measure it:

```bash
wc -c payload.json                           # PowerShell: (Get-Item payload.json).Length
```

- **Under ~50 KB:** read the file normally.
- **50 KB or larger (or minified onto 1 line):** never `cat` it or open it whole with a file-read tool. Follow the narrowing loop below with `--no-color`.

## The 5-step narrowing loop

Go from cheapest to most specific. Each command prints a small, bounded output:

```bash
# 1. Inspect top-level schema and first record fields (stops reading after 50 lines)
gronify --no-color flatten --limit 50 payload.json

# 2. Measure match volume before printing any matches (prints one integer)
gronify --no-color search payload.json error --count

# 3. Sample the first 10 matches to learn the structure of matching branches
gronify --no-color search payload.json error -m 10

# 4. Narrow to a specific code or path-anchored JS regex, still capped
gronify --no-color search payload.json PAYMENT_PROVIDER_DOWN -m 20

# 5. Pull only the fields you need from the matched array indexes
gronify --no-color search payload.json --regex '^json\.events\[(611|1874)\]\.(ts|region|duration_ms) = '
```

- Only drop `-m` after `--count` proves the match count fits comfortably in context.
- Leave `--sort` off exploratory commands on large root objects: sorting a root object buffers until EOF, which disables early stopping on `-m` and `--limit`.
- Never pass an empty search term (`''`): Gronify ignores the file argument and reads stdin instead (hanging on an open pipe). Prefix hyphenated terms with `--` (`gronify --no-color search payload.json -- -500`).

## Compressed exports and pipes

Stream compressed files directly without decompressing to disk:

```bash
gzip -dc events.json.gz | gronify --no-color search -m 20 error
zstd -dc events.json.zst | gronify --no-color flatten --limit 40
curl -sS https://example.com/large.json | gronify --no-color search -m 10 status
```

When Gronify hits `-m` or `--limit`, it closes stdin and exits `0`, so the upstream command stops early instead of reading the entire archive.

## Cap semantics and failure checks

- **Stderr cap notice:** When a cap stops the run early, stderr prints `Stopped after 20 matches (--max-count); there may be more` while stdout contains only gron lines. Treat a capped result as a sample, not an exhaustive scan.
- **Truncated or invalid JSON:** Input after a cap is never read or validated. A capped search on a truncated file exits `0`, whereas `--count` reads to EOF and exits `1` with the exact byte offset, line, and column.
- **Exit status in pipelines:** On **uncapped** runs (`--count`, `flatten | unflatten`), use `set -o pipefail` and require exit `0` because stdout streams before EOF. On **capped** pipes (`-m` / `--limit`), closing stdin early causes upstream `gzip`/`zstd`/`curl` to exit `141` (SIGPIPE) or `23`; inspect `PIPESTATUS[1]` or leave `pipefail` off for capped pipes.
- **Yes/no existence checks:** Avoid printing lines entirely with `--exit-status` (`0` = found, `1` = not found, `2` = error; PowerShell: `$LASTEXITCODE`):

```bash
gronify --no-color search --exit-status payload.json -m 1 PAYMENT_PROVIDER_DOWN > /dev/null 2>&1
echo $?
```

- **Save slices atomically:** Use `-o slice.gron` when a later step consumes the result; `-o` replaces the target only after the run succeeds.

## Exact values and when to switch tools

- Numbers above `2^53` (64-bit IDs, nanosecond timestamps) and trailing decimals (`1.10`) print verbatim, never rounded.
- Once the narrowing loop reveals the exact path and you need aggregation (group, count by key, sum, join), switch to `jq` or `jq --stream` (for files exceeding memory).
- For `.jsonl` / `.ndjson` files (one JSON object per line), pass `--jsonl` (releases newer than 1.3.2) or use `jq -c` / `rg`.

Reference: [Large JSON guide](https://gronify.vercel.app/guides/large-json-files) · [AI agents guide](https://gronify.vercel.app/guides/json-for-ai-agents) · [ERR_STRING_TOO_LONG guide](https://gronify.vercel.app/guides/fix-err-string-too-long-json)
