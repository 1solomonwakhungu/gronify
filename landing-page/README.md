# Gronify Landing Page

This is the Next.js landing page for Gronify. The copy should stay aligned with the root README: Gronify is a local-first, standalone CLI for flattening JSON into greppable paths, searching those paths, and round-tripping gron output back to JSON.

## Development

Install dependencies from this directory:

```bash
npm ci
```

Run the local development server:

```bash
npm run dev
```

Open <http://localhost:3000> to view the page.

## Validation

Run these checks before changing landing-page copy or dependencies:

```bash
npm run lint
npm run build
npm run audit
```

The audit checks production and development dependencies at moderate severity or higher. `audit-ci.jsonc` allows only the currently unpatched dev-only `minimatch` advisory (`GHSA-g3hv-75wg-m249`) in the ESLint plugin chain; new advisories fail the check.

The repository metadata validation (`scripts/validate-metadata.mjs`) also scans `landing-page/src/app/layout.tsx`, `page.tsx`, `home.tsx`, `site-chrome.tsx`, `benchmarks.tsx`, `benchmark-data.ts`, `seo-data.ts`, `opengraph-image.tsx`, `guides/page.tsx`, `guides/guide-article.tsx`, `landing-page/public/llms.txt`, and `landing-page/public/llms-full.txt` for stale claims that are not supported by the current project. Files in `guides/content/` are scanned too, without the claim-shaped diff phrases, because a guide may explain comparing two JSON files with the system `diff` tool.

## Guides

Each page under `/guides/<slug>` answers one search question. A guide is typed data, not JSX: the template decides every tag, class, and heading level, so guides cannot drift from the design in `DESIGN.md`.

To add a guide:

1. Create `src/app/guides/content/<slug>.ts` that exports a `Guide`. `src/app/guides/types.ts` documents every field, the block kinds (paragraph, subheading, terminal transcript, list, table), and the inline markup (`` `code` `` and `[label](href)`). `content/grep-json.ts` is the reference example.
2. Add one import line and one array line to `src/app/guides/registry.ts`.

The route, the `/guides` index, `sitemap.xml`, the canonical URL, Open Graph tags, and the `TechArticle`, `BreadcrumbList`, and `FAQPage` JSON-LD all come from the registry, so nothing else needs editing.

Rules the build enforces (`src/app/guides/validate.ts` fails `npm run build` and names the guide and field):

- `title` is at most 60 characters and `description` is 140 to 160.
- `published` and `updated` are `YYYY-MM-DD`, and `updated` is not earlier than `published`.
- Section ids are unique kebab-case and are not `top`, `faq`, or `related`.
- Inline markup is well formed, and every link starts with `/`, `#`, or `https://`.
- Table rows have one cell per column.

Every command and output line in a transcript must be pasted from a real run of the built CLI (`cd src/packages/cli && npm ci && npm run build`, then `node dist/index.js ...`).

A slug in `related`, or an inline link to `/guides/<slug>`, may name a guide that is not registered yet. It is left out (or rendered as plain text) until that guide lands.

The header and footer live in `src/app/site-chrome.tsx` and are shared by the home page and the guides.

## Deploy Notes

The landing page is deployed at <https://gronify.vercel.app> from the `landing-page` directory. Keep deployment configuration outside this package unless the repository adds a checked-in deployment workflow.

Before using a deployed URL as repository homepage metadata, verify that the deployment returns a successful HTTP response.

## Benchmark section

The benchmark section renders from `src/app/benchmark-results.json`, which `npm run bench:compare` writes. `benchmark-data.ts` derives every figure in the copy from that file and describes the recorded outcomes without assuming a particular winner or tie. Invalid successful measurements and missing required workloads fail the build. The page links the source commit that was measured. Chart rows retain skipped and failed outcomes; jq parser-event output is labelled separately and mixed-workflow charts do not assign winner badges. It is server-only: `page.tsx`, a server component, derives the copy and passes only those plain values as props to the client components `home.tsx` and `benchmarks.tsx`, so the results JSON does not ship in a client bundle. `llms.txt` and `llms-full.txt` are static, so keep their benchmark text qualitative.
