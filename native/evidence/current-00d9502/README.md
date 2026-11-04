# Current-source benchmark receipts

This campaign measures runtime source at `00d950204b4d60e510870c3bf2d86718924d6832`. The working tree also contains benchmark and landing-page edits. The source hashes in each receipt identify the code actually measured; package version `1.2.0` alone does not identify this source build or the published npm release.

The default CLI results are in [`landing-page/src/app/benchmark-results.json`](../../../landing-page/src/app/benchmark-results.json), with the generated report in [`src/packages/cli/BENCHMARKS.md`](../../../src/packages/cli/BENCHMARKS.md). The separate experimental-native comparison is in [`native-results.json`](native-results.json).

## Reproduce

From the repository root:

```sh
npm ci --no-audit --no-fund --prefix src/packages/cli
npm run build --prefix src/packages/cli
cargo build --release --locked --manifest-path native/Cargo.toml
```

Then run the suites serially, without simultaneous builds or tests:

```sh
(cd src/packages/cli && npm run bench:compare -- --runs 3 --timeout 60 --max-rss-gb 8 --budget 45)
python3 native/scripts/bench-current.py --output native/evidence/current-00d9502/native-results.json
cp native/evidence/current-00d9502/native-results.json landing-page/src/app/native-benchmark-results.json
python3 native/evidence/current-00d9502/verify.py
node scripts/validate-metadata.mjs
```

The campaign used `npm ci --no-audit --no-fund` followed by `npm run build` with `src/packages/cli` as the working directory, and the Cargo command above. Node tests, native tests and compatibility suites completed before the timing window. Agents limited their concurrent work to text edits and light inspection during timings. Other applications and operating-system activity on this shared Mac were not controlled.

## What the receipts establish

- Both suites report medians and retain individual trials. RSS is the median of per-run peak resident memory, aggregated independently from elapsed time. It is neither allocated memory nor a maximum across all trials.
- The default suite records runtime source, built JavaScript, external executable and harness hashes. `bench-compare.executed.mjs` preserves the exact harness loaded for this campaign. Later methodology-text fixes and additional future-run guards live in the normal script; the archive is evidence, not a standalone relocatable command. To reproduce the exact executed harness, copy it to `src/packages/cli/scripts/bench-compare.mjs` in a separate checkout before running; its paths are resolved relative to that original location. The normal script includes later presentation fixes and additional end-of-run artifact guards.
- Default-suite correctness checks cover small representative fixtures. Search counts are checked on each timed workload. Full timed flatten/unflatten output streams are discarded; stable piped byte counts do not prove full-output equality. Input hashes identify generated fixtures.
- The native suite checks full output hashes before timing flatten, search, cap and deep workloads. Unflatten checks the full parsed JSON against the source, plus byte equality between native and Node. Fastgron sorts keys and changes whitespace in unflatten, so its comparison is semantic on this integer-only fixture.
- The native suite uses repeated ASCII records, while the default suite uses generated event records with Unicode, arrays and varied values. Ratios across the two suites are not valid.
- Native remains an experimental subset, invoked through its own executable. Its timings do not describe the npm command. Fastgron is deliberately not run on the native suite's 1 GiB fixture to bound host memory; the three-way comparison stops at 100 MiB.
- Timeout, memory-limit, validation-failure and skipped rows are retained. Skipped results are not measured failures. A memory watchdog can miss a brief peak; the default suite also excludes completed runs whose measured process peak exceeds the budget. Pipeline RSS is the largest process peak, not the sum of all processes.
- `jq --stream` and jaq emit different formats and perform different work. They provide parser-event context, not interchangeable gron-output rankings. Sorting, compact JSON and early-exit behavior also differ between tools.

`verify.py` accepts a harness hash matching either the archived invocation or the maintained script, so a documented rerun can be verified too. It also requires the landing-page native receipt mirror to match byte-for-byte. The repository metadata check enforces that mirror equality in CI.

