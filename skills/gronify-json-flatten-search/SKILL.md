---
name: gronify-json-flatten-search
description: Flattens, transforms, and queries JSON into greppable key-value path lines using the Gronify CLI (gron and ungron workflow). Use when an AI agent needs to flatten JSON, grep JSON, search nested JSON structure, inspect API payloads, diff JSON as sorted text lines, or replace jq with path-based queries.
---

# Gronify

Use Gronify to turn nested JSON into one assignment per path, search those paths, and convert valid gron assignments back to JSON.

## Check availability

Run `command -v gronify` before using the CLI. If it is missing and the user wants it installed, use one of the repository's supported installation paths:

```bash
brew install 1solomonwakhungu/tap/gronify
```

Or build it from a Gronify checkout with Node.js 20 or newer:

```bash
cd src/packages/cli
npm ci
npm run build
npm link
```

Do not claim that Gronify is published on npm. The npm package metadata supports source builds, but the project does not publish through npm.

## Choose the command

- Use `gronify flatten` when the user needs every value paired with its full JSON path.
- Use `gronify search` for path or value filtering. It avoids a separate `grep` dependency.
- Use `gronify unflatten` only for valid gron assignments whose root and parent containers appear before their children. It streams, so multi-gigabyte gron is fine as long as it is in document order, which is what `gronify flatten` writes.

Prefer stdin when the JSON already comes from another command. Use a file argument when the user supplied a file and reading it directly is clearer.

## Flatten JSON

```bash
gronify --no-color flatten payload.json
curl -sS https://example.com/api/status | gronify --no-color flatten
```

Keep `--no-color` in pipelines or captured output. Add `--pretty` only for terminal reading.

## Search JSON paths and values

Plain searches are case-insensitive and treat the search term literally:

```bash
gronify --no-color search payload.json status
cat payload.json | gronify --no-color search version
```

Use `--regex` only when pattern matching is intended. Quote shell-sensitive patterns:

```bash
gronify --no-color search payload.json --regex 'users\[[0-9]+\]\.email'
gronify --no-color search payload.json Alice --case-sensitive
gronify --no-color search payload.json error --count
```

A search with no matches exits successfully and writes a message to stderr. When a script needs an unambiguous result, use `--count` and inspect the numeric output.

## Large inputs and exact values

`flatten` and `search` stream their input and output, so multi-gigabyte files work in roughly constant memory. Pass the file path (or pipe it in) instead of loading the JSON yourself, and prefer `--count`, a narrow search term, or `| head` over printing everything:

```bash
gronify --no-color flatten huge.json | head -n 50
gronify --no-color search huge.json error --count
```

The output reflects the source text, not a parsed copy:

- Numbers are printed exactly as written, so `12345678901234567890`, `1.10`, and `1e2` survive unchanged.
- Object keys stay in document order, and duplicate keys produce one line per occurrence.
- Input must be strict JSON. A syntax error exits with status 1 and reports the byte offset, line, and column.
- On stdout, output is written while the input is still being read, so when the input is invalid (a truncated file is only noticed at the end) most or all of the lines may already have been printed. Always check the exit status, and use `set -o pipefail` when piping into another command; never treat the output as complete when the exit status is not 0.
- `-o <file>` is atomic: the file is replaced only after the whole input succeeded, so a failed run leaves an existing file untouched and creates no new one. Prefer `-o` when a later step reads the result.

`unflatten` still reads its whole input into memory.

## Reconstruct JSON

```bash
gronify --no-color unflatten payload.gron
gronify --no-color flatten payload.json | gronify --no-color unflatten
```

Do not overwrite the source JSON during exploration. Write reconstructed JSON to a new file first, parse it, and compare it with the source before replacing anything:

```bash
gronify --no-color unflatten edited.gron > reconstructed.json
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' reconstructed.json
```

Large and edited gron:

- `unflatten` keeps memory flat, so it handles files of several gigabytes. Numbers come out as written (`12345678901234567890` and `1.10` are not rounded or reformatted), and `--pretty` matches `JSON.stringify(value, null, 2)`.
- Keep gron in document order for big inputs: a container before its children, siblings together, array indexes ascending. Do not run `sort` on gron you plan to unflatten. Out-of-order input is rebuilt in memory only while the first 16 MiB are being read; after that, `unflatten` stops with `line N: ...` and an explanation. Appending an override for a top-level key, such as `json.name = "new"`, still works, because a JSON parser keeps the last duplicate key.
- Skipped array indexes come out as `null`.

Gronify accepts JSON, not arbitrary JavaScript objects or comments. If parsing fails, report the failing input and error rather than silently rewriting the data.
