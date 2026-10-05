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
