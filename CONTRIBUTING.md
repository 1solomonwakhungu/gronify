# Contributing

Thanks for helping improve Gronify. This project is currently source-installed and does not claim an npm release process.

## Development Setup

1. Install Node.js 20 or newer and npm 10 or newer.
2. Install `fastgron` and make sure it is on `PATH`.
3. Install CLI dependencies:

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

If a check fails because of a missing external tool such as `fastgron` or `grep`, document the environment and the exact command output in the pull request.

## Pull Requests

- Keep changes focused on one problem.
- Update documentation when behavior, commands, setup, or troubleshooting changes.
- Add or update tests when CLI behavior changes.
- Do not claim npm publication, hosted releases, support guarantees, or platform integrations unless they exist in the repository.
- Include the commands you ran and any known blockers in the pull request description.

## Issues

When filing an issue, include:

- Operating system and shell.
- Node.js and npm versions.
- `fastgron` install method and version if known.
- The command that failed.
- A minimal input file or snippet that reproduces the behavior.
