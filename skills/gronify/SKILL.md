---
name: gronify
description: Inspect, search, flatten, or reconstruct JSON from the terminal with the Gronify CLI. Use for API payloads, logs, support bundles, generated configuration, and other JSON where greppable paths are easier to work with than nested output.
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
- Use `gronify unflatten` only for valid gron assignments whose root and parent containers appear before their children.

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

Gronify accepts JSON, not arbitrary JavaScript objects or comments. If parsing fails, report the failing input and error rather than silently rewriting the data.
