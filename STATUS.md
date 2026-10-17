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
