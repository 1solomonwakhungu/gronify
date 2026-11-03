# Buffered lookup and strict token prefixes

Base: `2017be1b4c4f20e070473c1be22b0f27c983f2a8`. Only `native/src/main.rs` changes runtime behavior. Shell helpers, builder dispatch, search and unflatten implementations are untouched.

## Integration with current main

While this PR was being prepared, #122 landed as `5e0cd9d` with CLI help and quiet pipe cancellation. CI's merge build caught the new test comparing the new `cli::Error` directly with a string. The branch now includes that main revision, and the assertion compares the error's display text. CLI helpers and dispatch remain as main provides them. The original failing CI log is retained.

All 32 integrated release tests, formatting, Clippy and the three parser compatibility suites pass. The additional `cli_compat.py` suite passes help/version, exit status, head-close, open-stdin and final-flush checks. Current validation logs describe this integrated source; pre-integration measurements remain below as historical evidence.

A fresh eleven-sample serial pass compares immutable artifacts of `5e0cd9d` and the integrated candidate, with the same shared-host caveat. Latest medians (ms):

| Shape | Operation | Current main | Candidate | fastgron 0.7.7 |
| --- | --- | ---: | ---: | ---: |
| records | flatten | 81.30 | 61.06 | 69.32 |
| records | sensitive | 86.81 | 67.53 | 81.97 |
| records | insensitive | 88.21 | 68.43 | 101.22 |
| numeric | flatten | 94.32 | 69.45 | 70.77 |
| numeric | sensitive | 100.84 | 74.75 | 81.35 |
| numeric | insensitive | 101.59 | 75.82 | 102.48 |

Mixed flatten improves about 25% and numeric about 26% against current main. Fastgron's median advantage is absent on both fixtures; its numeric result is now only about 1.3 ms behind, so near-parity/noise is the defensible interpretation for that smaller comparison. The mixed-record lead is larger. Neither comparison establishes a universal win. The final integrated receipt is `integrated.json`; the previous `final.json` is explicitly pre-integration.

Integrated validation also repeats the 884 exact malformed/chunk/cap comparisons. Two more 17-sample fallback passes use the integrated source: escaped and Unicode flatten differences change direction; insensitive escape search improves both times. ASCII insensitive search is 18.67 → 19.22 ms in one pass and 19.23 → 19.32 ms in the second, so a small effect remains unresolved rather than being erased from the record. All larger-case output hashes match. Integrated record peak RSS is 1.703125 → 1.71875 MiB (+16 KiB); count/caps increase by 32 KiB. Tiny/cap integrated medians differ by roughly 0.03–0.13 ms. These small timings are not a zero-regression guarantee.

## Retained change

`peek` now calls a separate non-inlined refill function. The buffered lookup becomes small enough to inline; interrupted reads, errors, EOF and offset updates retain their existing behavior. The file-backed baseline profile had substantial samples in out-of-line `peek`, despite its inline hint.

Complete buffered numbers validate their grammar while finding the token end. Buffered true/false/null use exact prefix comparisons. Both paths require a following buffered delimiter before borrowing any bytes. A malformed suffix, incomplete grammar or buffer boundary goes through the existing scanner and exact validator. The `number` predicate uses the same prefix grammar and requires whole-slice consumption. There is no floating-point conversion, altered numeric spelling, unsafe code or architecture intrinsic.

Root completion remains boolean. Token/path/depth bounds, array overflow, callbacks, caps, UTF-8 and output error handling remain intact. A new reader test alternates interruptions with single-byte reads and checks both clean EOF and an injected read failure, including exact emitted bytes and consumed offsets.

## Profiling and discarded trials

The baseline diagnostic driver and raw samples are in [measurements-parser-followup](measurements-parser-followup/). The first in-memory diagnostic sample exposed bare scanning and number validation. A second driver uses `Box<dyn Read>` over a file, the production flatten callback, and a 64 KiB `BufWriter<File>` writing to `/dev/null`. It repeats a 32 MiB fixture 100 times, compiled with release optimization/LTO plus symbols/frame pointers, and sampled for three seconds after a 300 ms startup delay. This is diagnostic attribution with a file writer, not the production stdout-lock binary or an additive decomposition. Its inlined parser work cannot be reliably assigned to individual path/state source lines.

The file-backed numeric profile shows out-of-line `peek` as a substantial cost, alongside buffered output and parser work. This justified refill extraction. No evidence justified an incremental array-index cache or a more complex path formatter, so neither was added. Output batching had already been explored in the preceding work; this change leaves emission alone.

Each trial has retained raw timing/RSS samples, hashes and output checks in `trials.json`, plus a source patch relative to the base. Full immutable source trees, executables and fixtures remain under `/tmp/gronify-parser-followup-*` on this host.

- Number-prefix only, with and without an inline hint: little mixed-record benefit; roughly 1–2 ms numeric benefit. Not retained alone.
- Literal prefixes added: still no consistent mixed-record gain by themselves.
- Comma fall-through, with and without token changes: no useful flatten improvement across both shapes. Discarded.
- Refill extraction alone: mixed flatten about 79 → 64 ms; numeric about 91 → 73 ms. Repeated independently. Numeric remains close to fastgron, sometimes slightly behind.
- Refill plus strict token prefixes: mixed stays about 64 ms and numeric falls to about 70 ms. Retained after repeated checks. The incremental number benefit is primarily numeric; refill extraction provides the cross-shape improvement.

