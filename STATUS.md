# Status

## Completed

- Retained the published `v1.0.0`, bundled executable, Homebrew formula, and standalone TypeScript engine from `main`.
- Rebuilt the landing page as an information-rich dark Linear-derived workbench.
- Updated landing-page product facts for built-in flatten, unflatten, and search behavior with no external CLI requirements.
- Added product and design-system records plus Hallmark project memory.
- Added Better Design MCP to the global OpenCode config outside the repository.
- Refined landing-page motion against the transitions.dev token scale: installed motion tokens in `globals.css`, retimed the nav link hover to 150ms smooth-out, added a CSS-only hero reveal and a 40ms-per-line terminal transcript stagger, and hardened the `prefers-reduced-motion` guard.

## Verification

- Landing-page ESLint: passing with 0 errors.
- Next.js production build: passing and statically prerendered.
- Impeccable design detector: 0 findings.
- Responsive Chromium checks: 320, 375, 414, 768, and 1280px pass with no horizontal overflow.
- Motion polish PR checks: all CI jobs and the Vercel preview deployment passing.

## Next

- Open and merge the landing-page redesign pull request.

## 2026-10-05 — Dependency verification

- Added weekly Dependabot updates for the landing-page npm package; existing devcontainer, CLI npm, and GitHub Actions entries remain unchanged.
- CLI checks pass on Node 20 and 22 (19 tests, zero audit findings). Landing-page lint and production build pass on Node 22.
- Landing-page audit remains blocked by five high-severity dependency findings from one unpatched `braces` advisory (`GHSA-vfj7-8cjw-p6xm`). The published `braces` version is 3.0.3; npm's forced fix downgrades `eslint-config-next` from 15.5.25 to 14.2.35. Retained the compatible Next.js lint stack and recorded the finding for review.
- Next: review the isolated dependency branch and revisit the audit when a compatible patch ships.

## 2026-10-05 — Landing audit follow-up

- Restored the landing-page CI audit across production and development dependencies with `audit-ci`. Only `GHSA-vfj7-8cjw-p6xm` is allowlisted in `landing-page/audit-ci.jsonc`.
- `npm run audit` passes with that exception; the same audit exits 1 when run with an empty allowlist. CLI tests pass (19/19), both packages lint/build, and repository metadata/format checks pass.
- Corrected the workflow comment: Vercel serves the Next.js app; it is not a static export.
- Next: review the follow-up PR and remove the exception when a compatible `braces` fix ships.

## 2026-10-17 — Audit fixes, release automation, and CLI UX

- Merged #73: landing page on Next 16.4.0 with `sharp` 0.35.5 and `source-map-js` 1.2.2 overrides; CLI `npm audit fix` for the critical `handlebars` advisory (ts-jest dev dependency, now 4.7.10). The CLI audit now uses `audit-ci` with one allowlisted advisory, `GHSA-hp3w-g68c-fv3c` (sprintf-js <= 1.1.3, no patched release, reached only through jest coverage tooling). `npm audit --omit=dev` reports zero findings.
- Merged Dependabot #43 (actions/checkout v7) and #62 (lightningcss-linux-x64-gnu 1.33.0); closed #69 as superseded by #73.
- Merged #72: Dependabot ignores TypeScript >= 7 in both npm directories and groups react, react-dom, and their types.
- Merged #44 as `feat(cli)`: `-o/--output`, `search -v/--invert-match`, and error tips. Review fix: tips now print only for JSON or gron parse errors, and the empty-search tip no longer suggests `--case-sensitive`. CLI tests: 46/46.
- Merged #74: release-please manages `src/packages/cli` from the existing `v1.0.0` tag; merged release PRs build the Homebrew tarball, zip, and checksums, then publish to npm with provenance when `NPM_TOKEN` is set. Review fix: the artifacts job skips when the release already has its tarball, so a second tag-push run cannot change published checksums or double-publish.
- First release-please run on `main` computed the release from 11 CLI commits and pushed its branch, then failed with "GitHub Actions is not permitted to create or approve pull requests".

### Owner actions

- Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or add a `RELEASE_PLEASE_TOKEN` secret, then re-run the Release workflow.
- Add an `NPM_TOKEN` secret to publish `gronify` to npm.
- After the next release, update `Formula/gronify.rb` in the Homebrew tap with the new `url` and `sha256`, and drop `depends_on "fastgron"`; the CLI no longer needs it.
- Remove the `GHSA-hp3w-g68c-fv3c` and `GHSA-vfj7-8cjw-p6xm` allowlist entries once fixes ship.

