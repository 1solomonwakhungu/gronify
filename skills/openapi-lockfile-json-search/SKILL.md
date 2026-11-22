---
name: openapi-lockfile-json-search
description: Path-anchored gronify search recipes for OpenAPI/Swagger specs, package-lock.json, kubectl -o json, and AWS JSON. Use when auditing endpoints, deprecated routes, $ref usage, npm versions/tarballs, install scripts, or K8s images/Secrets.
license: MIT
compatibility: Requires Node.js 20+ and the gronify CLI >= 1.2.0 (npm install -g gronify, brew install 1solomonwakhungu/tap/gronify, or npx gronify), plus optional yq for YAML OpenAPI/K8s files.
metadata:
  author: 1solomonwakhungu
  homepage: https://gronify.vercel.app
  repository: https://github.com/1solomonwakhungu/gronify
---

# Search OpenAPI Specs, `package-lock.json`, and Cloud/K8s JSON

OpenAPI descriptions (often 8–15 MB), `package-lock.json`, and `kubectl get -o json` dumps are too big to read whole and too deeply nested for plain `grep`. Use path-anchored `gronify --no-color search --regex` patterns to answer exact questions in one pass.

## Prerequisites & path-anchoring rules

Check `command -v gronify` (or use `npx gronify`). Always pass `--no-color`, check `--count` first, and cap exploratory runs with `-m`.

Remember three Gronify formatting rules when writing JavaScript regexes:

1. Anchor paths with `^json\.` so text inside descriptions or comments does not false-match.
2. Non-identifier keys (URLs, npm paths, hyphenated schemas) print in brackets: `json.paths["/repos/{owner}/{repo}/pulls"]`. Match any bracketed key with `\["[^"]+"\]` and escape literal `[`, `]`, `{`, `}`, `.`, and `$`.
3. Pin to the value side with ` = true$` or ` = "value"$`. In bash/zsh and PowerShell 7+, wrap patterns containing `$` or `"` in single quotes (`'\$ref'`); in Windows PowerShell 5.1 escape inner double quotes (`\"`), and in `cmd.exe` use double quotes.

## OpenAPI and Swagger specs

```bash
# Count and sample endpoints (each path entry opens an object)
gronify --no-color search openapi.json --count --regex '^json\.paths\["[^"]+"\] = \{\}$'
gronify --no-color search openapi.json -m 20 --regex '^json\.paths\["[^"]+"\] = \{\}$'

# List HTTP methods and operationIds on one endpoint
gronify --no-color search openapi.json --regex '^json\.paths\["/repos/\{owner\}/\{repo\}/pulls"\]\.[a-z]+\.operationId = '

# Reverse-lookup URL and HTTP method from an SDK method / operationId
gronify --no-color search openapi.json --regex '\.operationId = "pulls/merge"$'

# Separate deprecated operations from deprecated schema properties
gronify --no-color search openapi.json -m 20 --regex '^json\.paths\["[^"]+"\]\.[a-z]+\.deprecated = true$'
gronify --no-color search openapi.json -m 20 --regex '^json\.components\.schemas(\.|\[).*\.deprecated = true$'

# Inspect OpenAPI 3 auth schemes and global security (Swagger 2.0 uses json.securityDefinitions)
gronify --no-color search openapi.json --regex '^json\.components\.securitySchemes(\.|\[).*\.(type|scheme) = '
gronify --no-color search openapi.json --regex '^json\.security\['

# Find every endpoint referencing a shared schema ($ref prints bare as .$ref)
gronify --no-color search openapi.json --count --regex '^json\.paths.*\.\$ref = "#/components/schemas/simple-user"$'
gronify --no-color search openapi.json -m 20 --regex '^json\.paths.*\.\$ref = "#/components/schemas/simple-user"$'
```

**YAML specs:** Pipe through `yq` first:

```bash
yq -o=json openapi.yaml | gronify --no-color search --count --regex '^json\.paths\["[^"]+"\] = \{\}$'
```

## `package-lock.json` dependency & supply-chain audits

Works on a fresh clone or PR diff without running `npm install`. Check `lockfileVersion` first (`2` and `3` store entries under `packages`; version `1` uses nested `dependencies`).

```bash
# Check lockfile version
gronify --no-color search package-lock.json --regex '^json\.lockfileVersion'

# Find every installed copy (hoisted + nested) of a package
gronify --no-color search package-lock.json --regex 'node_modules/minimatch"\]\.version = '

# See which packages declare a dependency (all dependency sections; use \["@scope/pkg"\] for scoped packages)
gronify --no-color search package-lock.json -m 30 --regex '\.(dev|optional|peer)?[Dd]ependencies\.minimatch = '

# Read version, resolved tarball URL, and integrity hash for one package
gronify --no-color search package-lock.json --regex '"node_modules/next"\]\.(version|resolved|integrity) = '

# CI audit: find any resolved URL NOT on registry.npmjs.org (exit 1 = clean, 0 = match found, 2 = error)
gronify --no-color search package-lock.json --exit-status -m 20 --regex '\.resolved = "(?!https://registry\.npmjs\.org/)'

# List packages with install scripts or copyleft licenses
gronify --no-color search package-lock.json -m 50 --regex '\.(hasInstallScript|license) = (true|"(GPL|AGPL|LGPL)[^"]*")$'
```

## Kubernetes (`kubectl -o json`) and cloud exports

```bash
# List every resource kind in a kubectl List dump
gronify --no-color search k8s.json -m 50 --regex '^json\.items\[[0-9]+\]\.kind = '

# List container images at any nesting depth (Deployments, Jobs, StatefulSets, Pods)
gronify --no-color search k8s.json -m 50 --regex '\.containers\[[0-9]+\]\.image = '

# Audit ConfigMap and base64-encoded Secret data keys before sharing support dumps
gronify --no-color search k8s.json -m 50 --regex '^json\.items\[[0-9]+\]\.data\.'

# Two-step record lookup in cloud JSON (e.g. AWS ip-ranges.json): find index, then pull full record
gronify --no-color search ip-ranges.json --regex '"13\.32\.0\.0/15"$'
gronify --no-color search ip-ranges.json --regex '^json\.prefixes\[(1340|8790)\]\.'
```

## When to use another tool

- **Two-field record filters** (e.g. `region == "eu-west-1" and service == "S3"`): find the field paths with Gronify, then run `jq`.
- **Installed dependency tree explanation:** use `npm ls <pkg>` or `npm explain <pkg>` when `node_modules` is present.
- **Schema linting:** Gronify validates strict JSON syntax, not OpenAPI or Kubernetes schemas.

Reference: [OpenAPI, lockfiles & K8s guide](https://gronify.vercel.app/guides/search-openapi-and-lockfiles) · [Website & CLI docs](https://gronify.vercel.app)
