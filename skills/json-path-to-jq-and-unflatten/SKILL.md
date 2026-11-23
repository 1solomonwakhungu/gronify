---
name: json-path-to-jq-and-unflatten
description: Finds exact JSON paths with gronify search to build jq filters or RFC 9535 JSONPath, keeps 64-bit integers exact, and rebuilds filtered JSON with unflatten (ungron). Use when jq paths fail, leaf_paths errors, or big IDs round.
license: MIT
compatibility: Requires Node.js 20+ and the gronify CLI (npm install -g gronify, brew install 1solomonwakhungu/tap/gronify, or npx gronify). Parent synthesis on filtered unflatten requires >= 1.4.0.
metadata:
  author: 1solomonwakhungu
  homepage: https://gronify.harlo.dev
  repository: https://github.com/1solomonwakhungu/gronify
---

# Find JSON Paths, Build `jq` Filters, Keep Big Numbers Exact, and Unflatten

Use Gronify to discover exact paths when you do not yet know a document's schema, translate those paths directly into `jq` filters or JSONPath, verify 64-bit integers verbatim, or rebuild filtered lines back into JSON with `unflatten`.

## Prerequisites

Check `command -v gronify` (or run `npx gronify ...`; ask before installing globally with `npm install -g gronify` or `brew install 1solomonwakhungu/tap/gronify`). Always pass `--no-color` (in PTY terminals, omitting `--no-color` forces `unflatten` to buffer the whole document in memory) and cap searches on unknown files with `-m`. On 1.4.0 and older, avoid passing an empty search term `''` (it reads stdin instead); prefix hyphenated terms with `--`.

## Pin searches to keys vs. exact values

Plain `gronify search` matches case-insensitively anywhere on the `path = value` line. Use regex anchors to isolate keys or values:

```bash
# Match only a key named "email" (not "email_notifications" or values containing "email")
gronify --no-color search account.json -m 20 --regex '\.email = '
# Stronger guard if string values themselves may contain ".email = "
gronify --no-color search account.json -m 20 --regex '^[^=]*\.email = '

# Match exact string, number, null, or boolean values
gronify --no-color search account.json -m 20 '= "Ada"'
gronify --no-color search account.json -m 20 --regex ' = 3$'
gronify --no-color search account.json -m 20 --regex ' = null$'
gronify --no-color search account.json -m 20 --regex ' = (true|false)$'

# Print paths only (strip values)
gronify --no-color search account.json -m 20 --regex '\.email = ' | sed 's/ = .*//'
```

## Convert any Gronify path into `jq` or JSONPath

| Gronify prints                | `jq` filter               | RFC 9535 JSONPath          | What changed                          |
| ----------------------------- | ------------------------- | -------------------------- | ------------------------------------- |
| `json.users[1].email`         | `.users[1].email`         | `$.users[1].email`         | Drop `json` (or replace with `$`)     |
| `json.cfg["api.example.com"]` | `.cfg["api.example.com"]` | `$.cfg["api.example.com"]` | Keep bracketed keys; never dot-expand |
| `json[1].id`                  | `.[1].id`                 | `$[1].id`                  | Add leading `.` in `jq`               |
| `json.users[1].email` (all)   | `.users[].email`          | `$.users[*].email`         | Replace index with wildcard           |
| `json.$ref`                   | `.["$ref"]`               | `$["$ref"]`                | Quote `$` keys in brackets            |

- To fetch the whole object containing a match `json.users[1].email`, drop the final segment: `jq -c '.users[1]' account.json`.
- If only `jq` is available and `leaf_paths` fails (`leaf_paths/0 is not defined`, removed in jq 1.7), use `jq -c 'paths(scalars | true)' file.json` (`paths(scalars)` drops `false` and `null`).

## Keep 64-bit integers and decimals exact

Gronify validates and prints numbers verbatim: `12345678901234567890`, `1.10`, `1e-7`, and `-0` survive `flatten`, `search`, and `unflatten` unchanged.

- `JSON.parse()` in Node.js and `jq` 1.6 and older round integers above `2^53` (`9007199254740992`).
- `jq` 1.7+ preserves untouched numeric literals, but arithmetic (even `.id + 0`) rounds them to 64-bit floats.
- Search for the exact digits copied from a log or ledger using `gronify search`, and trust the printed digits.

## Reconstruct JSON and filtered subsets with `unflatten`

```bash
# Full streaming round-trip (pretty output matches JSON.stringify(v, null, 2))
gronify --no-color flatten payload.json | gronify --no-color --pretty unflatten -o out.json

# Extract matching branches straight back into JSON (1.4.0+)
gronify --no-color search payload.json deployments | gronify --no-color --pretty unflatten -o deployments.json

# Remove a branch while keeping all parent containers (works on every version)
gronify --no-color search payload.json -v debugInfo | gronify --no-color unflatten -o clean.json
```

- **Parent synthesis vs. 1.3.2:** Gronify `1.4.0+` automatically synthesizes missing root and container lines from filtered gron (`.key` creates `{}`, `[n]` creates `[]`, skipped indexes become `null`). On `1.3.2` and older, missing parents fail with `line 1: root must be assigned before child paths`; update with `npm install -g gronify@latest` or keep parents with `search -v` / ancestor lines (`--regex '^json = |deployments'`).
- **Safe editing workflow:** Never overwrite source JSON during exploration. Write to a new file with `-o reconstructed.json`, validate the full document with `node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"))' reconstructed.json` (or `gronify --no-color flatten reconstructed.json > /dev/null` for files over 512 MB so the entire file streams to EOF), and inspect before replacing.
- **Document order for streaming:** `unflatten` streams in flat memory when lines are in document order (`flatten`, `flatten --sort`, and filtered subsets of them). Out-of-order input (such as plain `sort` output where `[10]` precedes `[2]`) is rebuilt in memory only if disorder appears within the first 16 MiB; past 16 MiB it exits `1` with `line N: ...`.
- **Type conflicts fail:** Conflicting lines (`json.a = 1` then `json.a.b = 2`, or object key + array index on one container) are rejected rather than silently merged.

Reference: [Find JSON path guide](https://gronify.harlo.dev/guides/find-json-path) · [Unflatten guide](https://gronify.harlo.dev/guides/unflatten-json) · [Number precision guide](https://gronify.harlo.dev/guides/json-number-precision)
