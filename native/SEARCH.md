# Experimental native literal search

This adds fixed-string search to the standalone Rust experiment. The npm entry point is unchanged. It shares the existing parser and resource bounds; `src/search.rs` owns matching, CLI options, and output. `main.rs` exposes a callback for validated assignment parts so parser scanning optimizations can remain independent.

```sh
native/target/release/gronify-native search input.json gateway
native/target/release/gronify-native search -c --count input.json gateway
native/target/release/gronify-native search --max-count 10 --exit-status input.json gateway
printf '{"é":"É"}' | native/target/release/gronify-native search -c É
```

## Supported contract

- `search [options] [file] term`. One positional argument reads stdin; two mean file and term. `-` explicitly selects stdin. `--` ends option parsing, including for terms beginning with a dash. Empty terms match all emitted lines (including container assignments). Empty terms with a file work here; the Node CLI currently has a truthiness bug selecting the file for that case.
- Literal substring matching over the entire normalized gron assignment: path, ` = `, and value, excluding terminating LF. No raw-JSON prefilter or numeric conversion. Duplicate keys, container lines, and numeric lexemes retain parser behavior. Escaped source strings match their normalized output form.
- Default matching accepts ASCII terms only and folds ASCII case. As in Node's legacy, non-Unicode `/i` matcher, Kelvin sign and long s do not fold to ASCII K/S. ASCII patterns cannot match UTF-8 continuation bytes.
- `-c` / `--case-sensitive` accepts all UTF-8 terms and compares exact bytes. Non-ASCII insensitive terms fail explicitly before reading input, with a message explaining the unsupported JavaScript case mapping. Rust Unicode case folding would not be a compatible substitute for Node's UTF-16 legacy regex behavior, so this implementation makes no such approximation.
- `--count` prints the number of matching assignments and LF. `-m N` / `--max-count N` caps matches, including counts, then stops parsing/reading. N must use canonical positive decimal syntax and be a JavaScript safe integer. No validation of the unread tail; up to one input chunk can already have been read ahead.
- `--exit-status`: 0 for a match, 1 for no match, 2 for errors. Without it, successful no-match searches exit 0 and errors exit 1. Counts still print `0` for no match. Stderr wording and partial output on errors are not Node-compatible. The cap notice is always emitted at the cap, even if it coincides with the final assignment; Node can suppress it when it knows input is exhausted.
- `--chunk-size N` retains the experiment's 1..1048576 input-buffer test control.

Regex, inversion, sorting, colors, pretty formatting, atomic output files, URL inputs, combined short flags, `--option=value` are unsupported. Unknown options fail explicitly. Stdout uses blocking writes with a 64 KiB buffer, so a stalled pipe stalls the producer. Stdout broken-pipe and not-connected errors cancel quietly with exit 0, including with `--exit-status` and on the final count flush. Other output errors still fail. Cancellation is detected on a write/flush, after which no further input is read. `--help` / `-h` and `--version` print experimental CLI information without reading input; after `--` they are positional arguments. Shell redirection has normal shell truncation semantics.

The matcher uses a precomputed byte skip table. Search retains one reusable assignment buffer in addition to the parser's token/path buffers and container stack. Memory therefore scales with largest assignment/token/path/depth, not record count. Buffers retain high-water capacity; giant scalar and deep-path memory costs remain. There is no whole-document or whole-output buffer.

## Validation

```sh
cargo fmt --manifest-path native/Cargo.toml -- --check
cargo clippy --locked --manifest-path native/Cargo.toml --all-targets -- -D warnings
cargo test --release --locked --manifest-path native/Cargo.toml -- --test-threads=1
cargo build --release --locked --manifest-path native/Cargo.toml
npm ci --prefix src/packages/cli --no-audit --no-fund
npm run build --prefix src/packages/cli
python3 native/scripts/compat.py
python3 native/scripts/search_compat.py
python3 native/scripts/search_bench.py
```

Local validation passed formatting, clippy, all 14 release tests, the existing 192 flatten byte comparisons and malformed/cap/depth checks, and 432 search byte/status comparisons at 1-byte and 64 KiB chunks. Additional search checks cover non-ASCII insensitive rejection, unsupported flags, invalid caps/JSON, early caps before malformed tails, long terms/lines, file input and paused pipe consumers. The Linux/macOS native CI now runs both compatibility scripts. No new CI result is implied by local results.

## Focused measurements

`search-measurements.json` records all samples, commands, executable/source/Node-JS hashes, versions, and dirty working-tree provenance. These measurements used the merged main parser plus this search sink, before the separate scanner/emitter optimization. Three serial samples per case rotated tool order with warm file cache and stdout sent to `/dev/null`. Launch and `/usr/bin/time` overhead are included. The integrated full benchmark was reported active on the shared machine; contention was not isolated. These results are provisional local measurements.

The small fixture is approximately 1 KiB. The 32 MiB fixture repeats ASCII records with small integers. Before timing, full output hashes were checked equal across native, Node, and fastgron `-F` (with `-i` for insensitive mode). Count and cap comparisons include only native and Node because fastgron lacks equivalent flags. This fixture does not establish fastgron's numeric or Unicode compatibility.

Median wall milliseconds / peak RSS MiB:

| Fixture / operation | Native | Node | fastgron-F |
| --- | ---: | ---: | ---: |
| Small, sensitive | 4.23 / 1.59 | 35.62 / 52.20 | 5.60 / 5.77 |
| Small, insensitive | 3.53 / 1.59 | 34.23 / 52.06 | 5.55 / 5.77 |
| Small, count | 4.25 / 1.59 | 35.01 / 52.11 | Not measured |
| Small, cap 10 | 4.55 / 1.59 | 34.42 / 52.05 | Not measured |
| 32 MiB, sensitive | 134.70 / 1.69 | 200.24 / 89.73 | 87.39 / 76.44 |
| 32 MiB, insensitive | 135.18 / 1.69 | 203.01 / 89.45 | 109.05 / 76.42 |
| 32 MiB, count | 133.85 / 1.64 | 212.21 / 89.30 | Not measured |
| 32 MiB, cap 10 | 4.55 / 1.64 | 35.65 / 54.23 | Not measured |

On 32 MiB sensitive search, native took 1.49x less wall time and about 53x less peak RSS than Node, but 1.54x as long as fastgron-F. Insensitive search took 1.50x less time than Node and 1.24x as long as fastgron-F. The sustained speed gap to fastgron remains; the low memory use and startup gains do not establish production completeness. General Unicode insensitive matching, adversarial matcher performance, other record shapes, and supported release architectures need further work and measurement.
