# Integrated benchmark audit at 2017be1

Pinned commit: `2017be1b4c4f20e070473c1be22b0f27c983f2a8`. Node remains the default npm CLI; native is an experimental flatten, ASCII-insensitive literal-search, and ordered-unflatten subset. This is the pre-PR122 benchmark. PR122 is now merged on main; none of these timings measures that shell change.

## Decision evidence

On the 1000 MiB event fixture, native flatten was effectively tied with fastgron (3.811 vs 3.824 s) while using about 1.69 vs 1899 MiB RSS. Native search took 2.395 s, Node 4.800 s, and fastgron 3.031 s. Ordered native unflatten (6.204 s) and Node (6.310 s) were close; native used about 1.75 MiB RSS versus Node 101 MiB and fastgron 7578 MiB. The strongest evidence is lower memory and startup/cap cost, plus search throughput on this fixture. This does not justify replacing the broader default Node CLI or claiming a general speed lead over fastgron.

## Validation

The retained build log records 26 native release tests passing; this audit did not rerun them. The compatibility logs record: 192 flatten byte comparisons, 432 search byte/status comparisons, and 159 ordered-unflatten comparisons. See retained logs for malformed-input, caps, depth and fallback rejection checks.

All outputs were streamed to SHA256 sinks. Native and Node unflatten are compared against the original compact fixture plus LF. Fastgron serializer whitespace and object-key order differ; supplemental flatten → unflatten → native reflatten pipelines check reconstructed values, key order and raw number lexemes without keeping giant output copies. Order-sensitive reflatten hashes therefore differ for fastgron event records; those mismatches are not alone evidence of wrong values. A separate bounded, record-by-record JSON decoder sorts object keys and hashes canonical records to check semantic equality at every size; this event-only check uses ordinary finite numbers, while raw numeric lexemes have a separate exact test. The original validation labels are preserved in the evidence archive. The audit verifier recomputes equality from samples with explicit tool participation and requires complete successful sample sets.

## Method and limits

Three serial samples per timing group, tool order rotated each round, input cache warmed before each sample. Semantic validation has one source/fastgron comparison per size. Exact commands and all samples are in the linked evidence archive. Wall time uses a monotonic clock around the full CLI process and streaming sink; /usr/bin/time -l logs retain real/user/system time and maximum RSS. Pipeline RSS is the largest individual child; a separate 100 ms process-tree sum enforces the 8 GiB guard. Timeout is 120 seconds per sample. Very brief peaks can fall between guard polls. SHA256 sink overhead and pipe backpressure are included; these are full CLI measurements, not internal parser timings or /dev/null throughput.

Apple M5 Pro, 48 GiB RAM, macOS shared host. Other active processes appear in the host snapshots; selected high-CPU process lines, original snapshot hashes, and per-sample load are retained. The selected lines do not establish CPU isolation. Small differences and local winners are not isolated-host findings.

The repository bench-compare eventRecord generator is copied verbatim into generate.mjs, seed 42, including Unicode strings. Its 2,000-record batches overshoot target sizes; exact byte sizes and hashes below are authoritative. One common native-generated gron file was retained per size while timing unflatten, then removed; its hash and bytes remain in the receipt. Fixture contents are omitted from the repository; the archived generator and exact hashes identify them.

jq --stream -c . emits parser events, including container-end events. It is not gron flattening and is not ranked as an equivalent implementation. Shell caps use head/grep and last-command status, so they describe consumer cancellation and may read/parse more than native/Node explicit caps; stderr is retained. Supplemental validation pipeline timing includes two native flatten passes and must not be read as standalone unflatten performance.

## Fixtures

| Target MiB | Actual bytes | Search matches | SHA256 |
|---:|---:|---:|---|
| 1 | 1116969 | 26 | `b517cdd794564d13537cdbb1d3f41916f8e68044184bfccc1c97095afe502ba5` |
| 10 | 11192936 | 289 | `ec1027e44d98c9f579ce9289aeb5e2ff6ea55446c0c34e332e909c4f4f34d824` |
| 100 | 105584449 | 2797 | `4f0036d273b175e6792058ffa7e97bbcfa7d5e21cb2a851f980f5c481a8835d8` |
| 1000 | 1049407501 | 28103 | `d8903fb42696dcf8b22ab7d4301a5fa5641290aba17da026d311b3ec6be22550` |

