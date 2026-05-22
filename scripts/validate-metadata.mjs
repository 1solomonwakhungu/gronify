import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "src/README.md",
  "landing-page/README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".github/pull_request_template.md",
  "src/packages/cli/package.json",
];

const requiredReadmeSections = [
  "## Requirements",
  "## Install",
  "## Run",
  "## Demo",
  "## Development",
  "## Troubleshooting",
  "## Contributing",
  "## Security",
  "## License",
];

const errors = [];

const staleClaimPatterns = [
  {
    pattern: /\bVS Code\b/i,
    message: "claims a VS Code workflow that is not present",
  },
  {
    pattern: /\bdiff\b/i,
    message: "claims diff support that is not present",
  },
  {
    pattern: /\bbeautiful\b/i,
    message: "uses unsupported beautiful-output positioning",
  },
  {
    pattern: /\bsyntax highlighting\b/i,
    message: "claims syntax highlighting that is not documented as supported",
  },
  {
    pattern: /\bDiscussions\b/i,
    message:
      "links to Discussions even though repository discussions are disabled",
  },
];

function scanForStaleClaims(file) {
  if (!existsSync(file)) {
    return;
  }

  const contents = readFileSync(file, "utf8");
  for (const { pattern, message } of staleClaimPatterns) {
    if (pattern.test(contents)) {
      errors.push(`${file} ${message}`);
    }
  }
}

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    errors.push(`Missing required file: ${file}`);
  }
}

if (existsSync("README.md")) {
  const readme = readFileSync("README.md", "utf8");

  for (const section of requiredReadmeSections) {
    if (!readme.includes(section)) {
      errors.push(`README.md missing section: ${section}`);
    }
  }

  if (/^# Gronify# Gronify/m.test(readme)) {
    errors.push("README.md still contains the duplicated Gronify heading");
  }

  if (/npm (publish|install -g gronify)/i.test(readme)) {
    errors.push("README.md claims npm publication or global npm install");
  }

  scanForStaleClaims("README.md");
}

scanForStaleClaims("landing-page/src/app/layout.tsx");
scanForStaleClaims("landing-page/src/app/page.tsx");

if (existsSync("src/packages/cli/package.json")) {
  const pkg = JSON.parse(readFileSync("src/packages/cli/package.json", "utf8"));

  const expected = {
    license: "MIT",
    author: "Solomon Wakhungu",
    homepage: "https://github.com/1solomonwakhungu/gronify#readme",
  };

  for (const [field, value] of Object.entries(expected)) {
    if (pkg[field] !== value) {
      errors.push(`src/packages/cli/package.json ${field} should be ${value}`);
    }
  }

  const requiredScripts = ["lint", "format:check", "build", "test", "audit"];
  for (const script of requiredScripts) {
    if (!pkg.scripts?.[script]) {
      errors.push(`src/packages/cli/package.json missing script: ${script}`);
    }
  }

  if (!pkg.repository?.url?.includes("1solomonwakhungu/gronify")) {
    errors.push("src/packages/cli/package.json missing repository URL");
  }

  if (!pkg.bugs?.url?.endsWith("/issues")) {
    errors.push("src/packages/cli/package.json missing bugs URL");
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Repository metadata checks passed.");
