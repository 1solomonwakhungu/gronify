# Native string scanning performance step

This change builds on PR114 at `8cc14eca3216a2283f45c2e0623e4faf80339591`. It changes only string scanning in production code. The original PR and its review head remain unchanged.

## Implementation and safety

`Input::string` skips plain ASCII in eight-byte words loaded with safe `u64::from_le_bytes` copies. High-bit masks detect controls, quotes, backslashes and non-ASCII bytes. Little-endian lane order and the first marked byte determine the safe prefix: subtraction can propagate a borrow into later lanes, but cannot hide the first stopping byte. The existing scalar loop handles the remaining chunk, including escape state carried across reads.

The scan accumulates scalar bytes' high bits and records escapes. Only a string proved to contain plain ASCII bypasses `normalize`; every non-ASCII or escaped string still goes through UTF-8 validation and the existing escape/UTF-16 normalization. Raw controls are rejected before that shortcut. No unsafe code, dependency, additional heap allocation, numeric conversion, parser-state change, output change, resource-limit change, or cap/read-ahead change is introduced.

Exploration also tried bulk bare-token scanning and combining output writes. Neither established a useful gain in the focused profiles, so both were reverted. A per-byte ASCII predicate increased fallback overhead; accumulating byte flags removed that extra predicate. The retained change is confined to `Input::string`, plus correctness tests.

## Measurements

The receipt in [measurements-string-scan.json](measurements-string-scan.json) rebuilds both revisions with the same locked release settings and compiler, then uses those fixed artifacts for every CLI sample. It records source, executable, driver, fixture and full-output SHA256 hashes; executable sizes; all samples; commands; timestamps; host load; and in-process diagnostic provenance. The before source is extracted from the immutable parent, never a moving branch. Temporary build paths in the receipt describe that run; the script recreates them on reproduction.

Five serial samples per tool/workload, rotated tool order, warm input cache, stdout `/dev/null`. Wall time includes process startup and `/usr/bin/time`. These are shared-host macOS arm64 measurements: an integrated benchmark was reported running elsewhere on the host, so contention is not controlled. They are not release or cross-platform performance claims. The record schema uses ASCII strings and small integers. Fastgron output hashes match on all four measured fixtures; this does not imply that fastgron implements Gronify's full numeric and Unicode contract.

Median wall milliseconds / median peak RSS MiB:

| Workload | Parent | This change | fastgron 0.7.7 |
| --- | ---: | ---: | ---: |
| records-4MiB | 20.33 / 1.69 | 16.62 / 1.69 | 13.51 / 16.44 |
| records-32MiB | 130.71 / 1.69 | 103.85 / 1.69 | 71.44 / 76.42 |
| long-string-8MiB | 10.42 / 11.69 | 6.05 / 11.69 | 7.63 / 21.89 |
| tiny | 3.77 / 1.59 | 4.00 / 1.59 | 4.97 / 5.77 |

On 32 MiB records wall time decreases 20.5%, from 130.71 to 103.85 ms. The fastgron ratio narrows from 1.83x to 1.45x on this run; the records gap remains. The 8 MiB ASCII string decreases 41.9%, from 10.42 to 6.05 ms, versus fastgron's 7.63 ms. The tiny sample is 0.23 ms slower (3.77 to 4.00 ms); this run does not establish a startup improvement. Both native executables remain 335,936 bytes. RSS remains about 1.7 MiB for records and 11.7 MiB for the long string; small page-sized differences are not claimed as savings.

## In-process diagnostics

The driver reads each fixture once outside timing and repeats work 15 times. `parse` flattens into `io::sink`, allowing emission to be optimized away. `buffered-emission` uses the production-sized BufWriter and an opaque counting sink. `strings` scans quoted tokens, including keys, without building paths or emitting assignments. The receipt also retains `normalize`, which adds a second normalization of each scanned token. These are separate diagnostic variants, not additive phase timings or sampled CPU profiles. Their difference is not an exact attribution of output costs.

Milliseconds per iteration:

| Fixture | Variant | Parent | This change |
| --- | --- | ---: | ---: |
| records-4MiB | parse | 9.484 | 7.193 |
| records-4MiB | buffered-emission | 11.250 | 8.957 |
| records-4MiB | strings | 6.383 | 3.978 |
| long-string-8MiB | parse | 5.974 | 1.157 |
| long-string-8MiB | buffered-emission | 5.366 | 1.160 |
| long-string-8MiB | strings | 5.364 | 1.166 |
| unicode | parse | 0.836 | 0.766 |
| unicode | buffered-emission | 0.852 | 0.731 |
| unicode | strings | 0.844 | 0.741 |
| escaped | parse | 3.493 | 3.687 |
| escaped | buffered-emission | 3.479 | 3.355 |
| escaped | strings | 3.427 | 3.346 |

The ordinary string scan is a useful target in both records and long strings. Unicode and escape-heavy fallback fixtures are included to expose regressions hidden by the ASCII record schema; their small single-run differences should not be generalized. The emitter is unchanged.

## Reproduce

```sh
python3 native/scripts/bench-step.py \
  --base 8cc14eca3216a2283f45c2e0623e4faf80339591 \
  --runs 5 --output /tmp/native-string-scan.json
```

This is a focused native/fastgron comparison, not the integrated suite. It does not build or time Node. `profile.py SOURCE.rs FIXTURE.json --rounds 15` can run the in-process diagnostics separately; `profile.rs` is appended to a temporary copy of the supplied parser, with only its CLI entry point renamed. Neither profiling file is linked into the production executable.

## Validation

On the measured source: `cargo fmt -- --check`, clippy with `--all-targets -- -D warnings`, the locked release build, and all 13 release tests passed. The original 11 tests remain untouched, including token/path/depth boundaries and I/O failures. Two new tests cover every byte value in 17 positions at eight input chunk sizes, and valid Unicode/escape/closing-quote cases across every possible chunk size of their fixtures. Numeric lexemes are asserted in the latter test.

After building the Node oracle, unchanged `compat.py` passed 48 valid fixtures / 192 byte comparisons, 27 malformed fixtures at three chunk sizes, four cap comparisons and unsupported-option checks. The full 50,000-depth comparison matched all 3,750,575,009 bytes, SHA256 `39802b5c78f9961a84c81145077d9a25499ce9f1aba54994550a81ca4bef0693`. No full heavyweight timing sweep was run.
