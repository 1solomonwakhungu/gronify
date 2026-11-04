# Benchmark refresh independent review

Reviewed November 4, 2026 against the working tree based on `00d950204b4d60e510870c3bf2d86718924d6832`. Scope: benchmark harnesses, the retained receipt, landing-page adapters and claims, and README/PRODUCT/STATUS consistency. No runtime changes were made by this reviewer.

## Verdict

PASS: no blocking findings remain in the reviewed scope. Receipt arithmetic, recorded provenance, and output-validation gates pass. The generated methodology now correctly describes independently aggregated time and RSS medians. The parent agent owns final application build and deployment verification.

## Verified evidence

- The default receipt has 32 workloads and 192 tool outcomes: 149 successful, 30 skipped, 11 failed, and 2 timed out, with 460 retained attempts. Every successful outcome has three successful timing samples; independently recomputed elapsed-time and RSS medians match the published fields. All successful sample RSS values satisfy the recorded 8 GiB budget. Unsuccessful outcomes have null headline metrics, explicit reason codes, and no winner flags.
- The offline verifier retained with the campaign passed. It checked receipt arithmetic, source/build/external-binary hashes, and the retained executed harness hash. Runtime source hashes also passed an independently written local comparison.
- Headline values derive from the receipt, including 3.8326 seconds / 84,115,456 bytes for the large flatten fixture and 5.5601 seconds / 105,709,568 bytes for unflatten.
- Page charts identify jq parser-event output, remove cross-format winner badges, and preserve failed/skipped outcomes. Metadata and supporting prose no longer promise fixed memory consumption for arbitrary JSON.

## Review fixes addressed

- Corrected ambiguous SIGKILL/OOM and completed-over-budget labels, and regenerated the methodology with independent RSS-median wording.
- Added executed-artifact stability guards for future runs, with offline hash verification of this default campaign.
- Preserved the exact executed harness separately from later renderer/guard and version-capture improvements.
- Removed winner-dependent landing-copy assertions and cross-contract ranking badges.
- Added finite positive timing/RSS validation in the page adapters.

## Limits

This review did not repeat timing sweeps or run builds during the quiet measurement window. It does not independently rehash discarded output streams or establish isolated-host reproducibility. Default-suite correctness checks are representative small fixtures, not full-output equivalence for every timed stream; the page and methodology disclose this. Production deployment and the final application build are separate checks owned by the parent agent.
