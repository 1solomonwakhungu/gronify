# Experimental native CLI

This dependency-free Rust prototype implements document-order `flatten`, an [ordered `unflatten` subset](UNFLATTEN.md), and a bounded literal `search` subset in a standalone executable. It is ready for independent review and further measurement, not release or replacement of the npm CLI. Everything in this experiment lives under `native/`.

Build and run from the repository root:

```sh
cargo build --release --manifest-path native/Cargo.toml
native/target/release/gronify-native flatten input.json
native/target/release/gronify-native flatten --limit 10 input.json
printf '{"a":1.10}' | native/target/release/gronify-native flatten
```

The executable has no Node dependency. The original flatten-only measured macOS arm64 release binary was 335,936 bytes. Rust 1.97.0 was used; no older compiler or other target has been verified.

## Public flags

`--help` / `-h` and `--version` work at the top level and within each command. Help prints the supported flags, input conventions, and subset limits. Version prints `gronify-native 0.0.1 (experimental)`, independently of npm. Both write to stdout and exit 0 without reading input; a preceding invalid option still fails. Search treats them as literal positional arguments after `--`. Option values are consumed as values, so `--limit --help` fails numeric validation. Combined short flags and `--option=value` are unsupported; flatten/unflatten do not accept an option terminator.

The command help and [search](SEARCH.md) / [unflatten](UNFLATTEN.md) contracts define the supported subset. No npm entry point, release, or default-runtime change is included.

## Contract and memory

The parser consumes buffered bytes and maintains an explicit container stack. The emitter reuses one path and token buffer. Container lines precede their children; duplicate keys remain in input order. No JSON tree, recursive calls, numeric conversion, or subprocess fallback is used.

Numbers retain their exact source spelling, including large integers, `-0`, trailing decimal zeroes, and exponents outside floating-point range. Strings reject invalid UTF-8, raw control characters, and invalid escapes. Escaped strings normalize like `JSON.stringify`, including surrogate pairs and escaped lone UTF-16 surrogates. Keys use the TS contract's ASCII `[A-Za-z_$][A-Za-z0-9_$]*` identifier rule; other keys use normalized bracket strings. Output ends every assignment with LF and has no semicolons.

Input and output buffers default to 64 KiB each. Retained memory is O(largest token + longest path + depth), independent of record count. Tokens are buffered until validated, so a giant scalar uses memory proportional to that scalar. Escaped tokens also allocate a temporary UTF-16 vector. Buffer capacities remain at their high-water marks.

Explicit resource limits reject input rather than changing semantics: 64 MiB per raw token including quotes, 16 MiB per path (array capacity checks conservatively reserve 22 bytes), and 100,000 open containers. The 50,000-depth contract is exercised. Array indexes use checked `u64` arithmetic. These limits are experimental, not the npm CLI's limits.

## Deliberate differences and unsupported features

- `flatten [--limit N] [--chunk-size N] [file|-]` and the [experimental search subset](SEARCH.md) are supported. The [ordered unflatten subset](UNFLATTEN.md) is also supported. Sorting, colors, pretty output, atomic file output, and URL inputs are absent. Unsupported options and commands fail with exit 1 (2 for search with `--exit-status`). There is no silent fallback.
- `--limit` is a positive `u64`. It stops parsing and further reads immediately after the requested assignment; the input buffer may already contain up to one chunk of read-ahead. The unread tail is not validated. Unlike Node's same-chunk completion heuristic, this prototype always prints the cap notice when it reaches the cap.
- `--chunk-size` (1 through 1,048,576) is an experimental test control. It changes input buffering only.
- Diagnostics and partial output on malformed input are not byte-compatible with Node. Errors include a byte offset but not line/column. Offsets describe parser progress, not necessarily the first bad byte. Output already written, including buffered prefixes flushed on error, cannot be retracted. Consumers must check exit status.
- A stdout write or final flush reporting `BrokenPipe` or `NotConnected` (including OS `ENOTCONN`) cancels quietly with exit 0. Cancellation stops further reads once the write fails; buffered output can delay detection. The unread tail is not validated. Input/read failures, explicit input-file failures, and other output errors still fail. Search with `--exit-status` uses exit 2 for these errors; without it, errors exit 1. No atomic output destination is offered; shell redirection has ordinary shell truncation behavior.
- Independent review found no blocking parser safety defect in its tested surface. No cross-platform release, broad fuzzing campaign, or security certification has been completed. macOS arm64 is the only measured target. Harnesses require Python 3 and Unix; the deep comparison uses POSIX alarms.

## Reproduce validation

```sh
(cd src/packages/cli && npm ci --no-audit --no-fund && npm run build)
cargo fmt --manifest-path native/Cargo.toml -- --check
cargo clippy --manifest-path native/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path native/Cargo.toml
cargo build --release --manifest-path native/Cargo.toml
python3 native/scripts/cli_compat.py
python3 native/scripts/compat.py
python3 native/scripts/search_compat.py
python3 native/scripts/unflatten_compat.py
python3 native/scripts/bench.py --output native/results-local.json
```