## Samples summarized

Median wall seconds / median per-run maximum RSS. Parentheses count process completions with status `ok` out of three, regardless of equality or RSS budget. In particular, the 1/3 fastgron stdin result has zero under-budget completions.

| Target MiB | Operation | Native experimental | Node default | fastgron | jq distinct events |
|---|---|---|---|---|---|
| raw | flatten | 0.0041 s / 1.59 MiB (3/3) | 0.0347 s / 52.09 MiB (3/3) | 0.0053 s / 5.77 MiB (3/3) | 0.0044 s / 2.36 MiB (3/3) |
| tiny | startup | 0.0045 s / 1.59 MiB (3/3) | 0.0351 s / 52.20 MiB (3/3) | 0.0055 s / 5.77 MiB (3/3) | 0.0044 s / 2.36 MiB (3/3) |
| 1 | flatten | 0.0085 s / 1.69 MiB (3/3) | 0.0530 s / 60.30 MiB (3/3) | 0.0107 s / 9.88 MiB (3/3) | 0.0693 s / 2.42 MiB (3/3) |
| 1 | search | 0.0073 s / 1.64 MiB (3/3) | 0.0511 s / 57.80 MiB (3/3) | 0.0090 s / 7.88 MiB (3/3) | — |
| 1 | unflatten | 0.0117 s / 1.75 MiB (3/3) | 0.0571 s / 61.25 MiB (3/3) | 0.0147 s / 15.72 MiB (3/3) | — |
| 1 | cap-flatten | 0.0047 s / 1.67 MiB (3/3) | 0.0372 s / 53.19 MiB (3/3) | — | — |
| 1 | cap-search | 0.0057 s / 1.67 MiB (3/3) | 0.0447 s / 57.05 MiB (3/3) | — | — |
| 10 | flatten | 0.0442 s / 1.69 MiB (3/3) | 0.1127 s / 79.52 MiB (3/3) | 0.0466 s / 28.11 MiB (3/3) | 0.6026 s / 2.42 MiB (3/3) |
| 10 | search | 0.0305 s / 1.66 MiB (3/3) | 0.0974 s / 65.94 MiB (3/3) | 0.0384 s / 26.17 MiB (3/3) | — |
| 10 | unflatten | 0.0722 s / 1.75 MiB (3/3) | 0.1174 s / 91.81 MiB (3/3) | 0.0860 s / 88.17 MiB (3/3) | — |
| 100 | flatten | 0.3880 s / 1.69 MiB (3/3) | 0.6588 s / 93.22 MiB (3/3) | 0.3866 s / 198.47 MiB (3/3) | 5.5234 s / 2.44 MiB (3/3) |
| 100 | search | 0.2493 s / 1.69 MiB (3/3) | 0.5080 s / 73.33 MiB (3/3) | 0.3066 s / 196.95 MiB (3/3) | — |
| 100 | unflatten | 0.6360 s / 1.75 MiB (3/3) | 0.6902 s / 95.97 MiB (3/3) | 0.7523 s / 765.69 MiB (3/3) | — |
| 1000 | flatten | 3.8114 s / 1.69 MiB (3/3) | 6.0591 s / 97.77 MiB (3/3) | 3.8245 s / 1899.38 MiB (3/3) | 54.9753 s / 2.44 MiB (3/3) |
| 1000 | search | 2.3946 s / 1.69 MiB (3/3) | 4.7996 s / 76.17 MiB (3/3) | 3.0308 s / 1899.36 MiB (3/3) | — |
| 1000 | unflatten | 6.2036 s / 1.75 MiB (3/3) | 6.3100 s / 101.00 MiB (3/3) | 7.2435 s / 7578.23 MiB (3/3) | — |
| 1000 | cap-flatten | 0.0051 s / 1.67 MiB (3/3) | 0.0372 s / 54.17 MiB (3/3) | — | — |
| 1000 | cap-search | 0.0057 s / 1.67 MiB (3/3) | 0.0442 s / 58.00 MiB (3/3) | — | — |
| raw | roundtrip-reflatten-validation | 0.0068 s / 1.98 MiB (3/3) | 0.0395 s / 52.52 MiB (3/3) | 0.0080 s / 6.72 MiB (3/3) | — |
| 1 | roundtrip-reflatten-validation | 0.0143 s / 1.98 MiB (3/3) | 0.0583 s / 60.86 MiB (3/3) | 0.0203 s / 21.92 MiB (3/3) | — |
| 10 | roundtrip-reflatten-validation | 0.0732 s / 1.98 MiB (3/3) | 0.1498 s / 91.05 MiB (3/3) | 0.1390 s / 142.81 MiB (3/3) | — |
| 100 | roundtrip-reflatten-validation | 0.6206 s / 1.98 MiB (3/3) | 1.0015 s / 94.84 MiB (3/3) | 1.2458 s / 1231.09 MiB (3/3) | — |
| 1000 | roundtrip-reflatten-validation | 6.1190 s / 1.98 MiB (3/3) | 9.2439 s / 95.56 MiB (3/3) | 14.4550 s / 8512.94 MiB (1/3) | — |
| 1 | cap-flatten-context | — | — | 0.0086 s / 9.83 MiB (3/3) | 0.0076 s / 2.42 MiB (3/3) |
| 1 | cap-search-context | — | — | 0.0102 s / 7.88 MiB (3/3) | 0.0231 s / 2.42 MiB (3/3) |
| 1000 | cap-flatten-context | — | — | 0.3846 s / 1899.34 MiB (3/3) | 0.0073 s / 2.42 MiB (3/3) |
| 1000 | cap-search-context | — | — | 1.7343 s / 1899.33 MiB (3/3) | 0.0250 s / 2.42 MiB (3/3) |
| 1000 | file-unflatten-reflatten-validation | — | — | 9.7498 s / 7578.22 MiB (3/3) | — |

