# Gronify Source Tree

This directory contains source packages for Gronify.

## Packages

- `packages/cli`: TypeScript command-line interface for flattening, unflattening, and searching JSON through `fastgron`.

## CLI Development

```bash
cd src/packages/cli
npm ci
npm run build
npm test
```

The CLI tests require `fastgron` on `PATH` because the test suite runs the built command against real fixture files.

See the repository [README](../README.md) for installation, usage, demo, troubleshooting, contribution, security, and license details.