## 2026-10-30 — Streaming unflatten

- `gronify unflatten` reads a byte stream and writes JSON through a backpressure-aware buffered writer, so memory stays flat. New modules live in `src/packages/cli/src/unflatten-stream.ts` and `src/packages/cli/src/unflatten/`; the `unflatten` action in `index.ts` loads them lazily.
- Merged #95 (`origin/main` e3ac1a1). `unflattenStream` now takes an `OutputSink` from `src/output.ts` instead of opening files itself, for stdout and `-o` alike. Its `OutputBuffer` stays as a thin hold-and-discard buffer in front of the sink (the streaming pass has to throw held output away when out-of-order input shows up in the first 16 MiB, which `GronOutput`'s line-oriented API cannot do); it never creates a file. `emit` is awaited on every path, and the colour path (a pty only; chalk is off without a TTY) reports an unwritable `-o` in one line.
- Review fixes (all with tests): `-o` is atomic through the sink, so `-o` may name the input file and invalid input past 16 MiB, or out-of-order input past the budget, leaves an existing target alone (CLI tests use inputs over 16 MiB). An unwritable `-o` gives a one-line error and exit 1 for small and large inputs. `\v` and `\f` inside values are rejected (only space, tab, LF and CR are JSON whitespace) while each line is still trimmed of Unicode whitespace like `String.prototype.trim` (U+00A0, U+3000, ...). The post-budget error now says that more than 16 MiB of input was read or output produced, instead of "Input larger than 16 MiB". Big integers in one-line compound values (`json.a = {"n":12345678901234567890}`) are kept verbatim by a small iterative parser in `unflatten/compound.ts`. The README now says repeated assignments write duplicate keys.
- Document-order gron (what `flatten` writes) converts in one pass. Out-of-order input seen before the first 16 MiB of input or output is rebuilt with an in-memory tree; later it fails with `line N: ...` and a document-order explanation.
- Numbers are validated and written verbatim (`12345678901234567890`, `1.10`, `-0`); strings are normalized to `JSON.stringify` form; skipped array indexes stream out as `null`; `--pretty` is generated directly and matches `JSON.stringify(value, null, 2)` (except for repeated keys); `--color` output is byte-identical to the previous build.
- Benchmarks after the merge (`node scripts/bench-unflatten.mjs`, Apple M5 Pro, Node 22.23.1, stdout to /dev/null, best of 3). Before is `main` at `07c1c86`:

  | Input                               | Before                  | After               |
  | ----------------------------------- | ----------------------- | ------------------- |
  | 56 MB gron                          | 0.91 s, 515 MB RSS      | 0.19 s, 95 MB RSS   |
  | 285 MB gron                         | 4.85 s, 2068 MB RSS     | 0.76 s, 117 MB RSS  |
  | 600 MB gron                         | fails (string too long) | 1.70 s, 97 MB RSS   |
  | 3 GB gron (9.8M records)            | not possible            | 7.31 s, 100 MB RSS  |
  | 285 MB gron, out of order at line 3 | 5.50 s, 2100 MB RSS     | 3.28 s, 1259 MB RSS |

  The 600 MB and 3 GB rows and the out-of-order row are from the pre-merge run. Node 20.20.2 gives 0.86 s and 87 MB for the 285 MB file. A 1.0 GB JSON file (5.1M records with escapes, big integers, empty containers) went through `flatten | unflatten` in 19.8 s; the output was byte-identical to the input plus the trailing newline, and peak RSS was 93 MB for `unflatten` (151 MB for `flatten` writing to a pipe). The generated files were deleted. 67 random documents round-trip with 0 failures.