`compat.py` compares stdout bytes against the locally built current TypeScript CLI: 48 valid fixtures at four input chunk sizes (192 comparisons), 27 malformed fixtures rejected at three chunk sizes, four capped comparisons, and unsupported-option checks. Fixtures cover number lexemes, Unicode, surrogate combinations, repeated/special keys, a 1 MiB string, a 70 KiB key and number, deterministic random inputs, and UTF-8/escape splits around 64 KiB. Malformed tests compare failure status, not diagnostic wording or partially emitted prefixes.

One additional comparison streams the full 50,000-depth outputs side by side and compares every byte. Its 100,001-byte input expands to 3,750,575,009 output bytes; nothing is retained on disk, and only two 1 MiB comparison buffers are retained. It has a 60-second deadline. This is the only large-output check; the performance suite does not run a 1 GB input sweep. Rust tests also verify token/path/depth limits, interrupted and failed reads, short/failed writes, buffer reuse, and that a cap makes no subsequent read call. Native CI runs formatting, lint, release tests and compatibility on Linux and macOS. Recorded validation is in `compatibility.json`.

## Measured result

The follow-up [string scanning performance step](performance-string-scan.md) records a measured optimization against PR114, with artifact hashes, focused profiles and before/after samples. The table below remains the original historical measurement.

`measurements.json` retains the original five samples per case, commands, versions, source hash, and the baseline CLI tree. This historical receipt did not hash executables, so it cannot establish their build provenance. Future `bench.py` runs rebuild both CLIs and record build commands, dirty state, the native executable hash and all emitted JavaScript hashes. Runs were serial with rotating tool order, a warm file cache, and stdout redirected to `/dev/null`, on Apple M5 Pro / macOS 26.6.1 arm64. Node v22.23.1 used the CLI at `90a9734e97abad9bac51cf81bacffe99b9f5d54f`; fastgron was 0.7.7 and jq 1.8.2. Wall time includes launch and the `/usr/bin/time` wrapper. These are local experimental results on a shared machine, not isolated lab results or general product claims.

Median wall milliseconds / peak RSS MiB (median of per-run maxima):

| Input / operation | Native | Node | fastgron |
| --- | ---: | ---: | ---: |
| Records, 1 MiB | 8.49 / 1.69 | 47.17 / 59.75 | 8.14 / 9.97 |
| Records, 10 MiB | 41.56 / 1.69 | 109.82 / 69.39 | 25.60 / 29.27 |
| Records, 32 MiB | 128.49 / 1.69 | 263.50 / 76.42 | 72.01 / 76.42 |
| Tiny startup | 3.96 / 1.59 | 33.41 / 51.88 | 5.72 / 5.77 |
| Cap 10, 32 MiB file | 4.46 / 1.64 | 35.07 / 54.11 | Not measured |
| Single 8 MiB string | 11.05 / 11.69 | 46.69 / 84.78 | 8.43 / 21.89 |

On 32 MiB records this prototype takes 2.05x less time than Node and about 45x less RSS, but takes 1.78x as long as fastgron. Capped startup takes 7.86x less time than Node. It addresses the native startup and memory disadvantages on these fixtures; sustained throughput still trails fastgron. The long-string case also remains slower than fastgron.

The harness byte-checks the record schema across Node, native, and ordinary fastgron before timing. Its records use small integer numbers, ASCII identifiers, and no escapes, so this performance comparison does not imply fastgron has the numeric or Unicode contract above. Fastgron `--stream` changes paths/root structure on the sample array and is excluded. There is no equivalent fastgron cap command in this harness. jq `--stream -c .` results are recorded separately as parser-event context: jq emits a different format and does not perform gron flattening, so those times are not a flatten ranking.

## Path to production and packaging

1. Independently review grammar, normalization, resource bounds, error handling, and cancellation; extend differential fuzzing with arbitrary invalid bytes and resource-boundary fixtures. Add CI on Linux/macOS and all intended architectures.
2. Profile record throughput against fastgron. The next concrete optimization target is scanning bare tokens and reducing per-field parser/output overhead; keep the byte-comparison gate. Consider SIMD scanning only after profiling demonstrates the benefit and validation remains strict.
3. Decide the supported native CLI surface and error/cap contracts. Atomic `--output` remains outstanding before a usable preview release. Help/version and output-disconnect cancellation are implemented. Decide whether token/path limits should be configurable.
4. Ship an explicitly named experimental binary in checksummed GitHub release assets for each verified target. Cross-compile and test macOS arm64/x64 and Linux arm64/x64, including libc compatibility. Document signing and provenance. Keep the npm entry point unchanged.
5. Only after independent review and broader measurements, consider a separate opt-in npm launcher/platform package. Installation and execution failures must be explicit; never silently select the TS runtime while presenting native performance. Unicode-insensitive search, unflatten, and sort remain separate implementation decisions.