The original branch had two unmerged CLI commits. It was preserved; this branch starts from fetched main. No shell/helper changes were incorporated.

## Pre-integration measurements

Serial rotating executable order, warmed files, stdout discarded, moderate 32 MiB records. The combined candidate was measured in a seven-sample pass, an eleven-sample pass, and another eleven-sample pass after Clippy's syntax-only correction. The final receipt records exact source/module/executable/fixture hashes and commands. Binaries built at different absolute paths can have different hashes; receipts identify each measured binary rather than assuming identity. Final source hashes match the working implementation.

An integrated 1 GB benchmark agent was reported active on this shared macOS arm64 host. Our own measurement processes ran serially; the initial exploratory diagnostic may overlap early number-trial preparation, and is not final ranking evidence. There are large scheduling outliers, including a 721 ms baseline numeric sample. Medians below are local observations, not isolated-host confidence intervals, 1 GB results or universal performance claims.

Final eleven-sample medians in milliseconds:

| Shape | Operation | Base | Candidate | fastgron 0.7.7 |
| --- | --- | ---: | ---: | ---: |
| records | flatten | 78.95 | 63.55 | 72.53 |
| records | sensitive | 84.80 | 67.98 | 86.46 |
| records | insensitive | 85.70 | 68.47 | 107.37 |
| numeric | flatten | 92.95 | 70.36 | 74.09 |
| numeric | sensitive | 97.06 | 75.67 | 82.72 |
| numeric | insensitive | 98.64 | 75.71 | 110.17 |

The mixed flatten advantage is clearly reversed in these repetitions. Numeric flatten also favors the candidate in all three combined passes (about 70.2–70.4 ms versus fastgron 72.7–74.2 ms). Individual samples overlap, so the smaller numeric lead should not be described as universally outside noise. No remaining fastgron median advantage was observed on these two fixtures. Full output hashes agree for every participating case; this does not establish equivalence of fastgron's broader numeric/Unicode contract.

Native record peak RSS stays bounded: baseline 1.6875 MiB, candidate 1.6875–1.71875 MiB across modes, a maximum 32 KiB increase. No input-size-scaled allocation was introduced. Final executable size is recorded in the receipt; code growth and page accounting are not evidence of allocation growth.

## Fallbacks and startup

All passes include long ASCII, Unicode, escapes, tiny input and caps. Small differences change direction. Final cap-flatten startup is 4.09 → 4.41 ms, whereas the preceding eleven-sample combined pass is 4.16 → 4.10 ms; tiny final differences are about 0.01–0.03 ms. A startup regression is not repeatably established.

One small escape-heavy insensitive-search pass was slower, so two additional serial 17-sample passes used 16 MiB ASCII, Unicode and escape fixtures, with alternating before/after order and output hashes. Escaped flatten improves in both (62.47 → 61.78 ms, then 61.27 → 60.43 ms); escaped insensitive search also improves (69.15 → 67.50, then 68.91 → 67.43). Unicode flatten changes direction (19.30 → 20.03, then 19.69 → 19.17); Unicode search is within about 0.1 ms. ASCII cases are similar or faster. These checks do not establish a repeatable long-string/escape slowdown; small shared-host effects remain unresolved. Both receipts are retained, including the slower observations.

## Pre-integration validation

- Formatting and locked all-target Clippy with warnings denied pass. The initial collapsible-if failure is retained; the final correction was rebuilt and remeasured.
- All 27 locked release tests pass, including the interruption/read-error test and existing byte-lane, UTF-8, bounds, callback, cap and boundary checks.
- Flatten compatibility: 192 byte comparisons, 27 malformed fixtures at three chunk sizes, four cap comparisons, and the entire 3,750,575,009-byte depth-50,000 output.
- Search compatibility: 432 byte/status comparisons plus Unicode rejection, errors, caps, long lines, files and backpressure.
- Unflatten compatibility: 159 exact-output ordered comparisons plus fallback and malformed rejection.
- Additional baseline/candidate differential: 884 exact status/stdout/stderr comparisons, including malformed numeric/literal suffixes, caps, invalid UTF-8, short chunks, and every position of selected tokens across 64 KiB boundaries. These use the final measured artifact hashes.

## Reproduce

```sh
python3 native/scripts/bench-records.py --base 2017be1 --runs 11 --output-dir /tmp/new-parser-followup-run
cargo fmt --manifest-path native/Cargo.toml -- --check
cargo clippy --locked --manifest-path native/Cargo.toml --all-targets -- -D warnings
cargo test --release --locked --manifest-path native/Cargo.toml
cargo build --release --locked --manifest-path native/Cargo.toml
npm ci --no-audit --no-fund --prefix src/packages/cli
npm run build --prefix src/packages/cli
python3 native/scripts/compat.py
python3 native/scripts/search_compat.py
python3 native/scripts/unflatten_compat.py
```

The supplementary differential/fallback scripts retain this run's absolute artifact paths. Adjust those paths for a new run. To rebuild the diagnostic driver, stage `production.rs` alongside the base revision's `search.rs`, `unflatten.rs` and `boundary_tests.rs`, and use the command in `provenance.json`. This PR is not merged or watched.
