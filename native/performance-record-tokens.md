# Borrow buffered record tokens

This step starts at main `56054a91c83e306b7d9384a95a12bdb1642bb5f0`. It reduces record traversal time in both flatten and literal search. It does **not** eliminate the fastgron flatten gap.

Complete plain-ASCII strings and delimited bare tokens can borrow the current input buffer until the synchronous assignment callback returns. Keys copy directly into the path. Bare tokens still use the existing exact number grammar; no numeric conversion occurs. Fragmented tokens, escapes and Unicode retain the existing scanners and normalization. Whitespace handling is inlined. The reusable token vector already avoided most per-token allocations before this change; the gain is from avoiding copies and buffer bookkeeping, not from removing an allocation on every token.

The parser still uses `root_started: bool`. Path/depth/token checks, array overflow checks, document order, callback error propagation and early caps remain intact. Bare tokens at a buffer boundary must refill before acceptance: a cap cannot turn a split `truex` into valid `true`. Search implementation and unflatten are untouched.

## Profiling before edits

The existing diagnostic driver was compiled from the untouched baseline with `rustc --edition=2024 -O -g -C force-frame-pointers=yes -A dead_code`, then sampled with macOS `sample PID 5 1 -file sample.txt` while repeating the 32 MiB record fixture 150 times per mode. The numeric shape was separately sampled for three seconds with 80 repetitions per mode. Raw stacks are in [measurements-records](measurements-records/). The driver loads input once; it is not the production CLI and this symbolized build does not use the release LTO settings.

In the mixed-record sample, string scanner calls account for roughly a third of steady-state samples, with substantial time copying tokens. Number validation is much smaller. The numeric sample spends more time in the inlined parser, with smaller separate number-validator and string-scanner stacks. Inlining prevents clean attribution between parser state, bare-token accumulation and path construction. There is no evidence here to justify a path cache or schema-specific parser.

Baseline diagnostics also separate sink-only parsing from buffered output into an opaque counting sink. These are compiler-specialized variants, **not additive phase timings**. They establish that traversal remains expensive without output; they do not isolate the exact emitter cost. The profile motivated borrowing buffered tokens rather than repeating the previous bulk-copy or combined-write experiments described in `performance-string-scan.md`.

## Trials

Seven rotated serial samples per shape/mode, fixed native artifacts, full output hashes checked against baseline and fastgron. Exploration receipts are in `measurements-records/trials.json`; exploratory source snapshots and raw receipts are retained under `/tmp/gronify-record-parser-evidence` on the measurement host.

- Borrowed ASCII strings: mixed-record flatten 104.06 → 94.21 ms; numeric-heavy flatten 139.48 → 137.89 ms. Too little benefit on numeric records by itself.
- Plus inline whitespace: mixed 104.42 → 90.23 ms; numeric 137.85 → 132.63 ms.
- Plus borrowed bare tokens: mixed 104.24 → 81.17 ms; numeric 138.48 → 93.55 ms. This validates removing token copies/bookkeeping rather than bulk copying the same bytes into the vector.
- Additional inline annotations on both token helpers: mixed 103.58 → 81.24 ms; numeric 137.80 → 92.77 ms. No useful additional gain; annotations discarded.

The final source also preserves consumed offsets for invalid borrowed bare tokens and explicitly clears the fallback token buffer. A longer Unicode diagnostic then exposed a small repeatable slowdown in the borrowed-path candidate. Keeping the normalizing scanner out of line with `#[inline(never)]` avoids inlining that fallback into the borrowed path. Only final-source receipts below are used for the retained result.

## Repeated final measurements

Two independent serial passes, seven and eleven samples per case, warm input cache, rotating executable order, stdout discarded. Both passes rebuilt identical fixed artifacts (hashes match between passes), with source/module, fixture, executable and harness hashes in `final1.json` and `final2.json`. Another benchmark was reported active on this shared macOS arm64 host. These are repeatable local observations, not isolated-host confidence intervals or universal performance claims.

Second-pass medians, milliseconds (32 MiB per shape):

