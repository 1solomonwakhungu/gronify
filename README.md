[![skills.sh](https://skills.sh/b/1solomonwakhungu/gronify)](https://skills.sh/1solomonwakhungu/gronify)

<div align="center">
  <img src="branding/logo.svg" alt="Gronify logo" width="180" height="180">
</div>

# Gronify

Gronify is a local-first, standalone CLI for turning JSON into greppable paths, searching those paths, and round-tripping gron output back to JSON. Flattening, unflattening, and search are built in, with no external command-line tools required.

For platform and developer-experience teams, Gronify is useful when large JSON payloads show up in CI logs, service responses, support bundles, generated config, or incident debugging sessions and need to be inspected with familiar shell tools.

## Agent skills

Install the Gronify agent skill with the open `skills` CLI:

```bash
npx skills add https://github.com/1solomonwakhungu/gronify --skill gronify-json-flatten-search
```

The skill teaches supported coding agents when to flatten, search, and round-trip JSON with the Gronify CLI. Browse it on [skills.sh](https://skills.sh/1solomonwakhungu/gronify/gronify-json-flatten-search).

## Features

- Flatten JSON files or stdin into gron-style path assignments, streaming through multi-gigabyte inputs in constant memory.
- Unflatten gron files or stdin back into JSON, streaming multi-gigabyte input in roughly constant memory.
- Search flattened paths with plain text, extended regex, case-sensitive matching, and match counts.
- Cap the output with `search -m/--max-count` and `flatten --limit`. The input stops being read at the cap, so a huge file returns in milliseconds and an agent cannot flood its context.
- Sort object keys at every level with `--sort` for stable, diffable output. The default is document order.
- Keep numbers exactly as written (`12345678901234567890`, `1.10`), which `jq` can round.
- Opt in to grep-style exit codes with `search --exit-status`.
- Use stdin/stdout workflows so Gronify can sit inside shell pipelines.
- Format terminal output with optional colors and pretty indentation.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.

## Install

### npm

```bash
npm install -g gronify
# or run it once without installing
npx gronify --help
```

### Homebrew

Homebrew installs Gronify together with its Node.js dependency:

```bash
brew install 1solomonwakhungu/tap/gronify
```

The formula is maintained in the [Homebrew tap](https://github.com/1solomonwakhungu/homebrew-tap).

### Release Archive

Download the archive for the latest version from [GitHub Releases](https://github.com/1solomonwakhungu/gronify/releases). The executable requires Node.js 20 or newer.

### From Source

1. Clone and build Gronify.

   ```bash
   git clone https://github.com/1solomonwakhungu/gronify.git
   cd gronify/src/packages/cli
   npm ci
   npm run build
   ```

2. Link the local CLI.

   ```bash
   npm link
   gronify --help
   ```

## Run

Flatten a JSON file:

```bash
gronify flatten data.json
```

Flatten JSON from stdin:

```bash
echo '{"service":"api","retries":2}' | gronify flatten
```

Unflatten gron output back to JSON:

```bash
gronify flatten data.json | gronify unflatten
```

Search flattened paths:

```bash
gronify search data.json "service"
gronify search data.json --regex "users\[[0-9]+\]\.name"
gronify search data.json --case-sensitive "Service"
gronify search data.json --count "error"
```

Look at a large file without printing all of it:

```bash
gronify search huge.json --count "error"        # how many matches, before printing any
gronify search huge.json -m 20 "error"          # the first 20 matches, then stop reading
gronify flatten --limit 50 huge.json            # the first 50 lines
```

Sort keys so two payloads can be diffed:

```bash
diff <(gronify flatten --sort old.json) <(gronify flatten --sort new.json)
```

Use the exit status in a script:

```bash
if gronify search --exit-status config.json -m 1 "debug = true" > /dev/null; then echo "debug is on"; fi
```

Use Gronify in a pipeline:

```bash
curl -s https://example.com/payload.json | gronify search --regex "metadata|status"
```

## Demo

Create a sample payload:

```bash
cat > demo.json <<'JSON'
{
  "service": {
    "name": "checkout",
    "status": "degraded"
  },
  "deployments": [
    { "region": "us-central1", "version": "2026.05.22" },
    { "region": "us-east1", "version": "2026.05.21" }
  ]
}
JSON
```

Flatten it:

```bash
gronify flatten demo.json
```

Example output (keys come out in the order they appear in the document; add `--sort` to sort them):

```text
json = {}
json.service = {}
json.service.name = "checkout"
json.service.status = "degraded"
json.deployments = []
json.deployments[0] = {}
json.deployments[0].region = "us-central1"
json.deployments[0].version = "2026.05.22"
json.deployments[1] = {}
json.deployments[1].region = "us-east1"
json.deployments[1].version = "2026.05.21"
```

Find operationally relevant fields:

```bash
gronify search demo.json --regex "status|version"
```

## Command Reference

### Global Options

| Option                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `--color`             | Enable colored output when the terminal supports it. |
| `--no-color`          | Disable colored output.                              |
| `--pretty`            | Add indentation/grouping to formatted output.        |
| `-o, --output <file>` | Write output to a file instead of stdout.            |
| `-h, --help`          | Show help.                                           |
| `-V, --version`       | Show the CLI version.                                |

### `flatten [file]`

Converts JSON to gron format. If `file` is omitted, Gronify reads from stdin.

| Option        | Description                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--limit <n>` | Stop after `n` lines of output and stop reading the input. See [Limiting output](#limiting-output).                          |
| `--sort`      | Sort object keys at every level. Array order is unchanged. The default is document order. See [Sorting keys](#sorting-keys). |

```bash
gronify flatten data.json
cat data.json | gronify flatten
gronify flatten --sort --limit 100 data.json
```

### `unflatten [file]`

Converts gron format back to JSON. If `file` is omitted, Gronify reads from stdin.

```bash
gronify unflatten data.gron
cat data.gron | gronify unflatten
gronify --output data.json unflatten data.gron
```

`unflatten` reads its input as a byte stream and writes JSON as it goes, so memory use does not grow with input size. On an Apple M5 Pro, a 3 GB gron file converts in about 7 seconds with a peak RSS of about 100 MB.

- **Document order.** Gron written by `gronify flatten` streams in a single pass: each container comes before its children, siblings stay together, and array indexes ascend. Input that breaks this, such as lexically sorted gron (`json[10]` before `json[2]`) or a path that re-enters a container that was already closed, is still accepted when the problem shows up within the first 16 MiB of input. Gronify then rebuilds the whole document in memory. Once 16 MiB of input has been read or 16 MiB of output produced (a large array gap counts as output), out-of-order input fails with an error that names the line, because JSON may already have been written to stdout. Regenerate such input with `gronify flatten`. Output of `gronify flatten --sort` is in document order too, so it unflattens in a single pass; plain `sort` on the lines is not (see [Sorting keys](#sorting-keys)).
- **Values are written as they appear.** Numbers are validated, not parsed, so `12345678901234567890`, `1.10`, `-0`, and `1e-7` come out unchanged. Strings are normalized to what `JSON.stringify` writes (`"A\/"` becomes `"A/"`). Compound values written on one line (`json.a = {"n":12345678901234567890}`) keep their numbers too, with whitespace and strings normalized, keys in source order (integer-like keys are not moved first as `JSON.parse` would), and a repeated key keeping its last value. Only space, tab, LF, and CR separate tokens inside a value, so `[\v]` is rejected; around a line and around `=`, anything `String.prototype.trim` strips (including U+00A0) is ignored.
- **Skipped array indexes become `null`.** `json[3] = 1` after `json = []` gives `[null,null,null,1]`. The nulls are streamed, not allocated, so `json[100000000] = 1` costs output size, not memory.
- **Repeated assignments.** In streamed output a repeated object key is written again where it appears, and a JSON parser keeps the last one, so the data matches the old last-write-wins result. Reassigning an array index counts as out of order, because the position is already written. Because the duplicate is written, `--pretty` output for such input is not the same as `JSON.stringify(value, null, 2)` of the parsed result, which has the key once; and a strict consumer that rejects duplicate names will reject the output. Gron from `gronify flatten` never repeats a key.
- **`--pretty`** matches `JSON.stringify(value, null, 2)`, including `{}` and `[]` for empty containers, except for repeated keys (see above).
- **`--output` is atomic**, as for `flatten` (see [Streaming and large inputs](#streaming-and-large-inputs)): the JSON goes to a temporary file that replaces the target only after the whole input converted, so a failure leaves an existing target alone, and `-o` may name the input file.
- **Colored output** (`--color`, or a terminal without `--no-color`) needs the whole document, so it is built in memory, also when combined with `--output`. Runs without color stream in constant memory; use `--no-color` for very large inputs.
- Bracket keys may contain `=`, `]`, and escaped quotes: `json["a=b"] = 1`.

### `search <file_or_term> [term]`

Searches flattened JSON paths. Pass both a file and term, or pipe JSON to stdin and pass only the search term.

| Option                 | Description                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `-r, --regex`          | Use extended regular expressions.                                                                                             |
| `-c, --case-sensitive` | Match case sensitively.                                                                                                       |
| `--count`              | Print only the match count.                                                                                                   |
| `-v, --invert-match`   | Show lines that do not match.                                                                                                 |
| `-m, --max-count <n>`  | Stop after `n` matching lines (`n` non-matching lines with `-v`; with `--count`, count up to `n`) and stop reading the input. |
| `--sort`               | Sort object keys at every level before printing. The default is document order. Ignored with `--count`.                       |
| `--exit-status`        | Exit 1 when nothing matches, like `grep`. Errors then exit 2 instead of 1. See [Exit codes](#exit-codes).                     |

```bash
gronify search data.json "user"
gronify search data.json --regex "user\.[a-z]+"
cat data.json | gronify search "name"
gronify search data.json --count "field"
gronify search data.json -m 10 "field"
```

### Limiting output

`search -m/--max-count <n>` and `flatten --limit <n>` stop after `n` lines. They exist so a person or an AI agent can look at a file of unknown size without flooding a terminal or a context window, and they follow `grep -m`:

- `n` must be a positive integer. `0`, negative numbers, decimals, and text are rejected with an error.
- The cap counts matching lines. With `-v` it counts the non-matching lines that are printed. With `--count` it caps the count.
- Gronify stops reading the input at the cap and destroys the read stream (or stdin), so a 5 GB file whose first match is near the start returns in milliseconds, and a `cat huge.json | gronify search -m 5 term` pipeline ends instead of waiting. Memory and time depend on how far Gronify had to read, not on the file size.
- The exit status is 0. When a cap ended the run, Gronify prints one line to **stderr**, for example `Stopped after 20 matches (--max-count); there may be more`, and stdout holds only the lines. The notice also appears when the cap equals the exact number of results, because Gronify does not read further to find out.
- The rest of the input is never read, so it is not validated either. A syntax error after the cap is not reported, where a run without a cap would exit 1 on it. Errors before the cap are reported as usual.
- With `-o`, the capped output is committed atomically like any other output: the file appears (or replaces the old one) only when the run finishes, and holds exactly the lines that were printed. See the notes under [Streaming and large inputs](#streaming-and-large-inputs).
- With `--sort`, the cap applies to the sorted order. It can only end the read early while the input is a top-level array. A document whose root is an object has to be read to the end before its first sorted line is known.

### Sorting keys

**The default is document order**: keys come out in the order they appear in the input, which is not what `gron` does (`gron` sorts). Add `--sort` to `flatten` or `search` to sort the keys of every object, at every depth:

```bash
echo '{"b":1,"a":{"d":4,"c":3},"10":0,"2":0}' | gronify flatten --sort
```

```text
json = {}
json["10"] = 0
json["2"] = 0
json.a = {}
json.a.c = 3
json.a.d = 4
json.b = 1
```

- Keys are compared by UTF-16 code unit, the same order as the default JavaScript `sort()` and as `gron`. `"10"` comes before `"2"`, uppercase before lowercase, and a key such as `"😀"` (a surrogate pair) before `"～"` (U+FF5E), which a byte-wise UTF-8 sort would put the other way round.
- Array elements keep their order. Duplicate keys stay together, in document order.
- Because the order is stable, `diff <(gronify flatten --sort a.json) <(gronify flatten --sort b.json)` shows real changes and ignores key reordering.
- `search --sort` filters first and sorts what is left, so it only holds matching lines. `--sort` is ignored with `--count`, which needs no order.
- Numbers and strings are untouched by sorting.

**Memory cost.** The document is never turned into JS objects. Each object's members are kept as already-flattened bytes plus a key string and a few numbers per member, and are put in key order when the object closes. In practice:

- A top-level array (the usual shape of a large payload: a list of records) is written as it is read, one record at a time. Sorting a 129 MB array of records peaked at 143 MB RSS, 3.7 s against 0.9 s unsorted.
- Everything inside an object waits until the document, or the enclosing array element, ends. Gronify keeps up to 64 MiB of line data in memory (set `GRONIFY_SORT_MEMORY` to a number of bytes to change it), then writes the oldest buffers to an anonymous temp file in `$TMPDIR` (unlinked right after it is created, so it cannot be left behind) and reads them back at the end. That temp file can grow to roughly the size of the flattened output of the largest object, so make sure the temp directory has room.
- The part that stays in memory is about 100 to 150 bytes per member of one object, however large each member is. A 270 MiB file that is one object with 1.5 million members peaked at about 500 MB RSS, and 350 MB with a 4 MiB line buffer.
- Each very large member is read back once, and small members are copied into their parent once per level, so heavy nesting adds work. Output grows quadratically with depth with or without `--sort`.

### Exact numbers

`flatten` and `search` print numbers exactly as they appear in the source. `12345678901234567890` stays `12345678901234567890` and `1.10` stays `1.10`. `jq` parses numbers into doubles, so, depending on the version and the filter, an integer above 2^53 (9007199254740992) such as a 64-bit ID or a nanosecond timestamp can come back rounded (`12345678901234567000`), and `1.10` can come back as `1.1`. A search for the ID you copied from a log will still find it in Gronify.

### Exit codes

| Code | Meaning                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success. This includes a `search` with no matches (the default), a run that stopped at `-m`/`--limit`, and a closed output pipe such as `\| head`.                     |
| `1`  | Failure: invalid JSON or gron, an unreadable or missing file, no input provided, an invalid option value, or an unknown option. With `search --exit-status`: no match. |
| `2`  | Only with `search --exit-status`: any failure from the list above. This keeps "no match" (1) separate from "broken" (2), as in `grep`.                                 |

`--exit-status` is opt-in so existing scripts keep exit 0 on an empty search. With it, `gronify search --exit-status ...` exits 0 when at least one line was selected (a run stopped by `-m` counts), 1 when none was, and 2 on any error. `--count` still prints `0` before exiting 1. With `-v`, "no match" means every line matched the term, so nothing was printed.

### Streaming and large inputs

`flatten` and `search` read the input in 1 MB chunks, tokenize the raw bytes, and write each gron line as it is produced. Peak memory stays around 100 MB whether the input is 20 MB or several gigabytes, and output starts before the input has been read in full. `unflatten` streams too (see above).

- **Strict JSON.** Trailing commas, comments, single quotes, bad escapes, raw control characters in strings, invalid UTF-8, and data after the top-level value are rejected. Errors report the byte offset, plus line and column (columns count bytes), for example `Unexpected '}' after ',' (trailing commas are not allowed) at byte offset 7 (line 1, column 8)`.
- **Numbers are printed exactly as written.** `12345678901234567890`, `1.10`, `1e2`, and `-0` come out unchanged, where a parse-and-reprint would give `12345678901234567000`, `1.1`, `100`, and `0`.
- **Keys keep document order.** Integer-like keys such as `"2"` are no longer moved ahead of the others.
- **Duplicate keys are all emitted**, one line per occurrence, in the order they appear.
- **Strings** are printed as `JSON.stringify` would print them, so `"\u00e9"` becomes `"é"` and `"\/"` becomes `"/"`.
- **Deep nesting** has no depth limit. Every container line repeats its full path, so the output of a very deep document grows quadratically with depth.
- **Invalid input on stdout.** Output is written while the input is still being read, so when the input turns out to be invalid (a truncated download is only noticed at the end) the lines produced before the error may already have been written, possibly all but the last few. The error message and exit code 1 are always produced. Scripts should check the exit status, or use `set -o pipefail` in a pipeline such as `gronify flatten data.json | other-tool`, rather than trusting that stdout holds a complete result.
- **Output files are atomic.** With `-o`, output goes to a temporary file next to the target, and the target is replaced only after the whole input was processed successfully. If anything fails (invalid input, a write error, Ctrl-C), the temporary file is removed and an existing target is left untouched. The target keeps its mode, and `-o` may name the input file (`gronify -o data.json flatten data.json`). A search with no matches writes no file. Because the target is replaced by a rename, the directory must be writable, hard links to the old file are not updated, and ownership is not preserved; symlinks are followed and the file they point to is replaced. Paths under `/dev` and `/proc` (such as `/dev/stdout`), devices, and pipes are written in place.
- **Closed pipes.** `gronify flatten data.json | head` stops quietly once `head` exits.
- A single string or number token must fit in memory.

## Development

The CLI package lives in `src/packages/cli`.

```bash
cd src/packages/cli
npm ci
npm run build
npm test
```

Useful package scripts:

```bash
npm run lint
npm run format:check
npm run build
npm test
npm run bench
npm run audit
```

The integration tests run the built CLI directly and require no external binaries.

To measure `unflatten` on generated gron (inputs live in a temp directory and are deleted afterwards):

```bash
cd src/packages/cli
npm run build
node scripts/bench-unflatten.mjs                 # 56 MB and 285 MB, plus a flatten | unflatten round-trip check
node scripts/bench-unflatten.mjs --huge 3        # one 3 GB input; needs about 3 GB of free temp space
```

`npm run bench` generates inputs in a temporary directory, times `flatten`, `search --count`, `flatten --sort`, and an early-stopping `search -m 5`, and deletes the files afterwards. Pass options after `--`, for example `npm run bench -- --sizes 23,129 --big 3 --deep 100000 --baseline path/to/older/dist/index.js`.

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/) that touch `src/packages/cli`:

1. Each push to `main` updates an open release PR that bumps `src/packages/cli/package.json` and `src/packages/cli/CHANGELOG.md`. `fix:` gives a patch release, `feat:` a minor release, and `feat!:` or a `BREAKING CHANGE:` footer a major release.
2. Merging the release PR tags `vX.Y.Z` and creates the GitHub release. The release workflow then attaches `gronify-vX.Y.Z.tar.gz`, `gronify-vX.Y.Z.zip`, and `checksums.txt`.
3. If the `NPM_TOKEN` secret is set, the workflow publishes the package to npm with provenance. Without it, the npm step is skipped and the rest of the release still runs.

Pushing a `v*` tag by hand still builds the archives and creates the release.

### One-time setup

- **`NPM_TOKEN`**: add an npm granular access token with publish rights for `gronify` under **Settings → Secrets and variables → Actions**. Releases do not reach npm until this secret exists.
- **Release PR permissions**: enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or add a `RELEASE_PLEASE_TOKEN` secret (a fine-grained PAT with contents and pull-request write access). With the PAT, CI also runs on the release PR, which `GITHUB_TOKEN`-created PRs do not trigger.

### Homebrew

The [Homebrew tap](https://github.com/1solomonwakhungu/homebrew-tap) formula installs the `gronify-vX.Y.Z.tar.gz` release archive. After each release, update the formula's `url` and `sha256` (from `checksums.txt`).

## Repository Layout

```text
.
|-- branding/              # Logo and icon assets
|-- landing-page/          # Next.js marketing/demo page
|-- scripts/               # Repository validation and package discovery helpers
|-- skills/gronify-json-flatten-search/  # Installable agent skill indexed by skills.sh
|-- src/
|   |-- README.md          # Source tree orientation
|   `-- packages/cli/      # TypeScript CLI package
`-- .github/               # CI, Dependabot, and contribution templates
```

## Troubleshooting

### `npm test` fails before running assertions

Build first so `dist/index.js` exists:

```bash
npm run build
npm test
```

### JSON does not flatten

Validate that the input is valid JSON and that files passed to `flatten` are readable from the current shell.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and pull request expectations.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## License

Gronify is licensed under the [MIT License](LICENSE).

## Credits

- [gron](https://github.com/tomnomnom/gron) established the greppable JSON workflow that inspired this project.
- [commander.js](https://github.com/tj/commander.js) powers the command interface.
- [chalk](https://github.com/chalk/chalk) powers colored terminal output.
