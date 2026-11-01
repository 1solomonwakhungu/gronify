# Status

## Current state

Checked on 2026-11-01.

- **Version:** 1.2.0, released 2026-10-31 through release-please PR #97. The GitHub release `v1.2.0` carries `gronify-v1.2.0.tar.gz`, `gronify-v1.2.0.zip`, and `checksums.txt`.
- **Distribution:**
  - npm: `npm view gronify version` returns 1.2.0, published by the Release workflow with provenance.
  - Homebrew: `Formula/gronify.rb` in `1solomonwakhungu/homebrew-tap` points at the v1.2.0 tarball and depends only on `node@22` (no `fastgron`).
  - Release archive and build from source, as described in the README.
- **CI:** Release and Quality Checks are green on `main` (`eeb6e3a`). `NPM_TOKEN` and `RELEASE_PLEASE_TOKEN` are set, so release-please opens release PRs and merged releases publish without manual steps.
- **Audits:** the CLI allowlist (`src/packages/cli/audit-ci.jsonc`) is empty. The landing allowlist (`landing-page/audit-ci.jsonc`) has one entry; see Open items.
- **What 1.2.0 adds:**
  - `flatten`, `search`, and `unflatten` stream, so on the default path memory stays around 100 MB regardless of input size (multi-GB inputs tested); `--sort` and out-of-order `unflatten` input buffer more. `-o` writes atomically. (#95, #94)
  - Numbers are printed exactly as written (`12345678901234567890`, `1.10`), object keys keep document order, and JSON errors report byte offset, line, and column. (#95)
  - Result caps (`search -m/--max-count`, `flatten --limit`) stop reading early; `--sort` gives stable, diffable key order; `search --exit-status` exits 1 on no match and 2 on error. (#98)

## Open items

- **Landing page and `llms*.txt` for 1.2.0:** they still describe only flatten, search, and unflatten. Update them for result caps, `--sort`, `--exit-status`, and streaming.
- **Landing audit exception `GHSA-g3hv-75wg-m249`** (minimatch, reached only through eslint and its plugins, dev-only). The only fix is minimatch 11, which the 3.x consumers cannot take. Remove the entry once the eslint plugin stack moves off minimatch 3 and `npm run audit` in `landing-page` passes with an empty allowlist.
- **`unflattenGron` in `src/packages/cli/src/gron.ts`:** no longer used by the CLI. It stays as the reference implementation for the streaming `unflatten` differential tests; drop it if those tests are retired.
- **Roadmap issues still open, by theme:**
  - CLI leftovers: #3 (`diff`, `filter`, telemetry, progress indicators), #4 (pip, Windows binaries, reproducible builds, download page), #18 (items aimed at a UI: progressive and lazy loading, size warnings, rendering, monitoring).
  - VS Code extension: #6, #7, #8.
  - Browser and web: #9 (Chrome extension), #10 (web app), #22 (visual schema editing).
  - Platform and integrations: #11 (backend API), #19 (APIs and data formats), #20 (libraries and SDKs), #23 (logs and observability).
  - Product and growth: #12 (pro features), #13 (payments), #14 (team management), #15 (marketing campaigns), #16 (SEO content), #17 (referrals).

## History

### 2026-10-31 — Dependency sweep and 1.2.0 release

- Merged #88 (release-please-action v5, node24 runtime), #93 (`@eslint/eslintrc` patch), and #99, which bundled #89 (React 19.3.1), #91 (posthog-js), #92 (`@primer/react-brand` 0.80.1), and #90 (`eslint-config-next` 16.4.3). eslint-config-next 16 no longer works with FlatCompat, so `eslint.config.mjs` moved to the native flat config and `@eslint/eslintrc` was dropped.
- Landing audit: removed the stale `braces` entry (`GHSA-vfj7-8cjw-p6xm`) and allowlisted `GHSA-g3hv-75wg-m249` (minimatch, published 2026-10-30).
- CLI audit: jest pulled in glob (`GHSA-3g3m-2fjr-6pw4`) and minimatch (`GHSA-g3hv-75wg-m249`); fixed with npm overrides `glob@^14.0.2` and `minimatch@^11.0.2`. Removed the stale `sprintf-js` exception (`GHSA-hp3w-g68c-fv3c`), leaving the CLI allowlist empty. 548 tests pass.
- Merged release PR #97 last; v1.2.0 published to GitHub, npm, and the Homebrew tap.

### 2026-10-30 — Agent features: result caps, sorting, exit status (#98)

- `search -m/--max-count <n>` and `flatten --limit <n>` stop after `n` lines with grep semantics (`-v` counts non-matching lines, `--count` counts up to `n`). The rest of the input is never read. Exit 0, with a one-line notice on stderr. `n` must be a positive integer. With `--sort`, caps apply to sorted order, so a root object is read fully first. `-o` commits capped output through the atomic sink.
- `--sort` on `flatten` and `search` sorts object keys at every level by UTF-16 code unit order, keeps subtrees together, and leaves arrays in index order. It is not gron's order: gron 0.7.1 puts bare keys before bracketed keys, compares UTF-8 bytes, and merges duplicate keys. `src/sort.ts` (`SortingSink`) buffers lines as bytes, never JS values, and spills to an unlinked temp file above 64 MiB (`GRONIFY_SORT_MEMORY`, bytes or KB/MB/GB/KiB/MiB/GiB). Arrays at the root stream one record at a time. `--sort` is ignored with `--count`.
- `search --exit-status`: exit 1 when nothing is selected, 2 on errors (including usage errors). A reached cap counts as a match; `--count` still prints `0`. Without the flag nothing changes.
- The agent skill was rewritten (explore with `--count`, then cap; `--sort` for diffing; check exit status; exact numbers) and README gained an npm install section. `scripts/validate-metadata.mjs` now allows the npm install line, scans `SKILL.md`, and flags only claim-shaped `diff` phrases outside code.
- Benchmarks (Node 22.23.1, macOS arm64, best of 3). The default path did not regress:

  | Input          | Command        | Before            | After              |
  | -------------- | -------------- | ----------------- | ------------------ |
  | 23 MB          | flatten        | 0.18 s, 81 MB RSS | 0.19 s, 81 MB RSS  |
  | 23 MB          | search --count | 0.19 s, 78 MB RSS | 0.19 s, 79 MB RSS  |
  | 129 MB         | flatten        | 0.81 s, 92 MB RSS | 0.83 s, 92 MB RSS  |
  | 129 MB         | search --count | 0.88 s, 90 MB RSS | 0.87 s, 90 MB RSS  |
  | 23 MB          | flatten --sort | n/a               | 0.44 s, 84 MB RSS  |
  | 129 MB         | flatten --sort | n/a               | 2.23 s, 139 MB RSS |
  | 23 MB / 129 MB | search -m 5    | n/a               | 0.03 s, 54 MB RSS  |

- On a 1.2 GiB array of records, `search -m 5` took 0.03 s and 57 MB RSS (a full `search --count` takes 8.5 s). A 270 MiB object with 1.5M scrambled keys sorted in 7.4 s at about 500 MB RSS. Review fixes cut `flatten --sort` on a 137 MB array of records from 4.25 s to 2.67 s, and 20,000-level nesting from 1031 MB to 453 MB RSS (276 MB with `GRONIFY_SORT_MEMORY=1MB`).
- Tests: 548 passing after merging with #94.

### 2026-10-30 — Streaming unflatten (#94)

- `unflatten` reads a byte stream and writes JSON through a backpressure-aware writer and the shared `OutputSink` from `src/output.ts`. Document-order gron (what `flatten` writes) converts in one pass. Out-of-order input found within the first 16 MiB of input or output is rebuilt in memory; after that it fails with `line N: ...`.
- Numbers are validated and written verbatim; strings are normalized to `JSON.stringify` form; skipped array indexes become `null`; `--pretty` matches `JSON.stringify(value, null, 2)` except for repeated keys; `--color` output is byte-identical to the previous build. Big integers inside one-line compound values are kept verbatim (`unflatten/compound.ts`).
- Benchmarks (`scripts/bench-unflatten.mjs`, Apple M5 Pro, Node 22.23.1, best of 3):

  | Input                               | Before                  | After               |
  | ----------------------------------- | ----------------------- | ------------------- |
  | 56 MB gron                          | 0.91 s, 515 MB RSS      | 0.19 s, 95 MB RSS   |
  | 285 MB gron                         | 4.85 s, 2068 MB RSS     | 0.76 s, 117 MB RSS  |
  | 600 MB gron                         | fails (string too long) | 1.70 s, 97 MB RSS   |
  | 3 GB gron (9.8M records)            | not possible            | 7.31 s, 100 MB RSS  |
  | 285 MB gron, out of order at line 3 | 5.50 s, 2100 MB RSS     | 3.28 s, 1259 MB RSS |

  Before is `main` at `07c1c86`. The 600 MB, 3 GB, and out-of-order rows are from the pre-merge run.

- A 1.0 GB JSON file round-tripped through `flatten | unflatten` in 19.8 s with byte-identical output and 93 MB peak RSS for `unflatten`. 67 random documents round-trip with 0 failures. Tests: 425 passing on Node 20.20.2 and 22.23.1.
- Behavior changes: numbers keep their spelling (`1e999` no longer becomes `null`); keys containing `=` and values containing U+2028 parse; repeated keys are written twice; out-of-order input past 16 MiB is an error; array indexes above 4294967294 are rejected; `\v` and `\f` inside values are rejected.

### 2026-10-29 — Streaming flatten and search (#95)

- A byte-level JSON tokenizer reads 1 MB chunks, an iterative path-stack flattener writes gron lines into 1 MB blocks, and a backpressure-aware writer feeds stdout or `-o`. Memory no longer depends on input size or nesting depth. Plain `search` uses a Horspool byte search; `--regex` and non-ASCII case-insensitive terms use a precompiled RegExp.
- `-o` is atomic: `OutputSink` writes a temp file beside the target and renames it on commit. Errors, empty output, SIGINT, and SIGTERM leave the target untouched. `gronify -o a.json flatten a.json` works.
- Behavior changes: numbers print verbatim; keys keep document order; duplicate keys are all emitted; strict JSON errors with byte offset, line, and column; invalid UTF-8 is rejected; a mid-stream error on stdout keeps what was written and exits 1; a search with no matches creates no `-o` file.
- Benchmarks (Node 22.23.1, macOS arm64, `npm run bench`, best of 3):

  | Input               | Command        | Before                         | After                               |
  | ------------------- | -------------- | ------------------------------ | ----------------------------------- |
  | 23 MB               | flatten        | 0.69 s, 1023 MB RSS            | 0.18 s, 80 MB RSS                   |
  | 23 MB               | search --count | 0.64 s, 778 MB RSS             | 0.19 s, 78 MB RSS                   |
  | 129 MB              | flatten        | 4.23 s, 4457 MB RSS            | 0.85 s, 92 MB RSS                   |
  | 129 MB              | search --count | 3.72 s, 3617 MB RSS            | 0.92 s, 88 MB RSS                   |
  | 3.50 GB             | flatten        | old build fails above ~240 MB  | 22.1 s, 98 MB RSS                   |
  | 3.50 GB             | search --count | old build fails above ~240 MB  | 24.5 s, 96 MB RSS                   |
  | 100,000 levels deep | flatten        | old build overflows near 2,000 | 0.17 s, 63 MB RSS (10 GB of output) |

- Tests: 203 passing on Node 20.20.2 and 22.23.1.

### 2026-10-29 — Landing audit fix

- The landing audit failed on `main` with advisories in `next` 16.4.0 and `dompurify` <= 3.4.16. Fixed by bumping `next` to 16.4.3 and overriding `dompurify` to 3.4.17 (it arrives through `posthog-js`). No allowlist entries added.

### 2026-10-17 — Audit fixes, release automation, CLI UX

- #73: landing page on Next 16.4.0 with `sharp` and `source-map-js` overrides; CLI `npm audit fix` for the critical `handlebars` advisory.
- #72: Dependabot ignores TypeScript >= 7 and groups React packages. Merged Dependabot #43 and #62; closed #69 as superseded.
- #44: `-o/--output`, `search -v/--invert-match`, and error tips. CLI tests: 46.
- #74: release-please manages `src/packages/cli` from the `v1.0.0` tag. Merged release PRs build the Homebrew tarball, zip, and checksums, then publish to npm with provenance. The artifacts job skips when the release already has its tarball, so a second run cannot change published checksums.
- The first release-please run could not open a PR ("GitHub Actions is not permitted to create or approve pull requests"). The owner added `RELEASE_PLEASE_TOKEN` and `NPM_TOKEN` the same day; v1.1.0 was released and reached npm on 2026-10-17.

### 2026-10-05 — Dependency verification and landing audit

- Added weekly Dependabot updates for the landing page. CLI tests: 19 on Node 20 and 22.
- Restored the landing CI audit with `audit-ci` across production and development dependencies.

### Earlier — Landing page redesign

- Kept the published `v1.0.0`, bundled executable, Homebrew formula, and standalone TypeScript engine.
- Rebuilt the landing page as a dark, Linear-derived workbench with facts for built-in flatten, unflatten, and search (no external CLI needed). Added product and design-system records (`PRODUCT.md`, `DESIGN.md`).
- Motion follows the transitions.dev token scale, with a CSS-only hero reveal and a `prefers-reduced-motion` guard. Lint, production build, and responsive checks at 320–1280px passed.
