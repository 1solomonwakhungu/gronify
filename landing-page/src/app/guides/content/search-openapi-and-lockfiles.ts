import { transcript, type Guide } from "../types";

// Every transcript below is pasted from a real run on macOS 27.2.1: gronify
// 1.3.1, jq 1.8.2, yq 4.53.3, and kubectl 1.36.1 (client only, with no cluster
// configured). The input files:
// - api.github.com.json and api.github.com.yaml: github/rest-api-description
//   at commit bbd57e64767616df3b37792a1186166334043761.
// - stripe.json: openapi/spec3.json from stripe/openapi at commit
//   fae26264636d2d322b175ce01f6d09358078a466.
// - package-lock.json: this repository's landing-page/package-lock.json.
// - ip-ranges.json: https://ip-ranges.amazonaws.com/ip-ranges.json, fetched on
//   2026-11-19 (createDate 2026-11-19-22-07-05).
export const searchOpenapiAndLockfiles: Guide = {
  slug: "search-openapi-and-lockfiles",
  title: "Search OpenAPI specs, package-lock.json, and kubectl JSON",
  description:
    "Find endpoints, auth schemes, and deprecated operations in OpenAPI specs, package versions in package-lock.json, and fields in kubectl JSON with gronify search.",
  h1: "Search OpenAPI specs, package-lock.json, and Kubernetes JSON from the command line",
  lede: 'OpenAPI specs, `package-lock.json`, and `kubectl get -o json` output are too large to read and too deeply nested to grep. Each recipe here is one `gronify search` with a regex anchored on the JSON path, such as `\'^json\\.paths\\["[^"]+"\\]\\.[a-z]+\\.deprecated = true$\'` for every deprecated endpoint, and each prints matches with their full paths.',
  published: "2026-11-20",
  updated: "2026-11-20",
  sections: [
    {
      id: "path-patterns",
      heading: "How the paths look, and how to match them",
      blocks: [
        {
          kind: "paragraph",
          text: '`gronify flatten` prints one `json.path = value` line per value. A key that is not a plain identifier, such as an OpenAPI path or an npm install path, prints as a bracketed JSON string: `json.paths["/repos/{owner}/{repo}/pulls"]`. The patterns below rely on three things:',
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            "`^json\\.paths` anchors the match to the start of the path, so the same words inside a description do not match.",
            '`\\["[^"]+"\\]` matches any one bracketed key. Escape `[`, `]`, `{`, `}`, `.`, and `$` when you mean them literally.',
            '` = true$` or ` = "..."$` pins the match to the value side.',
          ],
        },
        {
          kind: "paragraph",
          text: "If you have not seen a file before, start with `gronify flatten --limit 30 file.json` to learn its shape, or [find the path to a key](/guides/find-json-path) by searching for a value you know.",
        },
      ],
    },
    {
      id: "openapi",
      heading: "OpenAPI and Swagger specs",
      blocks: [
        {
          kind: "paragraph",
          text: "GitHub's REST API description is 14 MB of JSON and Stripe's is 8 MB. Both are public, which makes them good test files.",
        },
        { kind: "subheading", text: "List and count the endpoints" },
        {
          kind: "paragraph",
          text: "Every entry under `paths` starts with a container line ending in `= {}`, so matching that line once per path counts the endpoints:",
        },
        {
          kind: "terminal",
          label:
            "Counting and listing the paths in the GitHub OpenAPI description",
          lines: transcript`
$ wc -c api.github.com.json stripe.json
 14275550 api.github.com.json
 8317513 stripe.json
 22593063 total
$ gronify search api.github.com.json --count --regex '^json\.paths\["[^"]+"\] = \{\}$'
842
$ gronify search api.github.com.json --regex '^json\.paths\["[^"]+"\] = \{\}$' -m 4
json.paths["/"] = {}
json.paths["/advisories"] = {}
json.paths["/advisories/{ghsa_id}"] = {}
json.paths["/agents/automations"] = {}
Stopped after 4 matches (--max-count); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "If all you want is the bare list of path keys, jq is shorter: `jq -r '.paths | keys[]' api.github.com.json` printed the same 842 paths, without the `json.paths[...]` wrapper.",
        },
        {
          kind: "subheading",
          text: "Find the operations on one path, or one operationId",
        },
        {
          kind: "terminal",
          label: "Finding HTTP methods and operationIds in an OpenAPI spec",
          lines: transcript`
$ gronify search api.github.com.json --regex '^json\.paths\["/repos/\{owner\}/\{repo\}/pulls"\]\.[a-z]+\.operationId = '
json.paths["/repos/{owner}/{repo}/pulls"].get.operationId = "pulls/list"
json.paths["/repos/{owner}/{repo}/pulls"].post.operationId = "pulls/create"
$ gronify search api.github.com.json --regex '\.operationId = "pulls/merge"$'
json.paths["/repos/{owner}/{repo}/pulls/{pull_number}/merge"].put.operationId = "pulls/merge"
`,
        },
        {
          kind: "paragraph",
          text: "The second search runs backwards from a generated client: an SDK method name usually comes from the operationId, and the match gives you the URL and the HTTP method.",
        },
        { kind: "subheading", text: "Find deprecated operations and fields" },
        {
          kind: "paragraph",
          text: "OpenAPI marks both operations and schema properties with `deprecated: true`. The path tells them apart:",
        },
        {
          kind: "terminal",
          label:
            "Deprecated operations and deprecated schema properties in an OpenAPI spec",
          lines: transcript`
$ gronify search api.github.com.json --count --regex '\.deprecated = true$'
73
$ gronify search api.github.com.json --count --regex '^json\.paths\["[^"]+"\]\.[a-z]+\.deprecated = true$'
38
$ gronify search api.github.com.json -m 4 --regex '^json\.paths\["[^"]+"\]\.[a-z]+\.deprecated = true$'
json.paths["/assignments/{assignment_id}"].get.deprecated = true
json.paths["/assignments/{assignment_id}/accepted_assignments"].get.deprecated = true
json.paths["/assignments/{assignment_id}/grades"].get.deprecated = true
json.paths["/classrooms"].get.deprecated = true
Stopped after 4 matches (--max-count); there may be more
$ gronify search api.github.com.json --count --regex '^json\.components\.schemas(\.|\[).*\.deprecated = true$'
16
$ gronify search api.github.com.json -m 4 --regex '^json\.components\.schemas(\.|\[).*\.deprecated = true$'
json.components.schemas.root.properties.hub_url.deprecated = true
json.components.schemas.repository.properties.has_downloads.deprecated = true
json.components.schemas.repository.properties.use_squash_pr_title_as_default.deprecated = true
json.components.schemas["gist-simple"].properties.forks.deprecated = true
Stopped after 4 matches (--max-count); there may be more
`,
        },
        {
          kind: "paragraph",
          text: "Of 73 `deprecated = true` lines, 38 are whole operations and 16 are properties of shared schemas; the rest sit in parameters and in request and response bodies. The schema pattern starts with `(\\.|\\[)` because a schema name with a hyphen, such as `gist-simple`, prints in brackets rather than after a dot.",
        },
        { kind: "subheading", text: "Find the auth schemes" },
        {
          kind: "paragraph",
          text: "OpenAPI 3 declares authentication under `components.securitySchemes` and applies it with a top-level `security` list. Stripe's spec has both:",
        },
        {
          kind: "terminal",
          label:
            "Security schemes and global security requirements in the Stripe spec",
          lines: transcript`
$ gronify search stripe.json --regex '^json\.components\.securitySchemes\.[A-Za-z]+\.(type|scheme) = '
json.components.securitySchemes.basicAuth.scheme = "basic"
json.components.securitySchemes.basicAuth.type = "http"
json.components.securitySchemes.bearerAuth.scheme = "bearer"
json.components.securitySchemes.bearerAuth.type = "http"
$ gronify search stripe.json --regex '^json\.security\['
json.security[0] = {}
json.security[0].basicAuth = []
json.security[1] = {}
json.security[1].bearerAuth = []
`,
        },
        {
          kind: "paragraph",
          text: "An operation can override the global list with its own `security` key. Without the `^json` anchor, `--regex '\\.security\\['` finds those too; in Stripe's spec it finds only the four top-level lines. Swagger 2.0 files use `securityDefinitions` at the top level instead of `components.securitySchemes`. GitHub's description has neither: searching it for `securitySchemes` finds nothing.",
        },
        { kind: "subheading", text: "Find every endpoint that uses a schema" },
        {
          kind: "paragraph",
          text: "A `$ref` key prints as `.$ref`. Anchoring on `^json\\.paths` keeps references from other schemas out of the count:",
        },
        {
          kind: "terminal",
          label: "Finding the endpoints that reference one OpenAPI schema",
          lines: transcript`
$ gronify search api.github.com.json --count --regex '^json\.paths.*\.\$ref = "#/components/schemas/simple-user"$'
19
$ gronify search api.github.com.json -m 2 --regex '^json\.paths.*\.\$ref = "#/components/schemas/simple-user"$'
json.paths["/orgs/{org}/blocks"].get.responses["200"].content["application/json"].schema.items.$ref = "#/components/schemas/simple-user"
json.paths["/orgs/{org}/members"].get.responses["200"].content["application/json"].schema.items.$ref = "#/components/schemas/simple-user"
Stopped after 2 matches (--max-count); there may be more
`,
        },
        { kind: "subheading", text: "YAML specs" },
        {
          kind: "paragraph",
          text: "Gronify reads JSON only. Convert a YAML spec on the way in with [yq](https://github.com/mikefarah/yq), and the same searches work:",
        },
        {
          kind: "terminal",
          label: "Searching a YAML OpenAPI spec through yq",
          lines: transcript`
$ yq -o=json api.github.com.yaml | gronify search --count --regex '^json\.paths\["[^"]+"\] = \{\}$'
842
`,
        },
      ],
    },
    {
      id: "package-lock",
      heading: "package-lock.json",
      blocks: [
        {
          kind: "paragraph",
          text: "In lockfile version 2 and 3, every installed package is a key of `packages`, named by its install path, such as `node_modules/next` or `node_modules/a/node_modules/b` for a nested copy. Version 1 lockfiles use a nested `dependencies` tree instead, so check the version first. The examples use the lockfile of this site, a Next.js app:",
        },
        {
          kind: "terminal",
          label:
            "Finding every installed version of a package in package-lock.json",
          lines: transcript`
$ gronify search package-lock.json --regex '^json\.lockfileVersion'
json.lockfileVersion = 3
$ gronify search package-lock.json --regex 'node_modules/minimatch"\]\.version = '
json.packages["node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch"].version = "10.2.6"
json.packages["node_modules/minimatch"].version = "3.1.5"
`,
        },
        {
          kind: "paragraph",
          text: "Two copies are installed. The hoisted one at the top level is 3.1.5, and `@typescript-eslint/typescript-estree` gets its own 10.2.6. To see which packages ask for it, search the `dependencies` maps:",
        },
        {
          kind: "terminal",
          label: "Finding which packages depend on a transitive dependency",
          lines: transcript`
$ gronify search package-lock.json --regex '\.dependencies\.minimatch = '
json.packages["node_modules/@eslint/config-array"].dependencies.minimatch = "^3.1.2"
json.packages["node_modules/@eslint/eslintrc"].dependencies.minimatch = "^3.1.5"
json.packages["node_modules/@typescript-eslint/typescript-estree"].dependencies.minimatch = "^10.2.2"
json.packages["node_modules/eslint"].dependencies.minimatch = "^3.1.2"
json.packages["node_modules/eslint-plugin-import"].dependencies.minimatch = "^3.1.2"
json.packages["node_modules/eslint-plugin-jsx-a11y"].dependencies.minimatch = "^3.1.2"
json.packages["node_modules/eslint-plugin-react"].dependencies.minimatch = "^3.1.2"
`,
        },
        {
          kind: "paragraph",
          text: "`npm ls minimatch` draws the same relationships as a tree, but it reads the installed `node_modules`. A search on the lockfile works on a fresh clone, or on a lockfile from a pull request you have not installed.",
        },
        { kind: "subheading", text: "Resolved URLs and integrity hashes" },
        {
          kind: "terminal",
          label:
            "Reading the version, tarball URL, and integrity hash of one package",
          lines: transcript`
$ gronify search package-lock.json --regex '"node_modules/next"\]\.(version|resolved|integrity) = '
json.packages["node_modules/next"].version = "16.4.3"
json.packages["node_modules/next"].resolved = "https://registry.npmjs.org/next/-/next-16.4.3.tgz"
json.packages["node_modules/next"].integrity = "sha512-OqxKTGi9u80FydydsMNYNjnuje9Au+kvHlt2GZ//ftdpDHm1dxKqAaENoOOTX5wKzn+9vaKUNIfZeyZUuLhCnA=="
`,
        },
        {
          kind: "paragraph",
          text: "A JavaScript regex can use a negative lookahead, which turns the search into an audit: any `resolved` URL that is not on the public npm registry. With `--exit-status`, no match means exit status 1, so a CI step can fail when the exit status is 0:",
        },
        {
          kind: "terminal",
          label: "Checking that every resolved URL points at the npm registry",
          lines: transcript`
$ gronify search package-lock.json --count '.resolved = '
446
$ gronify search package-lock.json --exit-status --regex '\.resolved = "(?!https://registry\.npmjs\.org/)'; echo "exit status $?"
Warning: No matches found for '\.resolved = "(?!https://registry\.npmjs\.org/)'
Tip: Search is a case-insensitive substring match; use --regex for patterns
exit status 1
`,
        },
        {
          kind: "paragraph",
          text: "All 446 tarballs come from the registry. The same approach lists packages that run install scripts or carry a GPL-family license:",
        },
        {
          kind: "terminal",
          label:
            "Listing install scripts and GPL-family licenses in a lockfile",
          lines: transcript`
$ gronify search package-lock.json --regex '\.(hasInstallScript|license) = (true|"(GPL|AGPL|LGPL)[^"]*")$'
json.packages["node_modules/@img/sharp-libvips-darwin-arm64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-darwin-x64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linux-arm"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linux-arm64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linux-ppc64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linux-riscv64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linux-s390x"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linux-x64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linuxmusl-arm64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/@img/sharp-libvips-linuxmusl-x64"].license = "LGPL-3.0-or-later"
json.packages["node_modules/core-js"].hasInstallScript = true
json.packages["node_modules/unrs-resolver"].hasInstallScript = true
`,
        },
      ],
    },
    {
      id: "kubernetes",
      heading: "Kubernetes JSON from kubectl",
      blocks: [
        {
          kind: "paragraph",
          text: "`kubectl get <kind> -o json` returns a `List` with the objects under `items`. To keep this page reproducible without a cluster, these four objects come from kubectl's client-side dry run, wrapped in a List of the same shape:",
        },
        {
          kind: "terminal",
          label: "Building a Kubernetes List from kubectl dry-run output",
          lines: transcript`
$ kubectl create deployment web --image=nginx:1.27.3 --replicas=3 --dry-run=client -o json > deploy.json
$ kubectl create service clusterip web --tcp=80:8080 --dry-run=client -o json > service.json
$ kubectl create configmap web-config --from-literal=LOG_LEVEL=debug --dry-run=client -o json > configmap.json
$ kubectl create secret generic web-db --from-literal=DATABASE_URL=postgres://app:hunter2@db:5432/app --dry-run=client -o json > secret.json
$ jq -s '{apiVersion: "v1", kind: "List", items: .}' deploy.json service.json configmap.json secret.json > k8s.json
`,
        },
        {
          kind: "terminal",
          label:
            "Listing kinds, container images, and data keys in kubectl JSON",
          lines: transcript`
$ gronify search k8s.json --regex '^json\.items\[[0-9]+\]\.kind = '
json.items[0].kind = "Deployment"
json.items[1].kind = "Service"
json.items[2].kind = "ConfigMap"
json.items[3].kind = "Secret"
$ gronify search k8s.json --regex '\.containers\[[0-9]+\]\.image = '
json.items[0].spec.template.spec.containers[0].image = "nginx:1.27.3"
$ gronify search k8s.json --regex '^json\.items\[[0-9]+\]\.data\.'
json.items[2].data.LOG_LEVEL = "debug"
json.items[3].data.DATABASE_URL = "cG9zdGdyZXM6Ly9hcHA6aHVudGVyMkBkYjo1NDMyL2FwcA=="
`,
        },
        {
          kind: "paragraph",
          text: "The image pattern matches `containers` at any depth, so it covers Deployments, StatefulSets, Jobs, and bare Pods in one search. The last search is worth running before you attach an export to a ticket: a Secret's `data` is base64, which anyone can decode, and that value is the full database URL with its password.",
        },
      ],
    },
    {
      id: "cloud-exports",
      heading: "Cloud JSON: AWS IP ranges",
      blocks: [
        {
          kind: "paragraph",
          text: "AWS publishes its address ranges as one JSON file, about 2.8 MB on the day it was fetched. Each record in `prefixes` has an `ip_prefix`, a `region`, and a `service`:",
        },
        {
          kind: "terminal",
          label:
            "Counting, locating, and reading records in the AWS ip-ranges.json file",
          lines: transcript`
$ gronify search ip-ranges.json --regex '^json\.(syncToken|createDate) = '
json.syncToken = "1795126025"
json.createDate = "2026-11-19-22-07-05"
$ gronify search ip-ranges.json --count 'service = "CLOUDFRONT"'
252
$ gronify search ip-ranges.json --regex '"13\.32\.0\.0/15"$'
json.prefixes[1340].ip_prefix = "13.32.0.0/15"
json.prefixes[8790].ip_prefix = "13.32.0.0/15"
$ gronify search ip-ranges.json --regex '^json\.prefixes\[(1340|8790)\]\.'
json.prefixes[1340].ip_prefix = "13.32.0.0/15"
json.prefixes[1340].region = "GLOBAL"
json.prefixes[1340].service = "AMAZON"
json.prefixes[1340].network_border_group = "GLOBAL"
json.prefixes[8790].ip_prefix = "13.32.0.0/15"
json.prefixes[8790].region = "GLOBAL"
json.prefixes[8790].service = "CLOUDFRONT"
json.prefixes[8790].network_border_group = "GLOBAL"
`,
        },
        {
          kind: "paragraph",
          text: "Searching for the prefix gave two record indexes, and a second search on those indexes printed both records whole: the same range is listed once under `AMAZON` and once under `CLOUDFRONT`. A plain-text search for `13.32.0.0` is a substring match, so it would also hit a longer address that contains it, such as `113.32.0.0/16`. Searching for the escaped value with its quotes and `$` matches the whole value only.",
        },
        {
          kind: "paragraph",
          text: "A line filter sees one field at a time, so it cannot ask for records where the region is one value and the service another. That is a job for [jq](https://github.com/jqlang/jq):",
        },
        {
          kind: "terminal",
          label: "Selecting records by two fields with jq",
          lines: transcript`
$ jq -r '.prefixes[] | select(.region == "eu-west-1" and .service == "S3") | .ip_prefix' ip-ranges.json | head -3
3.5.98.0/23
3.2.109.0/24
3.5.72.0/23
`,
        },
      ],
    },
    {
      id: "limits",
      heading: "When to use something else",
      blocks: [
        {
          kind: "table",
          caption: "Gronify, jq, and the native tools for these files",
          columns: ["Job", "Tool", "Why"],
          rows: [
            [
              "Find where a key, value, or reference sits",
              "`gronify search`",
              "Each match prints with its full path",
            ],
            [
              "Select records by two or more fields",
              "jq",
              "`select` sees the whole record",
            ],
            [
              "See why a package is installed",
              "`npm ls <name>` or `npm explain <name>`",
              "They print the dependency chain from installed packages",
            ],
            [
              "Validate or lint an OpenAPI spec",
              "An OpenAPI linter",
              "Gronify checks JSON syntax, not the OpenAPI schema",
            ],
            [
              "Read a YAML spec or manifest",
              "`yq -o=json` piped into Gronify",
              "Gronify reads JSON only",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Each Gronify run reads one JSON document, so a stream of objects, such as `kubectl get -w -o json`, needs jq. For files in the gigabytes, see [searching large JSON files](/guides/large-json-files).",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "How do I find all deprecated endpoints in an OpenAPI spec?",
      answer:
        'Anchor the search on operations under `paths`: `gronify search openapi.json --regex \'^json\\.paths\\["[^"]+"\\]\\.[a-z]+\\.deprecated = true$\'`. Each line names the path and the HTTP method. Drop the anchor to include deprecated parameters and schema properties.',
    },
    {
      question:
        "How do I find which version of a package is in package-lock.json?",
      answer:
        "Search for its install path: `gronify search package-lock.json --regex 'node_modules/minimatch\"\\]\\.version = '` prints one line per installed copy, with the path that shows where each copy is nested.",
    },
    {
      question: "Can gronify read Swagger 2.0 files?",
      answer:
        "Yes, if they are JSON. Gronify does not interpret OpenAPI, it flattens any JSON document, so the recipes change only where the format does: Swagger 2.0 keeps auth under `securityDefinitions` and schemas under `definitions`.",
    },
    {
      question:
        "Why does my search for a dotted value match more than I expect?",
      answer:
        "In a regex, `.` matches any character. Escape it as `\\.`, and include the surrounding quotes, such as `'\"13\\.32\\.0\\.0/15\"$'`, so the match covers the whole value.",
    },
  ],
  related: ["find-json-path", "grep-json", "grep-json-windows-powershell"],
};
