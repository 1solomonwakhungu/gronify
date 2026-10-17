[![skills.sh](https://skills.sh/b/1solomonwakhungu/gronify)](https://skills.sh/1solomonwakhungu/gronify)

<div align="center">
  <img src="branding/logo.svg" alt="Gronify logo" width="180" height="180">
</div>

# Gronify

Gronify is a local-first, standalone CLI for turning JSON into greppable paths, searching those paths, and round-tripping gron output back to JSON. Flattening, unflattening, and search are built in, with no external command-line tools required.

For platform and developer-experience teams, Gronify is useful when large JSON payloads show up in CI logs, service responses, support bundles, generated config, or incident debugging sessions and need to be inspected with familiar shell tools.

## Agent skills

Install the Gronify agent skill with the open `skills` CLI:

```bash
npx skills add https://github.com/1solomonwakhungu/gronify --skill gronify-json-flatten-search
```

The skill teaches supported coding agents when to flatten, search, and round-trip JSON with the Gronify CLI. Browse it on [skills.sh](https://skills.sh/1solomonwakhungu/gronify/gronify-json-flatten-search).

## Features

- Flatten JSON files or stdin into gron-style path assignments.
- Unflatten gron files or stdin back into JSON.
- Search flattened paths with plain text, extended regex, case-sensitive matching, and match counts.
- Use stdin/stdout workflows so Gronify can sit inside shell pipelines.
- Format terminal output with optional colors and pretty indentation.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.

## Install

### Homebrew

Homebrew installs Gronify together with its `fastgron` and Node.js dependencies:

```bash
brew install 1solomonwakhungu/tap/gronify
```

The formula is maintained in the [Homebrew tap](https://github.com/1solomonwakhungu/homebrew-tap).

### Release Archive

Download the archive for the latest version from [GitHub Releases](https://github.com/1solomonwakhungu/gronify/releases). The executable requires Node.js 20 or newer and `fastgron` on `PATH`.

### From Source

1. Clone and build Gronify.

   ```bash
   git clone https://github.com/1solomonwakhungu/gronify.git
   cd gronify/src/packages/cli
   npm ci
   npm run build
   ```

2. Link the local CLI.

   ```bash
   npm link
   gronify --help
   ```

## Run

Flatten a JSON file:

```bash
gronify flatten data.json
```

Flatten JSON from stdin:

```bash
echo '{"service":"api","retries":2}' | gronify flatten
```

Unflatten gron output back to JSON:

```bash
gronify flatten data.json | gronify unflatten
```

Search flattened paths:

```bash
gronify search data.json "service"
gronify search data.json --regex "users\[[0-9]+\]\.name"
gronify search data.json --case-sensitive "Service"
gronify search data.json --count "error"
```

Use Gronify in a pipeline:

```bash
curl -s https://example.com/payload.json | gronify search --regex "metadata|status"
```

## Demo

Create a sample payload:

```bash
cat > demo.json <<'JSON'
{
  "service": {
    "name": "checkout",
    "status": "degraded"
  },
  "deployments": [
    { "region": "us-central1", "version": "2026.05.22" },
    { "region": "us-east1", "version": "2026.05.21" }
  ]
}
JSON
```

Flatten it:

```bash
gronify flatten demo.json
```

Example output:

```text
json = {};
json.deployments = [];
json.deployments[0] = {};
json.deployments[0].region = "us-central1";
json.deployments[0].version = "2026.05.22";
json.deployments[1] = {};
json.deployments[1].region = "us-east1";
json.deployments[1].version = "2026.05.21";
json.service = {};
json.service.name = "checkout";
json.service.status = "degraded";
```

Find operationally relevant fields:

```bash
gronify search demo.json --regex "status|version"
```

## Command Reference

### Global Options

| Option          | Description                                          |
| --------------- | ---------------------------------------------------- |
| `--color`       | Enable colored output when the terminal supports it. |
| `--no-color`    | Disable colored output.                              |
| `--pretty`      | Add indentation/grouping to formatted output.        |
| `-h, --help`    | Show help.                                           |
| `-V, --version` | Show the CLI version.                                |

### `flatten [file]`

Converts JSON to gron format. If `file` is omitted, Gronify reads from stdin.

```bash
gronify flatten data.json
cat data.json | gronify flatten
```

### `unflatten [file]`

Converts gron format back to JSON. If `file` is omitted, Gronify reads from stdin.

```bash
gronify unflatten data.gron
cat data.gron | gronify unflatten
```

### `search <file_or_term> [term]`

Searches flattened JSON paths. Pass both a file and term, or pipe JSON to stdin and pass only the search term.

| Option                 | Description                       |
| ---------------------- | --------------------------------- |
| `-r, --regex`          | Use extended regular expressions. |
| `-c, --case-sensitive` | Match case sensitively.           |
| `--count`              | Print only the match count.       |

```bash
gronify search data.json "user"
gronify search data.json --regex "user\.[a-z]+"
cat data.json | gronify search "name"
gronify search data.json --count "field"
```

## Development

The CLI package lives in `src/packages/cli`.

```bash
cd src/packages/cli
npm ci
npm run build
npm test
```

Useful package scripts:

```bash
npm run lint
npm run format:check
npm run build
npm test
npm run audit
```

The integration tests run the built CLI directly and require no external binaries.

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/) that touch `src/packages/cli`:

1. Each push to `main` updates an open release PR that bumps `src/packages/cli/package.json` and `src/packages/cli/CHANGELOG.md`. `fix:` gives a patch release, `feat:` a minor release, and `feat!:` or a `BREAKING CHANGE:` footer a major release.
2. Merging the release PR tags `vX.Y.Z` and creates the GitHub release. The release workflow then attaches `gronify-vX.Y.Z.tar.gz`, `gronify-vX.Y.Z.zip`, and `checksums.txt`.
3. If the `NPM_TOKEN` secret is set, the workflow publishes the package to npm with provenance. Without it, the npm step is skipped and the rest of the release still runs.

Pushing a `v*` tag by hand still builds the archives and creates the release.

### One-time setup

- **`NPM_TOKEN`**: add an npm granular access token with publish rights for `gronify` under **Settings → Secrets and variables → Actions**. Releases do not reach npm until this secret exists.
- **Release PR permissions**: enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or add a `RELEASE_PLEASE_TOKEN` secret (a fine-grained PAT with contents and pull-request write access). With the PAT, CI also runs on the release PR, which `GITHUB_TOKEN`-created PRs do not trigger.

### Homebrew

The [Homebrew tap](https://github.com/1solomonwakhungu/homebrew-tap) formula installs the `gronify-vX.Y.Z.tar.gz` release archive. After each release, update the formula's `url` and `sha256` (from `checksums.txt`).

## Repository Layout

```text
.
|-- branding/              # Logo and icon assets
|-- landing-page/          # Next.js marketing/demo page
|-- scripts/               # Repository validation and package discovery helpers
|-- skills/gronify-json-flatten-search/  # Installable agent skill indexed by skills.sh
|-- src/
|   |-- README.md          # Source tree orientation
|   `-- packages/cli/      # TypeScript CLI package
`-- .github/               # CI, Dependabot, and contribution templates
```

## Troubleshooting

### `npm test` fails before running assertions

Build first so `dist/index.js` exists:

```bash
npm run build
npm test
```

### JSON does not flatten

Validate that the input is valid JSON and that files passed to `flatten` are readable from the current shell.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and pull request expectations.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## License

Gronify is licensed under the [MIT License](LICENSE).

## Credits

- [gron](https://github.com/tomnomnom/gron) established the greppable JSON workflow that inspired this project.
- [commander.js](https://github.com/tj/commander.js) powers the command interface.
- [chalk](https://github.com/chalk/chalk) powers colored terminal output.
