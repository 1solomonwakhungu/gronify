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

The repository metadata validation (`scripts/validate-metadata.mjs`) also scans `landing-page/src/app/layout.tsx`, `landing-page/src/app/page.tsx`, `landing-page/src/app/seo-data.ts`, `landing-page/src/app/opengraph-image.tsx`, `landing-page/public/llms.txt`, and `landing-page/public/llms-full.txt` for stale claims that are not supported by the current project.

## Deploy Notes

The landing page is deployed at <https://gronify.vercel.app> from the `landing-page` directory. Keep deployment configuration outside this package unless the repository adds a checked-in deployment workflow.

Before using a deployed URL as repository homepage metadata, verify that the deployment returns a successful HTTP response.