## Failures and boundaries

Two RSS-guard kills, zero unstarted samples, and one additional completed sample above the RSS budget (three budget violations total). The supplemental 1000 MiB fastgron stdin pipeline had two RSS-guard kills. One sample exited successfully but /usr/bin/time measured 8.31 GiB peak RSS, above the 8 GiB threshold; the 100 ms sampled guard missed that peak. It is not a successful under-budget result. File-based unflatten is checked separately. Full records are in the archived receipts; the audit separately counts process failures and budget violations.
- 1000 MiB roundtrip-reflatten-validation, fastgron, sample 1: rss-guard; wall 4.1508759170000005; sampled tree RSS 8613707776.
- 1000 MiB roundtrip-reflatten-validation, fastgron, sample 2: rss-guard; wall 4.154332000000004; sampled tree RSS 8616574976.

Native retains explicit token/path/depth limits, rejects non-ASCII insensitive search terms, and accepts ordered unflatten input only. Node has a broader CLI and bounded fallback behavior. Native shell help/version, atomic output and clean pipe usability work was not included in this commit. fastgron remains a broader native tool and can have advantages on other schemas and output modes; these event records do not establish universal superiority. Raw numeric precision is a separate tiny lexeme fixture, not an arbitrary precision arithmetic test.

## Semantic and numeric validation

See the archived semantic-validation.json for bounded canonical-record comparison of each source fixture against file-based fastgron unflatten. Raw-number flatten and flatten/unflatten/reflatten passed exact hashes for native, Node and fastgron in all three samples, including -0, trailing decimal zeros, a 30-digit integer and out-of-range exponents. jq kept the tested large-number precision but changed exponent spelling from 1e999 to 1E+999 and emitted a distinct event format; no general arithmetic precision claim is made.

