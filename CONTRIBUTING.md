# Contributing

Thanks for helping improve Gronify. Releases are automated from Conventional Commits; see [Releasing](README.md#releasing).

## Development Setup

1. Install Node.js 20 or newer and npm 10 or newer.
2. Install CLI dependencies:

   ```bash
   cd src/packages/cli
   npm ci
   ```

## Local Checks

Run these before opening a pull request:

```bash
cd src/packages/cli
npm run lint
npm run format:check
npm run build
npm test
npm run audit
```

## Pull Requests

- Keep changes focused on one problem.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for pull request titles (`fix:`, `feat:`, `docs:`, `chore:`). Squash merges use the title, and release-please reads it to pick the next version.
- Update documentation when behavior, commands, setup, or troubleshooting changes.
- Add or update tests when CLI behavior changes.
- Do not claim npm availability, hosted releases, support guarantees, or platform integrations unless they exist in the repository.
- Include the commands you ran and any known blockers in the pull request description.

## Issues

When filing an issue, include:

- Operating system and shell.
- Node.js and npm versions.
- The command that failed.
- A minimal input file or snippet that reproduces the behavior.
