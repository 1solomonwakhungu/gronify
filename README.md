<div align="center">
  <img src="branding/logo.svg" alt="Gronify logo" width="180" height="180">
</div>

# Gronify

Gronify is a local-first CLI for turning JSON into greppable paths, searching those paths, and round-tripping gron output back to JSON. It is built as a thin TypeScript wrapper around [fastgron](https://github.com/adamritter/fastgron) with colored terminal output and stdin/stdout support.

For platform and developer-experience teams, Gronify is useful when large JSON payloads show up in CI logs, service responses, support bundles, generated config, or incident debugging sessions and need to be inspected with familiar shell tools.

## Features

- Flatten JSON files or stdin into gron-style path assignments.
- Unflatten gron files or stdin back into JSON through `fastgron -u`.
- Search flattened paths with plain text, extended regex, case-sensitive matching, and match counts.
- Use stdin/stdout workflows so Gronify can sit inside shell pipelines.
- Format terminal output with optional colors and pretty indentation.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- `fastgron` on `PATH`.
- `grep` on `PATH` for the `search` command.

`grep` is available by default on macOS and most Linux environments. On Windows, use WSL, Git Bash, or another shell environment that provides `grep`.

## Install

Gronify is currently installed from source. This repository does not claim an npm package release.

1. Install `fastgron`.

   ```bash
   brew install fastgron
   ```

   For non-Homebrew installs, use the options documented by the [fastgron project](https://github.com/adamritter/fastgron).

2. Clone and build Gronify.

   ```bash
   git clone https://github.com/1solomonwakhungu/gronify.git
   cd gronify/src/packages/cli
   npm ci
   npm run build
   ```

3. Link the local CLI.

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

| Option          | Description                                   |
| --------------- | --------------------------------------------- |
| `--color`       | Force colored output.                         |
| `--no-color`    | Disable colored output.                       |
| `--pretty`      | Add indentation/grouping to formatted output. |
| `-h, --help`    | Show help.                                    |
| `-V, --version` | Show the CLI version.                         |

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

The integration tests shell out to `fastgron`, so install `fastgron` before running the test suite.

## Repository Layout

```text
.
|-- branding/              # Logo and icon assets
|-- landing-page/          # Next.js marketing/demo page
|-- scripts/               # Repository validation and package discovery helpers
|-- src/
|   |-- README.md          # Source tree orientation
|   `-- packages/cli/      # TypeScript CLI package
`-- .github/               # CI, Dependabot, and contribution templates
```

## Troubleshooting

### `fastgron not found`

Install `fastgron` and confirm it is on `PATH`:

```bash
fastgron --help
```

### `grep` errors when running `search`

The `search` command pipes flattened output into `grep`. Use macOS, Linux, WSL, Git Bash, or another environment where `grep` is available.

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

- [fastgron](https://github.com/adamritter/fastgron) provides the JSON flattening and unflattening engine.
- [gron](https://github.com/tomnomnom/gron) established the greppable JSON workflow that inspired this project.
- [commander.js](https://github.com/tj/commander.js) powers the command interface.
- [chalk](https://github.com/chalk/chalk) powers colored terminal output.
