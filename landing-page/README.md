# Gronify Landing Page

This is the Next.js landing page for Gronify. The copy should stay aligned with the root README: Gronify is a local-first CLI for flattening JSON into greppable paths, searching those paths, and round-tripping gron output back to JSON through `fastgron`.

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
npm audit --audit-level=moderate
```

The repository metadata validation also scans `landing-page/src/app/layout.tsx` and `landing-page/src/app/page.tsx` for stale claims that are not supported by the current project.

## Deploy Notes

The landing page can be deployed as a standard Next.js app from the `landing-page` directory. Keep deployment configuration outside this package unless the repository adds a checked-in deployment workflow.

Before using a deployed URL as repository homepage metadata, verify that the deployment returns a successful HTTP response.