`verify.py` checks receipt arithmetic and retained source/build hashes without rerunning timing. It cannot rehash output streams that were discarded or establish isolated-host reproducibility.

## Recorded outcomes

Both suites completed with exit status 0. The default suite took 18 minutes and contains 32 workloads: 149 successful tool/workload results, 30 explicit skips, 11 failures and 2 timeouts. All default Node correctness checks and timed workloads passed. The native suite completed all 13 workloads; every measured full-output/semantic gate passed. The failures in the default comparison belong to external tools and remain in the published receipt.

The event-record JSON is 1,049,407,501 bytes. Its unflatten input is 2,404,194,438 bytes of gron statements. These are medians of three trials:

| Event-record operation | Source-build Node | Comparator |
| --- | --- | --- |
| Flatten to /dev/null | 3.8326 s; 84,115,456 bytes RSS | fastgron: 1.7773 s; 1,991,639,040 bytes RSS |
| Search, count matches | 4.4652 s; 78,249,984 bytes RSS | fastgron -F piped to wc: 2.1607 s; 1,991,639,040 bytes RSS |
| Unflatten to /dev/null | 5.5601 s; 105,709,568 bytes RSS | fastgron: 5.9258 s; 8,008,925,184 bytes RSS |
| Search, first 10 matches | 0.0404 s; 60,735,488 bytes RSS | fastgron -F piped to head: 1.3347 s; 1,991,606,272 bytes RSS |

The unflatten time difference is about 6.6%, a modest shared-host difference; the memory contrast is much larger. Default gron and unsorted gron hit the memory guard on the large flatten fixture. JaQ's large flatten result was skipped by the projection rule, not measured as a failure. The complete report retains the smaller inputs and every unsuccessful result.

The 50,000-level Node document emitted 2,500,550,009 bytes through a pipe in 0.5425 s, versus 0.0670 s with output discarded. The piped result is the useful counterpart to the discard-sink timing.

Native uses a different repeated-ASCII-record fixture, so these results must not be compared directly with the event-record table:

| Native-suite input | Tool | Median seconds | Median peak RSS bytes |
| --- | --- | ---: | ---: |
| tiny-startup-flatten; 120 bytes | native | 0.0036 | 1,687,552 |
| tiny-startup-flatten; 120 bytes | node | 0.0318 | 54,640,640 |
| tiny-startup-flatten; 120 bytes | fastgron | 0.0051 | 6,045,696 |
| records-100MiB-flatten; 104,857,565 bytes | native | 0.1832 | 1,785,856 |
| records-100MiB-flatten; 104,857,565 bytes | node | 0.4857 | 80,510,976 |
| records-100MiB-flatten; 104,857,565 bytes | fastgron | 0.2059 | 232,947,712 |
| records-1GiB-flatten; 1,073,741,761 bytes | native | 1.8379 | 1,785,856 |
| records-1GiB-flatten; 1,073,741,761 bytes | node | 4.5840 | 82,100,224 |
| records-32MiB-unflatten; 80,096,270 bytes | native | 0.1981 | 1,835,008 |
| records-32MiB-unflatten; 80,096,270 bytes | node | 0.2292 | 96,780,288 |
| records-32MiB-unflatten; 80,096,270 bytes | fastgron | 0.2254 | 321,126,400 |

The native timing harness is preserved as `bench-current.executed.py`; copy it to `native/scripts/bench-current.py` in a separate checkout to reproduce that exact invocation. The maintained script fixes version capture for future runs. The raw native `versions.fastgron` field is intentionally empty because that invocation captured stdout while fastgron printed its version to stderr. `versionSupplement` records a post-run combined-output version check and the matching executable hash; no timing values were changed. The landing page keeps a byte-identical mirror of the native receipt because its build does not import JSON outside the package root.

Console transcripts retain the run output with trailing whitespace normalized for repository checks. Raw measurements remain in the JSON receipts; executed harness snapshots retain their original bytes.