## Audit corrections and remaining gaps

The audit verified all 568 entries in the original manifest and all 31 primary artifact hashes against the files present on 2026-11-03. The four fixture hashes and byte counts, including original bytes plus LF, were checked by streaming the existing files. Recorded source files and lockfiles were also compared with Git at the pinned commit. The embedded sections of integrated.json match their standalone receipts, and its logs/checks/failures match the original files. The original manifest records its own producer's clean checkout; it does not authenticate itself or prove build reproducibility.

The table medians and completion counts were recomputed from every sample. All 257 referenced time/stderr pairs are retained as exact strings in raw-receipts.json. Maximum RSS values match the time files, including empty time files for the two guard kills. Wall time comes from the Python monotonic clock; rounded `time -l` real values cannot independently reconstruct that clock interval.

Four original cap-check labels say `successful_native_node_fastgron_hashes_equal`, but only native and Node participated. The corrected audit records the participating tools. Fastgron event reflatten hashes differ on all 10 completed stdin samples and all three file samples. Two further stdin samples were killed and cannot establish equality. Sorted-key semantic records match at all four sizes, with one source/fastgron comparison per size, not three. The semantic receipt inherits `method.samples: 3` from the common driver; its actual rows contain single comparisons.

The completed 1000 MiB fastgron stdin sample reports 8,926,461,952 bytes peak RSS, exceeding the 8,589,934,592-byte budget. Its sampled process-tree peak was only 8,469,086,208 bytes. The two killed samples report sampled tree peaks of 8,613,707,776 and 8,616,574,976 bytes and no final time RSS. This is evidence of a missed guard peak, not an under-budget result. A completed process, exact output equality, and RSS compliance are separate outcomes.

Equality verification here checks recorded hashes, lengths, counts, output excerpts and their consistency with the driver. Full output streams were not retained, so the audit cannot independently rehash them. The bounded semantic decoder normalizes Python numeric values and sorts keys; it establishes the recorded event-fixture comparison, not arbitrary JSON or numeric-lexeme equivalence. The separate raw-number fixture covers six spellings only. Compatibility logs are retained pass receipts, not fresh test executions. The retained hardware.txt reports Mac17,8, Apple M5 Pro and 51,539,607,552 bytes RAM; it does not record the command that produced those values. The original report also claims a separate fastgron process was observed, but none of its three retained host snapshots contains a fastgron row. This audit removes that unsupported detail while retaining the shared-host limitation.

No timing sweep was rerun during this audit. Still needed for broader conclusions: isolated-host repetitions, more schemas/platforms, a post-PR122 benchmark, and a guard strategy that accounts for missed peaks. No runtime source or benchmark implementation was changed.

## Evidence and reproduction

The [evidence directory](evidence/integrated-2017be1/) retains original standalone JSON receipts and manifest, exact time/stderr and validation logs, selected host lines, and the original driver scripts. It omits giant JSON/gron fixtures, full output streams, full process listings and duplicate integrated JSON. Absolute paths inside receipts are historical provenance, not links required to read the evidence.

Run the lightweight audit from the repository root:

```sh
python3 native/evidence/integrated-2017be1/verify.py
```

To also recheck original artifacts and fixture bytes when the original directory still exists:

```sh
python3 native/evidence/integrated-2017be1/verify.py --source /tmp/gronify-integrated-2017be1-20261103
```

The verifier does not invoke benchmark executables. The original scripts under `driver/` are archival reproduction inputs, not portable launchers: run.py uses the current checkout, generate.mjs embeds the original temporary output directory, and the supplemental scripts load run.py's setup. To repeat the experiment later, use a separate checkout at the full pinned SHA, install locked Node dependencies, build Node and native release artifacts, and adapt the output directory consistently in a copy of the drivers. Generate fixtures with seed 42, check all four fixture hashes, then run the primary, supplemental, file and semantic drivers in that order. Regenerate report.py output only as historical output: it retains the label and accounting issues corrected above. Do not run this timing workflow while another performance builder is active.
