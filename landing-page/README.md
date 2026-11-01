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

The audit checks production and development dependencies at moderate severity or higher. `audit-ci.jsonc` allows only the currently unpatched `braces` advisory (GHSA-vfj7-8cjw-p6xm) in the lint-time dependency chain; new advisories fail the check.

The repository metadata validation also scans `landing-page/src/app/layout.tsx`, `page.tsx`, `home.tsx`, `benchmarks.tsx`, and `benchmark-data.ts` for stale claims that are not supported by the current project.

## Deploy Notes

The landing page can be deployed as a standard Next.js app from the `landing-page` directory. Keep deployment configuration outside this package unless the repository adds a checked-in deployment workflow.

Before using a deployed URL as repository homepage metadata, verify that the deployment returns a successful HTTP response.

## Benchmark section

The "How Gronify compares" section renders from `src/app/benchmark-results.json`, which `npm run bench:compare` writes. `benchmark-data.ts` derives every figure in the copy from that file and fails the build if the data stops supporting a sentence. It is server-only: `page.tsx` renders `benchmarks.tsx` on the server and passes it to the client `home.tsx` as a prop, so the results JSON does not ship in a client bundle. `llms.txt` and `llms-full.txt` are static, so keep their benchmark text qualitative.
