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

The source-build benchmark section renders from `src/app/benchmark-results.json`, which `npm run bench:compare` writes. `benchmark-data.ts` derives every figure in the copy from that file and describes the recorded outcomes without assuming a particular winner or tie. Invalid successful measurements and missing required workloads fail the build. The page identifies the source revision and separates the measured source build from the npm release. Chart rows retain skipped and failed outcomes; jq parser-event output is labelled separately and mixed-workflow charts do not assign winner badges. It is server-only: `page.tsx`, a server component, derives the copy and passes only those plain values as props to the client components `home.tsx` and `benchmarks.tsx`, so the results JSON does not ship in a client bundle. `llms.txt` and `llms-full.txt` are static, so keep their benchmark text qualitative.

The experimental native section uses the byte-identical `src/app/native-benchmark-results.json` mirror of `native/evidence/current-00d9502/native-results.json` through the server-only `native-benchmark-data.ts` adapter. Keep those figures separate from the default suite: the record fixtures differ. Native charts compare only tools measured on the same fixture and label source-only status and unsupported features. All native figures come from validated completed rows; failed rows remain visible without timing bars. When publishing a new native sweep, copy the receipt into the package, update the evidence link, and verify the mirror with `cmp src/app/native-benchmark-results.json ../native/evidence/current-00d9502/native-results.json`. The mirror keeps deployment builds within the landing-page package root.
