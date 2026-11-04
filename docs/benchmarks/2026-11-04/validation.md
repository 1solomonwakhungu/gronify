# Benchmark refresh validation

Runtime source: `00d950204b4d60e510870c3bf2d86718924d6832` (current main when checked on 2026-11-04). This refresh changes measurement tooling and presentation, not the CLI runtimes. The same runtime source shipped as npm 1.3.0.

## Baseline checks

Commands run before the serial performance window:

```sh
cd src/packages/cli
npm test -- --runInBand
npm run lint
npm run format:check
npm run audit
```

All nine suites and 577 tests passed. Lint and formatting passed. The configured audit passed: six low-severity advisories, none moderate, high, or critical.

## Issue scope

Merged PRs #110–#124 include CLI performance and cancellation fixes. This does not complete the broader roadmap: issues #3, #4, and #18 retain command, distribution, or UI work. Release PR #109 remained open during this audit.

## Measurement boundaries

The host is shared. This task's builds and test suites were paused during serial timing, but unrelated applications and OS activity were not controlled. Compare measurements within a fixture and output contract. Small timing differences are not proof of a general performance advantage. Parser-event output from jq is context, not byte-equivalent gron flattening.

The page reports the recorded outcomes, including failures and skips. It does not require a particular tool to win.

## Default CLI sweep

The full sweep completed with exit 0 on 2026-11-04 after 18 minutes. It retained 32 workloads and 192 tool/workload outcomes: 149 completed, 30 skipped, 11 failed, and 2 timed out. These counts include all compared tools; the harness would return nonzero for a failing Gronify check or workload. The source revision is recorded in `landing-page/src/app/benchmark-results.json`.

```sh
cd src/packages/cli
npm run bench:compare -- --runs 3 --timeout 60 --max-rss-gb 8 --budget 45
```

The 1,049,407,501-byte event-record fixture is about 1,001 MiB, not exactly 1 GiB.

## Receipt audit

```sh
node scripts/validate-metadata.mjs
git diff --check
git diff --exit-code -- src/packages/cli/src
```

An offline verifier checked the 460 retained default-suite attempts, median arithmetic, and source/build/external-binary hashes. Metadata and whitespace checks passed; the runtime source directory has no changes. The repository's complete documentation/package metadata Prettier check also passed.

## Landing page

`npm run lint`, `npm run build`, and `npm run audit` passed in `landing-page`. The production build generated all six static pages. The audit used the existing `GHSA-g3hv-75wg-m249` minimatch allowlist: eight moderate transitive development findings, no high or critical findings. No audit exception was added.

Chromium checks at 320, 375, 414, 768, and 1440 pixels found no horizontal overflow, missing in-page link targets, unnamed buttons, images without alt text, or runtime JavaScript errors. All six charts rendered and the source revision, measured values, and memory-limit label were present. Mobile and desktop screenshots were inspected; a mobile intro-padding issue was corrected and the final build and checks repeated. These are basic layout and accessibility checks, not a full accessibility audit. The temporary QA browser and server were closed.

Structured browser results are retained in [landing-qa.json](landing-qa.json). The independent evidence review is in [benchmark-refresh-2026-11-04.md](../../review/benchmark-refresh-2026-11-04.md).
