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

The repository metadata validation (`scripts/validate-metadata.mjs`) also scans `landing-page/src/app/layout.tsx`, `page.tsx`, `home.tsx`, `benchmarks.tsx`, `benchmark-data.ts`, `seo-data.ts`, `opengraph-image.tsx`, `landing-page/public/llms.txt`, and `landing-page/public/llms-full.txt` for stale claims that are not supported by the current project.

## Deploy Notes

The landing page is deployed at <https://gronify.vercel.app> from the `landing-page` directory. Keep deployment configuration outside this package unless the repository adds a checked-in deployment workflow.

Before using a deployed URL as repository homepage metadata, verify that the deployment returns a successful HTTP response.

## Benchmark section

The "How Gronify compares" section renders from `src/app/benchmark-results.json`, which `npm run bench:compare` writes. `benchmark-data.ts` derives every figure in the copy from that file and fails the build if the data stops supporting a sentence. It is server-only: `page.tsx`, a server component, derives the copy and passes only those plain values as props to the client components `home.tsx` and `benchmarks.tsx`, so the results JSON does not ship in a client bundle. `llms.txt` and `llms-full.txt` are static, so keep their benchmark text qualitative.