- Tests: 425 passing on Node 20.20.2 and 22.23.1 (the suite includes #95's), lint, format check and build clean.
- Behavior changes: numbers keep their spelling (`1e999` is no longer turned into `null`); keys containing `=` and values containing U+2028 now parse; a repeated object key in streamed output is written twice (parsers keep the last); out-of-order input past 16 MiB is an error instead of an in-memory rebuild; array indexes above 4294967294 are rejected.
- Next: review and merge. `unflattenGron` stays in `gron.ts` only as the reference implementation for the differential tests; drop it if those tests are retired.

## 2026-10-29 — Streaming flatten and search

- `flatten` and `search` now stream: a hand-written byte-level JSON tokenizer reads 1 MB chunks (file or stdin), an iterative path-stack flattener writes gron lines into 1 MB blocks, and a backpressure-aware writer feeds stdout or the `-o` file. Memory no longer depends on input size or nesting depth. `unflatten` is untouched.
- Plain `search` is a Horspool byte search (ASCII case folding for the default case-insensitive mode; non-ASCII case-insensitive terms and `--regex` use a precompiled RegExp). Rejected lines are rewound in the output block without being copied. `--color` and `--pretty` are applied per line with the same output as before (verified byte-for-byte against the old CLI in a pty).
- Intentional behavior changes: numbers print verbatim from the source; object keys keep document order; duplicate keys are all emitted; strict JSON with byte offset, line, and column in errors; invalid UTF-8 is rejected; on stdout a mid-stream error keeps what was already written (possibly nearly all of it, since each input chunk is flushed) and still exits 1 with the message; a search with no matches creates no `-o` file.
- Review fixes (PR #95): `-o` is now atomic. `src/output.ts` exports `OutputSink` (`open()`, `commit()`, `abort()`) and `createOutputSink(file?)`; `GronOutput` takes a sink, and `emit` (unflatten, `--count`) uses it too, so `unflatten` in #94 can reuse it. A file sink writes `.<name>.<pid>.<random>.tmp` beside the target and renames it over the target on commit; any error, or no output at all, removes the temp file and leaves the target untouched. It keeps the target's mode, writes through symlinks, writes devices and pipes (`-o /dev/null`) in place, and removes the temp file on SIGINT/SIGTERM. This fixes `gronify -o a.json flatten a.json`. README and the agent skill now say stdout may hold partial output after an input error (check the exit status, use `set -o pipefail`) and that `-o` is atomic; the README `é` example got its backslash back; `output.ts` explains why block reuse on `writableLength === 0` is safe for the streams the CLI uses.
- Benchmarks after the review fixes are unchanged (Node 22.23.1, best of 3): 23 MB flatten 0.18 s / 81 MB, search --count 0.19 s / 78 MB; 129 MB flatten 0.82 s / 91 MB, search --count 0.88 s / 90 MB. `-o` flatten of 23 MB takes 0.18 s before and after.
- Benchmarks (Node 22.23.1, macOS arm64, stdout to /dev/null, `npm run bench`, best of 3):

| Input | Command | Before | After |
| --- | --- | --- | --- |
| 23 MB | flatten | 0.69 s, 1023 MB RSS | 0.18 s, 80 MB RSS |
| 23 MB | search --count | 0.64 s, 778 MB RSS | 0.19 s, 78 MB RSS |
| 129 MB | flatten | 4.23 s, 4457 MB RSS | 0.85 s, 92 MB RSS |
| 129 MB | search --count | 3.72 s, 3617 MB RSS | 0.92 s, 88 MB RSS |
| 3.50 GB | flatten | not run; old build fails above ~240 MB | 22.1 s, 98 MB RSS |
| 3.50 GB | search --count | not run; old build fails above ~240 MB | 24.5 s, 96 MB RSS |
| 100,000 levels deep | flatten | not run; old build overflows the stack near 2,000 levels | 0.17 s, 63 MB RSS (10 GB of output) |

- Tests: 203 passing on Node 20.20.2 and 22.23.1 (tokenizer chunk splits at every byte, 300-document randomized equivalence with `flattenJson(JSON.parse(x))`, CLI stdin, `-o` onto its own input for flatten and search on 4 MB+, invalid input past the first flush leaving an existing `-o` file byte-identical with no temp files, unwritable and missing `-o` directories, SIGTERM cleanup, closed pipe, hang, deep nesting).
- Next: review and merge the streaming PR; `unflatten` streaming is in #94.

## 2026-10-29 — Landing audit fix

- The Landing page CI audit failed on `main` with five new advisories: `next` 16.4.0 (`GHSA-2464-fhr4-w9xw`, `GHSA-673q-mjm6-r5xr`, `GHSA-p3m5-59mp-jv5r`) and `dompurify` <= 3.4.16 (`GHSA-cg2g-xh64-v4q7`, `GHSA-mrv2-3pqr-j5jr`).
- Fixed by bumping `next` to 16.4.3 (same major) and adding a `dompurify` 3.4.17 override. `dompurify` arrives through `posthog-js`, which declares `^3.4.13` even in its latest release, so an override is the only way to move it. No allowlist entries added.
- `npm ci`, `npm run audit`, `npm run lint`, and `npm run build` pass on Node 22.
- The `GHSA-vfj7-8cjw-p6xm` (`braces`) allowlist entry is no longer needed: the audit passes with an empty allowlist. Left in place here; remove it in a follow-up.

## 2026-10-30 — Agent features: result caps, sorting, exit status

- `search -m/--max-count <n>` and `flatten --limit <n>` stop after `n` lines (grep semantics; `-v` counts non-matching lines; `--count` counts up to `n`). `GronOutput` takes a `limit`, sets `stopped` and holds `blocked` when it is reached, and `flattenStream` then breaks out of the read loop and destroys the input. The rest of the input is never read or validated. Exit code 0; a one-line notice goes to stderr (`Stopped after 20 matches (--max-count); there may be more`), stdout stays clean. `n` must be a positive safe integer (commander `InvalidArgumentError`). With `-o` the capped output is committed through the same atomic sink.
- `--sort` on `flatten` and `search` sorts object keys at every level by UTF-16 code unit order, keeps each subtree together and leaves arrays alone. This is not gron's order (see the review fixes below). Document order stays the default; README and skill now say so. `src/sort.ts` (`SortingSink`) wraps the existing flattener and never builds JS values: each container keeps its lines as bytes in an `Arena` plus a key and two offsets per member. Small closed children (<= 4 KB) are copied into the parent, bigger ones are referenced and read in place, and one iterative walk writes the tree in key order. Arrays under the root (or under such arrays) stream through, so a top-level array of records needs one record at a time. Over 64 MiB of buffered line data (`GRONIFY_SORT_MEMORY`, bytes) buffers go to an anonymous temp file (unlinked at creation). The search filter runs before buffering, `--sort` is ignored with `--count`, and caps apply to the sorted order (a root object is read to the end first). Memory is documented in `--help` and the README.
- Big integers: streaming flatten/search already printed numbers verbatim; README and skill now state it as an advantage over `jq`, with regression tests for `12345678901234567890` and `1.10` through `flatten`, `flatten --sort`, and `search`.
- `search --exit-status`: exit 1 when nothing is selected (a cap that was reached counts as a match; `--count` still prints `0`). The existing error code is 1, which collides with "no match", so with the flag errors (including usage errors, via `exitOverride`) exit 2; without it nothing changes. All codes are in a README table.
- Skill rewritten: explore with `--count` first, then `-m`/`--limit`, `--sort` for diffing, check exit status, exact numbers. The "not published on npm" claim is gone (`gronify@1.1.0` is on npm and `release.yaml` publishes); README has an npm install section. `scripts/validate-metadata.mjs` no longer forbids the npm install line, and its `diff` rule now only flags a claimed `gronify diff` command.
- Edits kept away from `unflatten` (`index.ts` changes are in the option setup, `flatten` and `search` actions, and one `exitOverride`; README additions sit in new sections; tests are in new files) to limit conflicts with #94.
- Benchmarks (Node 22.23.1, macOS arm64, stdout to /dev/null, `npm run bench -- --baseline <origin/main build>`, best of 3). The default path did not regress:

| Input | Command | origin/main | This branch |
| --- | --- | --- | --- |
| 23 MB | flatten | 0.18 s, 81 MB RSS | 0.19 s, 81 MB RSS |
| 23 MB | search --count | 0.19 s, 78 MB RSS | 0.19 s, 79 MB RSS |
| 129 MB | flatten | 0.81 s, 92 MB RSS | 0.83 s, 92 MB RSS |
| 129 MB | search --count | 0.88 s, 90 MB RSS | 0.87 s, 90 MB RSS |
| 23 MB | flatten --sort | n/a | 0.44 s, 84 MB RSS |
| 129 MB | flatten --sort | n/a | 2.23 s, 139 MB RSS |
| 23 MB / 129 MB | search -m 5 | n/a | 0.03 s, 54 MB RSS |

- Early exit on a generated 1.2 GiB array of records (deleted afterwards): `search -m 5 status` 0.03 s, 57 MB RSS (a full `search --count` of the same file takes 8.5 s); `flatten --limit 3` 0.03 s; `cat file | gronify search -m 2` 0.04 s. A 270 MiB file that is one object with 1.5M scrambled keys: `flatten --sort` 7.4 s, about 500 MB RSS (350 MB with a 4 MiB buffer), output verified sorted with every line present, identical with and without spilling.
- Tests: 548 passing after merging #94 (the 311 count was before the merge; new: `sort.test.ts`, `limit.test.ts`, `agent-features.test.ts`: randomized sorted equivalence with tiny memory limits, spill, backpressure, line-by-line limits, never-ending stdin, `-o` with caps, exit codes, exact numbers). `npm run lint`, `format:check`, `build`, and `test` pass in `src/packages/cli`; repository metadata and prettier checks pass.
- Review fixes (PR #98 review, merged `origin/main` with #94 first):
  - Merge: kept both sides in `README.md`, `SKILL.md` and `index.ts`. `unflatten` streams, so the skill no longer says it reads its whole input into memory; both docs say `flatten --sort` output is in document order and streams through `unflatten` (a test pipes ~21 MB of `--sort` output through it, past the 16 MiB budget, with arrays longer than 10 and a big integer), while plain `sort` on the lines does not.
  - Docs no longer claim `--sort` matches gron. Checked against gron 0.7.1 (built with `go install`): gron puts every bare key before every bracketed key at a level, compares UTF-8 bytes (`"～"` before `"😀"`) and merges duplicate keys. Gronify keeps UTF-16 order per level, subtrees together, array index order. README and skill say how it differs from gron and from `sort`, and why it suits diffing. PR description updated.
  - Deep nesting: a container's own line is now the first entry of its frame's arena (key `""`, so it sorts first), counted by `GRONIFY_SORT_MEMORY` and spilled. `Arena.spill` also drops its buffer, so idle capacity is no longer hidden from the limit. 20,000 levels (`{"z":1,"a":` repeated): 1031 MB RSS before, 453 MB with the default limit, 276 MB with `GRONIFY_SORT_MEMORY=1MB` (before the limit changed nothing: 1044 MB); unsorted 60 MB. The rest is V8 heap for 20k open frames plus garbage that is not collected yet (141 MB when run with `--max-old-space-size=48 --max-semi-space-size=1`). Output is byte-identical (checked with a hash on the 137 MB and 20k-deep files). Test: `sort.test.ts` checks that all but ~2 limits' worth of the lines of a 3000-deep document reach the temp file (it fails on the old code).
  - Speed: 137 MB array of records (a nested user object and an items array each), best of 3, `flatten --sort` to /dev/null: 4.25 s before, 2.67 s after (unsorted 0.96 s). Changes: a fill loop and insertion sort for objects with up to 16 keys instead of `Uint32Array.from` with a mapper, `keys.length = 0` instead of `splice(0)`, no head `Buffer` per container, arrays inside objects get no `Frame` (their lines are entries of the object under the array's key; adjacent entries under one key share a range), and small ordered frames are copied straight into the parent or the output instead of through the walk generator.
  - `validate-metadata.mjs`: the `diff` rule ignores code spans and fenced blocks and rejects claim-shaped phrases ("search, inspect, and diff", "Gronify diffs JSON", "Flattens, searches, and diffs JSON", "Diff two JSON files", "a diff mode", "diff support", "JSON diffing"). It now also scans `SKILL.md`. The repo has no tests for the script, so I checked it against 10 claims and 8 honest uses with a throwaway harness. The skill description now says "makes JSON diffable".
  - npm docs: README and skill say the caps, `--sort` and `--exit-status` need Gronify 1.2.0 or newer (release-please makes the next release 1.2.0 for these `feat` commits; manifest is at 1.1.0), and tell agents to check `gronify --version` or `gronify search --help` first and fall back to `| head`.
  - Nits: "1 line"/"1 match" singular; the stop notice is silent when only whitespace and closing brackets follow the cap in the same chunk (`JsonTokenizer.finishesAt`), still hedged for `--sort` and when later chunks may follow; `GRONIFY_SORT_MEMORY` takes bytes or KB/MB/GB (powers of 1000) and KiB/MiB/GiB, and anything else is an error (exit 1, 2 with `--exit-status`) instead of being ignored.
- Next: review and merge this PR. The landing page and `llms*.txt` still describe only flatten/search/unflatten; update them in a separate change.

## 2026-10-31 — Open PR sweep

- Reviewed all seven open PRs with Sonnet (Dependabot landing bumps) and Opus (#88, #90, #97) reviewers.
- Merged #88 (release-please-action v5; only change is the node24 runtime) and #93 (@eslint/eslintrc patch).
- Bundled #89 (React 19.3.1), #91 (posthog-js), #92 (@primer/react-brand 0.80.1) and #90 (eslint-config-next 16.4.3) into one PR. It also migrates `eslint.config.mjs` from FlatCompat to the native flat config, because eslint-config-next 16 no longer works with FlatCompat. `@eslint/eslintrc` was dropped as unused.
- Landing audit: removed the braces allowlist entry (GHSA-vfj7-8cjw-p6xm), which no longer matches anything. Allowlisted GHSA-g3hv-75wg-m249 (minimatch, published 2026-10-30, fixed only in minimatch 11, dev-only lint tooling). That advisory also fails on main.
- Landing ci, lint, build, and audit all pass locally. Release PR #97 (1.2.0) merges last.
