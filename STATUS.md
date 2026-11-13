# Status

## Current state

Checked on 2026-11-12.

- **Version:** 1.3.1, released 2026-11-05 through release-please PR #128. The GitHub release `v1.3.1` carries `gronify-v1.3.1.tar.gz`, `gronify-v1.3.1.zip`, and `checksums.txt`.
- **Distribution:**
  - npm: 1.3.1, published by the Release workflow with provenance.
  - Homebrew: `Formula/gronify.rb` in `1solomonwakhungu/homebrew-tap` points at the v1.3.1 tarball and depends only on `node@22` (no `fastgron`).
  - Release archive and build from source, as described in the README.
- **Website:** <https://gronify.vercel.app> has the home page, a `/guides` index, and ten guides under `/guides/<slug>`, one per search intent. Guides are typed content files in `landing-page/src/app/guides/content/`; `registry.ts` lists them and the build validates them (see `landing-page/README.md`). `llms.txt` and `llms-full.txt` are served with `X-Robots-Tag: noindex`.
- **One product:** the Node/npm CLI in `src/packages/cli`. The experimental Rust prototype (`native/`, its workflow, and its landing-page benchmarks) was removed on 2026-11-04.
- **Benchmarks:** the landing page and `BENCHMARKS.md` report the 2026-11-05 sweep of npm `gronify@1.3.1`, run at the release commit `4c78c13e5ba299462e33a87e8a02be25fda1badd`. The published tarball's `dist/` is identical to the build that was measured. See [the evidence README](docs/benchmarks/2026-11-05-v1.3.1/README.md).
- **CI:** Quality Check and Release workflows. Release workflow success does not mean a new version was published.
- **Audits:** the CLI allowlist (`src/packages/cli/audit-ci.jsonc`) is empty. The landing allowlist (`landing-page/audit-ci.jsonc`) has one entry; see Open items.
- **What 1.3.1 adds:** faster flatten and search through byte-level tokenizer paths (#127), and faster streaming unflatten through reused frames and borrowed keys (#129). Output is byte-identical to 1.3.0; independent differential reviews of both PRs found no differences across tens of thousands of fuzzed inputs and chunk sizes.
- **What 1.3.0 added:** faster flatten, tokenizer and long literal search (#110, #111), cheaper unflatten path handling (#112), bounded literal validation that recovers record-stream memory (#119), quiet exit when a socket stdout disconnects (#113), and the cross-tool benchmark (#104).
- **What 1.2.0 added:**
  - `flatten`, `search`, and ordered `unflatten` stream without retaining a full document tree. Historical record-stream runs used about 100 MB; token size, path depth, sorting, and out-of-order input affect memory. `-o` writes atomically. (#95, #94)
  - Numbers are printed exactly as written (`12345678901234567890`, `1.10`), object keys keep document order, and JSON errors report byte offset, line, and column. (#95)
  - Result caps (`search -m/--max-count`, `flatten --limit`) stop reading early; `--sort` gives stable, diffable key order; `search --exit-status` exits 1 on no match and 2 on error. (#98)

## Open items

- **Search indexing (owner action).** On 2026-11-12 no search engine we could query returned a page from `gronify.vercel.app`; Google could not be checked from a script. In Search Console (the site already carries the verification tag), submit `https://gronify.vercel.app/sitemap.xml` and request indexing for the home page and `/guides`. Until pages are indexed, none of the copy work can show in results.
- **npm page lags the repo.** The README, description, keywords, and homepage changed in #138 with `docs`/`chore` commits, which do not trigger a release. npmjs.com shows them only after the next release is published.
- **Links.** The repository has no stars, so Homebrew core is out of reach for now. Places that list tools like this one and accept submissions: `toolleeo/awesome-cli-apps-in-a-csv`, `burningtree/awesome-json`, `fiatjaf/awesome-jq`, AlternativeTo (as an alternative to gron and jq), and one Show HN. Nothing has been submitted.
- **Domain.** `vercel.app` is on the Public Suffix List, so Search Console only offers a URL-prefix property. No documented ranking penalty was found. A later move to a custom domain needs redirects and canonicals.
- **Landing audit exception `GHSA-g3hv-75wg-m249`** (minimatch, reached only through eslint and its plugins, dev-only). The only fix is minimatch 11, which the 3.x consumers cannot take. Remove the entry once the eslint plugin stack moves off minimatch 3 and `npm run audit` in `landing-page` passes with an empty allowlist.
- **`unflattenGron` in `src/packages/cli/src/gron.ts`:** no longer used by the CLI. It stays as the reference implementation for the streaming `unflatten` differential tests; drop it if those tests are retired.
- **Roadmap issues still open, by theme:**
  - CLI leftovers: #3 (`diff`, `filter`, telemetry, progress indicators), #4 (pip, Windows binaries, reproducible builds, download page), #18 (items aimed at a UI: progressive and lazy loading, size warnings, rendering, monitoring).
  - VS Code extension: #6, #7, #8.
  - Browser and web: #9 (Chrome extension), #10 (web app), #22 (visual schema editing).
  - Platform and integrations: #11 (backend API), #19 (APIs and data formats), #20 (libraries and SDKs), #23 (logs and observability).
  - Product and growth: #12 (pro features), #13 (payments), #14 (team management), #15 (marketing campaigns), #16 (SEO content), #17 (referrals).

## History

### 2026-11-12 — `flatten --pretty` indents by path depth

- `--pretty` on `flatten` and on `search --invert-match` counted every dot and opening bracket on the whole line, so a line whose value held one (`0.5`, `"db.internal"`, `[]`) or whose bracket-quoted key held one (`json["a.b"]`) was indented deeper than its siblings. The depth now comes from the path alone: the formatter stops at the space that ends the path and skips quoted keys up to their closing quote. Two spaces per level below the top-level keys, capped at six levels, as before.
- Output is byte-identical to 1.3.1 for documents whose values and quoted keys hold no dot or opening bracket. On eleven files (the test fixture, `package-lock.json`, generated documents with hostile keys and values; about 128,000 lines, each plain and colored) every changed line is explained by such a value or key, and every line's indent equals the depth of its node in the document.
- The blank-line grouping is unchanged: a blank line still goes before each new top-level key and between a top-level `= {}` or `= []` line and its children. It does not depend on values, so it was left for a separate decision.
- Tests: 648 pass (30 new: 26 in `formatter.test.ts`, 4 in `cli.test.ts`). Two existing expectations that encoded the old indentation were updated.

### 2026-11-12 — Search rework: home page, guides, README, npm metadata (#138, #139, #140, #141)

- The site was one page aimed at "JSON parsing CLI", a phrase people use when they want a parser library. The home page now uses the searcher's words (title "Gronify: grep, search, and flatten JSON on the command line"), with a twelve-question FAQ, and its `FAQPage` JSON-LD renders only on `/` (#139).
- #140 added the guide system: a typed `Guide` model, build-time validation (title and description length, markup, links, duplicate titles), per-page canonical, `TechArticle` and `BreadcrumbList` JSON-LD, sitemap entries, and the shared header and footer in `site-chrome.tsx`. The home page HTML was byte-identical before and after apart from asset hashes.
- #141 added nine guides (ten with `grep-json` from #140), links from each home page section to its guide, and synced `llms.txt` and `llms-full.txt`. Each guide was written with every command run on gronify 1.3.1 and, where shown, jq 1.8.2, gron 0.7.1, and fastgron 0.7.7, then replayed by independent reviewers.
- #138 rewrote the README opening, added a comparison table and the guide links, and changed the npm `description`, `keywords`, and `homepage`.
- Claims corrected along the way, all confirmed by running the tools: `--regex` is a JavaScript regular expression, not ERE; exact numbers are not unique to Gronify (gron, fastgron, and untouched literals in jq 1.7+ keep them too); `unflatten` rejects grep-filtered lines that lack their container lines, where `gron -u` and `fastgron -u` create the parents; `gron -u` cannot read Gronify's lines because they have no `;`; JSON Lines input is rejected; plain-sorted lines do unflatten within the 16 MiB rebuild budget; jq's `paths(scalars)` skips `false` and `null`.
- Google removed FAQ rich results on 2026-05-07 and the software rich result needs ratings, which this project does not have, so no rich result is expected from the structured data.
- `flatten --pretty` in 1.3.1 counts dots and brackets inside the value when it indents. The `flatten-json` guide describes that behaviour pinned to 1.3.1; the fix is tracked separately.

### 2026-11-05 — 1.3.1 release and rebenchmark

- #127 (byte-level tokenizer paths for flatten and search) and #129 (streaming unflatten that reuses parent frames and borrows the last path key) merged, and release PR #128 published npm `gronify@1.3.1` and GitHub release `v1.3.1`.
- A serial `bench:compare` sweep ran at `4c78c13` (median of 3 runs, 60 s timeout, 8 GiB guard): 149 ok, 30 skipped, 11 failed, 2 timed out. These counts match the previous receipt, and every failure, skip, and timeout came from another tool or an unsupported pairing. The `dist/` in the npm tarball matches the measured build.
- Gronify, `00d9502` → 1.3.1: 1 GiB flatten 3.83 → 3.63 s (80 → 65 MiB); 1 GiB search count 4.47 → 4.27 s (75 → 55 MiB); 2.2 GiB unflatten 5.56 → 5.10 s; first 10 matches 40 → 33 ms; 1 MB flatten 48 → 37 ms; 50,000-level piped flatten 0.54 → 0.52 s. All 32 Gronify workloads got faster, and the tools finish in the same order within each workload.
- The landing page now shows 1.3.1 (`site-config.ts`, `llms-full.txt`). Its benchmark copy is derived from the receipt, so the page and the receipt now report the same version.

### 2026-11-04 — Node flatten/search performance pass

- Ports the Rust prototype's cheap wins to the Node CLI. Regular files are read through one reused block (1 MiB for paths, 64 KiB for redirected stdin, matching the stream reads). Predictable tokenizer transitions skip the dispatch loop. Literals are validated on bytes, array indexes count up in place, and escaped strings and keys are normalized on bytes. Common command lines start without loading commander, chalk, crypto, fs/promises, net or the sorter.
- Output is byte-identical to `fe9631c`. Checks: about 16,000 random differential cases (chunk sizes, reused blocks, search/limit/sort modes, mutations), 640 CLI differential cases including colour through a fake TTY, and full-output hashes equal to the Rust native CLI on its suite.
- Interleaved medians of 7 runs, main → branch: tiny flatten 32 → 24 ms; 100 MiB records 0.496 → 0.402 s; 100 MiB events 0.417 → 0.387 s; ensure_ascii-escaped 100 MiB 0.821 → 0.382 s. Peak RSS on file inputs drops 10–40 MiB. Rust native in the same session: 3 ms tiny, 0.176 s records.
- Not done: a fused tokenizer+flattener (a prototype suggested the lead mostly disappears once validation and resumability are added) and a prefix-cached matcher (an estimated 3–5% gain on search). Piped-stdin search RSS is about 8 MiB higher than main, because byte-level literal validation makes GC collect fresh stdin chunks less often.

### 2026-11-04 — Rust prototype removed

- Deleted `native/` and `.github/workflows/native.yaml`, the native benchmark section and data on the landing page, and the native receipt check in `scripts/validate-metadata.mjs`. README, PRODUCT, docs, and llms files now describe only the Node/npm CLI.
- Landing page: the benchmark section reads as benchmarks of the Gronify CLI, without source-build versus npm framing; the displayed release comes from `site-config.ts` (now 1.3.0).

### 2026-11-04 — Benchmark refresh and release status audit

- The November 3 campaign is merged through PR #124. Node changes cover search/output allocation (#110), tokenizer/flatten throughput (#111), streaming unflatten (#112), closed-pipe cancellation (#113), and bounded literal validation to recover record-stream memory use (#119).
- An experimental Rust prototype (#122, #123) also existed at this point; it was removed later the same day.
- Fresh serial benchmarks at `00d9502` cover 32 CLI workloads. The landing page reads the new receipt and reports medians and failure/skip outcomes. See [validation](docs/benchmarks/2026-11-04/validation.md).
- PR #124 preserves and audits the historical integrated measurements at `2017be1`. Those measurements predate the latest parser changes and must not be presented as current-main results.
- Issues #3, #4, and #18 remain open for the roadmap items listed above. Merged CLI performance fixes do not complete their extension, UI, distribution, or observability scope.

### 2026-11-01 — Landing page and llms.txt for 1.2.0 (#101)

- The landing page, `llms.txt`, `llms-full.txt`, and `PRODUCT.md` now cover npm install, streaming, result caps, `--sort`, `--exit-status`, `-o`, and `-v`. Memory claims say about 100 MB on the default path; `--sort` on a large object and out-of-order `unflatten` input use more.
- Page transcripts were wrong (trailing `;`, sorted keys, multi-line `unflatten` output without `--pretty`) and now match the 1.2.0 CLI. The `flatten | sort` recipe became `diff` on `flatten --sort` output, and the filter-and-reconstruct recipe keeps the `json = ...` root line so `unflatten` accepts it.
- Issues #3, #4, and #18 stay open with comments listing what shipped and what remains.

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

## 2026-11-01 — Cross-tool benchmark

- Added `src/packages/cli/scripts/bench-compare.mjs` (`npm run bench:compare`): gronify vs gron 0.7.1, fastgron 0.7.7, jq 1.8.2, jaq 3.1.2 on generated records (1 MB to 1 GB), keyed-object, deeply nested, and big-integer inputs. Timing, peak RSS, and correctness checks are written by the script to `landing-page/src/app/benchmark-results.json` and `src/packages/cli/BENCHMARKS.md`; nothing in those files is hand-edited.
- CLI tests (548) and `npm run lint` pass.
- Review fixes to `bench:compare` (schemaVersion 2): at least 3 runs at every size by JSON size, 5% tie rule, cache warm-up and tool rotation per run, compact fastgron unflatten, piped-output flatten variant, OS-kill handling, recorded options and binaries. Re-run took 45.6 min; results regenerated.
- Landing page: added a `#benchmarks` section (bars for time and peak memory at 1 GB, wins and losses, capability matrix, machine and versions, reproduce command), a nav link, an FAQ entry, and llms.txt mentions. All figures are derived from `benchmark-results.json` in `benchmark-data.ts`, which fails the build if regenerated results stop supporting the copy.
- Landing page claims follow schemaVersion 2: ties come from `isTie`, "fastest" from `isFastest`, status labels from `reasonCode`, and the 50,000-level headline uses the piped run. Next: re-run `npm run bench:compare` when tool versions change and rebuild the landing page.
