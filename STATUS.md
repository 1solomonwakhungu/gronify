# Status

## Completed

- Replaced the `fastgron` and `grep` subprocesses with built-in TypeScript flatten, unflatten, and search behavior.
- Removed external CLI installation requirements from CI, package metadata, contributor guidance, and core documentation.
- Preserved file/stdin input, regex and case-sensitive search, counts, formatting, and gron round trips.

## Verification

- TypeScript build: passing.
- CLI lint, format check, TypeScript build, and package dry run: passing.
- CLI integration tests: 19 passing.
- Landing-page lint and production build: passing.
- Repository metadata validation and `git diff --check`: passing.
- CLI dependency audit: 0 vulnerabilities after refreshing transitive development dependencies.
- Landing-page dependency audit: 0 vulnerabilities after updating Next.js and its build dependencies to satisfy the existing CI gate.

## Next

- Open and merge the pull request.
