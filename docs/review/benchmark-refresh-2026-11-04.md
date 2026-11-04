# Benchmark refresh independent review

Reviewed November 4, 2026 against the working tree based on `00d950204b4d60e510870c3bf2d86718924d6832`. Scope: benchmark harnesses, retained default/native receipts, landing-page adapters and claims, and README/PRODUCT/STATUS consistency. No runtime changes were made by this reviewer.

## Verdict

PASS: no blocking findings remain in the reviewed scope. Receipt arithmetic, recorded provenance, output-validation gates, and landing-page source/release distinctions pass. The generated methodology now correctly describes independently aggregated time and RSS medians. The parent agent owns final application build and deployment verification.

## Verified evidence

- The default receipt has 32 workloads and 192 tool outcomes: 149 successful, 30 skipped, 11 failed, and 2 timed out, with 460 retained attempts. Every successful outcome has three successful timing samples; independently recomputed elapsed-time and RSS medians match the published fields. All successful sample RSS values satisfy the recorded 8 GiB budget. Unsuccessful outcomes have null headline metrics, explicit reason codes, and no winner flags.
- The native receipt has 13 workloads. Every successful tool outcome has three timing samples with matching medians and RSS below the recorded completed-run limit. Each measured outcome records a successful full-output hash phase; measured unflatten outcomes additionally record successful semantic validation. Native and Node output hashes and lengths agree. For non-unflatten rows, all measured tools have matching output hashes and lengths.
- `python3 native/evidence/current-00d9502/verify.py` passes. It checks both receipts' arithmetic, source/build/external-binary hashes, and the retained executed default-harness hash. Runtime source hashes also passed an independently written local comparison.
- The native 1 GiB fixture records about 1.83788 seconds and 1,785,856 bytes RSS for native, versus about 4.58396 seconds and 82,100,224 bytes for Node. The page's derived percentages correctly round to 40.1% of elapsed time and 2.2% of RSS. These comparisons use the same fixture and matching full-output hashes. Fastgron was deliberately not measured at this size; the page states this.
- Default-suite headline values derive from its own receipt, including 3.8326 seconds / 84,115,456 bytes for the large flatten fixture and 5.5601 seconds / 105,709,568 bytes for unflatten. The native and default suites use different fixtures and are explicitly separated.
- Native failure retention now preserves attempted commands, validation/timing phase records, elapsed time, failure status, and prior successful samples. Required build commands are labeled as prerequisites rather than operations performed by the harness.
- Page charts label Node source builds and experimental native separately, identify jq parser-event output, remove cross-format winner badges, and preserve failed/skipped outcomes. Metadata and supporting prose no longer promise fixed memory consumption for arbitrary JSON.
- The page identifies npm 1.2.0 as the release checked on November 4, rather than claiming that current-source measurements describe npm installs. The initial live audit confirmed npm/latest GitHub release 1.2.0, open release PR #109, and the intentionally incomplete roadmap issues #3, #4, and #18.

## Review fixes addressed

- Corrected ambiguous SIGKILL/OOM and completed-over-budget labels, and regenerated the methodology with independent RSS-median wording.
- Added executed-artifact stability guards for future default runs and native runs, with offline hash verification of this default campaign.
- Preserved both exact executed harnesses separately from later renderer/guard and version-capture improvements. The native fastgron version supplement records the stderr-derived version with a matching executable hash; the original empty stdout version is preserved.
- Removed winner-dependent landing-copy assertions and cross-contract ranking badges.
- Added finite positive timing/RSS validation in the page adapters.

## Limits

This review did not repeat timing sweeps or run builds during the quiet measurement window. It does not independently rehash discarded output streams or establish isolated-host reproducibility. Default-suite correctness checks are representative small fixtures, not full-output equivalence for every timed stream; the page and methodology disclose this. The native full-output gates ran before timing and cover the listed ASCII fixtures, not complete feature parity. Native remains an experimental source-only subset. Production deployment and the final application build are separate checks owned by the parent agent.