| Shape | Operation | Before | After | fastgron |
| --- | --- | ---: | ---: | ---: |
| Mixed records | flatten | 104.83 | 81.12 | 74.88 |
| Mixed records | sensitive search | 111.93 | 84.63 | 85.96 |
| Mixed records | insensitive search | 112.43 | 86.63 | 107.95 |
| Numeric records | flatten | 137.29 | 91.71 | 70.98 |
| Numeric records | sensitive search | 145.63 | 97.42 | 82.28 |
| Numeric records | insensitive search | 149.46 | 97.65 | 104.96 |

Both passes show roughly 22–24% lower mixed-record time and 33–35% lower numeric-record time. Native peak RSS stays at 1.6875 MiB for these cases; both native executables are 352,480 bytes. Mixed-record count-only search falls from 109.73 to 82.57 ms in the second pass.

The retained parser is still about 8% slower than fastgron for mixed-record flatten and 29% slower for numeric-record flatten in the second pass. Sensitive search is near parity only on mixed records; numeric sensitive search still trails. Insensitive search is faster on these ASCII fixtures. Output hashes agree for all participating tools, but these fixtures do not establish fastgron's equivalence on Gronify's full Unicode/numeric contract. Fastgron 0.7.7 writes its version to stderr; the harness logs capture it, while its receipt's stdout-only version field is empty. Its executable SHA256 is retained.

Long ASCII, Unicode, escape-heavy strings, tiny input and caps are included in both receipts. Long-ASCII flatten moves 5.62 → 5.55 ms and 5.42 → 5.45 ms; this small overhead is consistent with trying the buffered scan before fallback. Unicode, tiny and cap differences change direction between passes or modes. No broad fallback regression is established; sub-millisecond startup differences remain uncertain. The borrowed path may rescan a buffered prefix on fallback, bounded by the configured input chunk.

The pre-outline in-process diagnostics are retained in `diagnostics.json`, with their source hashes. Buffered-emission time per iteration fell from 70.43 to 51.52 ms on mixed records and 82.70 to 60.85 ms on numeric records. These results motivated retaining the borrowed-token approach, but are not timings of the final source. `fallback-before-outline.json` records the longer Unicode/escape checks that prompted outlining; `fallback-final.json` records the final fallback checks in both before/after orders. Final Unicode buffered-emission times are 0.778 → 0.736 ms and 0.765 → 0.777 ms per iteration (400 repetitions); escapes are 3.236 → 3.082 ms and 3.252 → 3.274 ms (200 repetitions). The slowdown no longer repeats across orderings; small code-layout and host effects remain unresolved.

## Validation and remaining work

`cargo fmt -- --check`, locked clippy (`--all-targets -- -D warnings`), locked release build and all 19 release tests pass. New tests check exact mixed borrowed/fallback output at every chunk size, malformed bare suffixes under a cap, callback errors, and required boundary reads. Existing exhaustive byte/lane, numeric/token/path/depth, UTF-8, surrogate, write-failure and cap tests remain.

Both unchanged compatibility suites pass: 192 flatten byte comparisons, 27 malformed fixtures at three chunk sizes, four cap comparisons and the complete 3,750,575,009-byte depth-50,000 comparison; 432 search byte/status comparisons plus errors, caps, long lines, file input and backpressure. Logs are committed alongside receipts.

The next target is the remaining inlined parser/path work. Obtain source-level CPU attribution with production callbacks before attempting comma/state batching or incremental array-index formatting. This PR deliberately retains a general parser rather than adding an unmeasured record-schema shortcut. No merge or watch is requested.

## Reproduce

```sh
python3 native/scripts/bench-records.py --runs 7 --output-dir /tmp/record-pass-1
python3 native/scripts/bench-records.py --runs 11 --output-dir /tmp/record-pass-2
cargo fmt --manifest-path native/Cargo.toml -- --check
cargo clippy --locked --manifest-path native/Cargo.toml --all-targets -- -D warnings
cargo test --release --locked --manifest-path native/Cargo.toml
cargo build --release --locked --manifest-path native/Cargo.toml
npm ci --no-audit --no-fund --prefix src/packages/cli
npm run build --prefix src/packages/cli
python3 native/scripts/compat.py
python3 native/scripts/search_compat.py
```

Each output directory must be new. The benchmark retains its source snapshots, binaries, fixtures and raw samples. `profile.py SOURCE.rs FIXTURE.json --rounds 25` reproduces the separate in-process diagnostics, with source hashes and results retained in the diagnostic receipts.
