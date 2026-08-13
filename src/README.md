# Gronify Source Tree

This directory contains source packages for Gronify.

## Packages

- `packages/cli`: Standalone TypeScript command-line interface for flattening, unflattening, and searching JSON.

## CLI Development

```bash
cd src/packages/cli
npm ci
npm run build
npm test
```

The CLI tests run the built command against real fixture files without external binaries.

See the repository [README](../README.md) for installation, usage, demo, troubleshooting, contribution, security, and license details.
