---
name: jsonl-ndjson-log-search
description: Streams and searches JSON Lines (.jsonl, .ndjson) logs, webhook dumps, and agent transcripts with Gronify --jsonl / -s caps. Use when grepping structured JSONL logs, pulling one record by index, or converting JSONL to a JSON array.
license: MIT
compatibility: Requires Node.js 20+ and the gronify CLI >= 1.4.0 with -s/--stream/--jsonl support (verify with gronify flatten --help | grep -e --jsonl).
metadata:
  author: 1solomonwakhungu
  homepage: https://gronify.vercel.app
  repository: https://github.com/1solomonwakhungu/gronify
---

# JSON Lines & NDJSON Log Search

Gronify's `-s` / `--stream` / `--jsonl` mode streams JSON Lines (NDJSON) one record at a time and flattens each non-blank line as `json[0]`, `json[1]`, ... under `json = []` (matching `gron -s` and `fastgron -s`). Memory stays flat regardless of record count, and `-m` / `--limit` stop reading early.

## Check CLI availability and `--jsonl` support

`-s`, `--stream`, and `--jsonl` require Gronify `1.4.0` or newer (1.3.2 and older exit `1` with `error: unknown option '-s'`). Always check first:

```bash
command -v gronify && gronify flatten --help | grep -e --jsonl
```

- If `gronify` is missing, use `npx gronify ...` or ask the user before running `npm install -g gronify` or `brew install 1solomonwakhungu/tap/gronify`.
- If the installed release does not list `--jsonl`, ask the user before updating (`npm install -g gronify@latest`) or fall back to `jq -c 'select(...)' app.jsonl` / `rg` on that file.

## Explore a JSONL / NDJSON file safely

Always pass `--no-color` and cap output before printing:

```bash
# 1. Learn the schema of the first records
gronify --no-color flatten --jsonl --limit 40 app.jsonl

# 2. Count matching path lines across the log
gronify --no-color search --jsonl app.jsonl --count '.level = "error"'

# 3. Sample the first 20 matching lines and stop reading
gronify --no-color search --jsonl app.jsonl -m 20 '.level = "error"'

# 4. Pull every field of a specific matched record (e.g. record 42)
gronify --no-color search --jsonl app.jsonl --regex '^json\[42\](\.|\[| = )' -m 50
```

## Tail streams, filters, and log triage

Pipe recent lines or compressed log archives straight into `search -s` (for capped pipes, ignore upstream SIGPIPE `141` from `tail` / `gzip` when Gronify stops early):

```bash
tail -n 2000 app.jsonl | gronify --no-color search -s -m 25 --regex '\.level = "(error|fatal)"'
gzip -dc access.ndjson.gz | gronify --no-color search --jsonl -m 20 --regex '\.status = 5[0-9]{2}$'
```

Use `--exit-status` for quiet log assertions (`0` = found, `1` = not found, `2` = error; PowerShell: `$LASTEXITCODE`):

```bash
if gronify --no-color search --jsonl --exit-status -m 1 app.jsonl '.level = "fatal"' > /dev/null 2>&1; then
  echo "fatal log entry found"
fi
```

> **Windows quoting:** In Windows PowerShell 5.1, escape embedded double quotes inside single quotes (`'.level = \"error\"'`); in `cmd.exe`, wrap patterns in double quotes.

## Convert JSONL to a JSON array (or filtered subset)

```bash
# Full JSONL file -> single JSON array
gronify --no-color flatten --jsonl app.jsonl | gronify --no-color unflatten -o records.json

# Only matching paths -> sparse JSON array (missing parents synthesized, skipped indexes null)
gronify --no-color search --jsonl app.jsonl --regex '^json\[42\](\.|\[| = )' | gronify --no-color unflatten --pretty
```

To convert a reconstructed JSON array back into JSON Lines, pipe through `jq -c '.[]'`.

## Important JSONL rules and gotchas

- **Record index vs. line number:** `[i]` in `json[i]` counts non-blank records from `0`. Blank and whitespace-only lines are skipped, so `json[10]` may not be line 11. Both `\n` and `\r\n` work.
- **Strict one value per line:** A record cannot span multiple lines, and two values on one line are rejected with byte offset, line, and column. Never pass `-s` / `--jsonl` on a pretty-printed single JSON document.
- **Empty input:** An empty file or blank-only input prints `json = []` and exits `0`.
- **Sorting per record (`--sort`):** With `--jsonl --sort`, Gronify holds and sorts only one record at a time, so memory stays flat and `-m` / `--limit` still stop early.
- **Exact numbers:** 64-bit trace/event IDs and nanosecond timestamps print verbatim without floating-point rounding.
- **Multi-field predicates:** A line search sees one field per line. To select records where two different fields match simultaneously (e.g. `level == "error"` AND `service == "billing"`), use `gronify` to discover the exact field paths, then run `jq -c 'select(.level == "error" and .service == "billing")' app.jsonl`.

Reference: [Gronify README — JSON Lines](https://github.com/1solomonwakhungu/gronify#json-lines-ndjson) · [Website & CLI docs](https://gronify.vercel.app)
