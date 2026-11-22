import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

const guideContentDir = "landing-page/src/app/guides/content";
const skillsDir = "skills";

const requiredFiles = [
  "README.md",
  "src/README.md",
  "landing-page/README.md",
  "skills.sh.json",
  "skills/gronify-json-flatten-search/SKILL.md",
  "landing-page/public/robots.txt",
  "landing-page/public/llms.txt",
  "landing-page/public/llms-full.txt",
  "landing-page/src/app/layout.tsx",
  "landing-page/src/app/page.tsx",
  "landing-page/src/app/seo-data.ts",
  "landing-page/src/app/sitemap.ts",
  "landing-page/src/app/opengraph-image.tsx",
  "landing-page/src/app/site-chrome.tsx",
  "landing-page/src/app/guides/registry.ts",
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
    // Gronify has no diff command, so `gronify diff` is rejected anywhere, code included.
    pattern: /\bgronify(?:\s+--?[\w-]+)*\s+diff\b/i,
    message: "documents a gronify diff command that does not exist",
  },
  {
    // `--sort` only makes the output diffable. Naming the system `diff` tool is fine, so code spans are ignored and
    // only claim-shaped phrases are matched: "Gronify diffs ...", "a diff mode", "diffing support", "built-in diffing".
    // These are false on every page, guides included.
    prose: true,
    pattern: new RegExp(
      [
        String.raw`\bgronify\s+(?:can\s+|will\s+|also\s+)?diffs?\b`,
        String.raw`(?<!\b(?:no|not\s+an?|without\s+an?)\s+)\bdiff(?:ing)?\s+(?:command|subcommand|support|mode|feature)s?\b`,
        String.raw`(?<!\b(?:no|not\s+an?|without\s+an?)\s+)\bbuilt-in\s+diff(?:s|ing)?\b`,
      ].join("|"),
      "i",
    ),
    message: "claims diff support that is not present",
  },
  {
    // Looser phrasing that reads as a claim on product pages: a verb list ending in "and diff", "diff two JSON
    // files", "JSON diff". A guide may use these words to explain the system `diff` tool, so guides skip this entry.
    prose: true,
    diffPhrasing: true,
    pattern: new RegExp(
      [
        String.raw`\b(?:search|inspect|flatten|unflatten|explor|quer|filter)\w*\b[^.\n]*?\b(?:and|or)\s+diffs?\b(?!\s+(?:the|them|it|its|a|an|two|both|with|by|against|those|these)\b)`,
        String.raw`\bdiffs?\s+(?:two|2|any|your|the two)\s+(?:JSON|payloads?)\b`,
        String.raw`\b(?:JSON|gron)\s+diff(?:s|ing)?\b`,
      ].join("|"),
      "i",
    ),
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
    pattern:
      /github\.com\/1solomonwakhungu\/gronify\/discussions\b|\bDiscussions\b/,
    message:
      "links to Discussions even though repository discussions are disabled",
  },
];

function scanForStaleClaims(file, { skipDiffPhrasing = false } = {}) {
  if (!existsSync(file)) {
    return;
  }

  const contents = readFileSync(file, "utf8");
  // In Markdown and plain-text docs, fenced blocks and inline code hold commands and examples rather than prose claims.
  const prose = /\.(?:md|txt)$/i.test(file)
    ? contents.replace(/^ *```[\s\S]*?^ *```/gm, " ").replace(/`[^`\n]*`/g, " ")
    : contents;
  for (const claim of staleClaimPatterns) {
    if (skipDiffPhrasing && claim.diffPhrasing) {
      continue;
    }
    const { pattern, message, prose: proseOnly } = claim;
    if (pattern.test(proseOnly ? prose : contents)) {
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

  if (!readme.includes("https://gronify.vercel.app")) {
    errors.push("README.md missing canonical landing-page URL");
  }

  scanForStaleClaims("README.md");
}

scanForStaleClaims("PRODUCT.md");
scanForStaleClaims("landing-page/README.md");
scanForStaleClaims("landing-page/public/llms.txt");
scanForStaleClaims("landing-page/public/llms-full.txt");
scanForStaleClaims("landing-page/src/app/layout.tsx");
scanForStaleClaims("landing-page/src/app/page.tsx");
scanForStaleClaims("landing-page/src/app/home.tsx");
scanForStaleClaims("landing-page/src/app/benchmarks.tsx");
scanForStaleClaims("landing-page/src/app/benchmark-data.ts");
scanForStaleClaims("landing-page/src/app/seo-data.ts");
scanForStaleClaims("landing-page/src/app/opengraph-image.tsx");
scanForStaleClaims("landing-page/src/app/site-chrome.tsx");
scanForStaleClaims("landing-page/src/app/guides/page.tsx");
scanForStaleClaims("landing-page/src/app/guides/guide-article.tsx");

const allowedFrontmatterKeys = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

function checkScalarYamlSafety(key, rawVal, yamlErrors) {
  if (!rawVal) {
    return "";
  }
  if (/^[>|][+-]?$/.test(rawVal)) {
    yamlErrors.push(`unsupported multiline block scalar for "${key}"`);
    return "";
  }
  const startsQuote = rawVal[0] === '"' || rawVal[0] === "'";
  const endsQuote =
    rawVal.length >= 2 && rawVal[rawVal.length - 1] === rawVal[0];
  if (startsQuote && !endsQuote) {
    yamlErrors.push(`unclosed quote in YAML value for "${key}"`);
    return rawVal.slice(1);
  }
  if (startsQuote && endsQuote) {
    return rawVal.slice(1, -1);
  }
  if (/(?:^|\s)#/.test(rawVal)) {
    yamlErrors.push(`unquoted YAML comment marker (#) in "${key}"`);
  }
  if (/:\s|:$/.test(rawVal)) {
    yamlErrors.push(`unquoted colon in YAML value for "${key}"`);
  }
  if (/^[[\]{}*&!%@`]|^[-?]\s/.test(rawVal)) {
    yamlErrors.push(`unquoted YAML indicator at start of "${key}"`);
  }
  return rawVal;
}

function parseFrontmatter(contents) {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return null;
  }
  const fields = {};
  const metadata = {};
  const yamlErrors = [];
  let inMetadata = false;

  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine.trim()) {
      continue;
    }
    if (inMetadata && /^\s+/.test(rawLine)) {
      const nested = rawLine.match(/^\s+([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (!nested) {
        yamlErrors.push(`invalid nested metadata line: ${rawLine.trim()}`);
      } else {
        metadata[nested[1]] = checkScalarYamlSafety(
          `metadata.${nested[1]}`,
          nested[2].trim(),
          yamlErrors,
        );
      }
      continue;
    }
    inMetadata = false;
    const kv = rawLine.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      yamlErrors.push(`invalid frontmatter line: ${rawLine}`);
      continue;
    }
    const [, key, rawVal] = kv;
    if (!allowedFrontmatterKeys.has(key)) {
      yamlErrors.push(`unknown frontmatter key "${key}"`);
    }
    if (key === "metadata" && !rawVal.trim()) {
      inMetadata = true;
      continue;
    }
    fields[key] = checkScalarYamlSafety(key, rawVal.trim(), yamlErrors);
  }
  return { fields, metadata, yamlErrors };
}

const skillSlugSet = new Set();

if (existsSync(skillsDir)) {
  const skillDirs = readdirSync(skillsDir)
    .filter((entry) => statSync(`${skillsDir}/${entry}`).isDirectory())
    .sort();
  for (const slug of skillDirs) {
    skillSlugSet.add(slug);
  }

  for (const slug of skillDirs) {
    const skillFile = `${skillsDir}/${slug}/SKILL.md`;
    if (!existsSync(skillFile)) {
      errors.push(`Missing SKILL.md in ${skillsDir}/${slug}`);
      continue;
    }

    const contents = readFileSync(skillFile, "utf8");
    const parsed = parseFrontmatter(contents);
    if (!parsed) {
      errors.push(`${skillFile} is missing YAML frontmatter`);
    } else {
      const { fields: fm, yamlErrors } = parsed;
      for (const yamlError of yamlErrors) {
        errors.push(`${skillFile} frontmatter ${yamlError}`);
      }
      if (fm.name !== slug) {
        errors.push(
          `${skillFile} frontmatter name (${fm.name ?? "missing"}) must match directory name (${slug})`,
        );
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) {
        errors.push(
          `${skillFile} name (${slug}) must be 1-64 lowercase alphanumeric hyphenated characters`,
        );
      }
      if (!fm.description) {
        errors.push(`${skillFile} frontmatter is missing description`);
      } else {
        if (fm.description.length > 250) {
          errors.push(
            `${skillFile} frontmatter description exceeds 250-char agent listing budget (${fm.description.length})`,
          );
        }
        if (/[<>]/.test(fm.description)) {
          errors.push(
            `${skillFile} frontmatter description must not contain angle brackets (< or >)`,
          );
        }
      }
      if (fm.compatibility && fm.compatibility.length > 500) {
        errors.push(
          `${skillFile} frontmatter compatibility exceeds 500 characters (${fm.compatibility.length})`,
        );
      }
      if (!fm.license) {
        errors.push(`${skillFile} frontmatter is missing license`);
      }
    }

    scanForStaleClaims(skillFile);
  }
}

if (existsSync("skills.sh.json")) {
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync("skills.sh.json", "utf8"));
  } catch (error) {
    errors.push(`skills.sh.json is not valid JSON: ${error.message}`);
  }
  if (manifest) {
    if (
      manifest.notGrouped !== undefined &&
      !["top", "bottom"].includes(manifest.notGrouped)
    ) {
      errors.push('skills.sh.json notGrouped must be "top" or "bottom"');
    }
    const grouped = new Set();
    const titles = new Set();
    if (!Array.isArray(manifest.groupings) || manifest.groupings.length === 0) {
      errors.push("skills.sh.json must define a non-empty groupings array");
    } else {
      for (const group of manifest.groupings) {
        if (
          typeof group.title !== "string" ||
          group.title.length === 0 ||
          group.title.length > 120 ||
          !Array.isArray(group.skills) ||
          group.skills.length === 0
        ) {
          errors.push(
            "skills.sh.json grouping must have a non-empty title (<=120 chars) and skills array",
          );
          continue;
        }
        if (titles.has(group.title)) {
          errors.push(
            `skills.sh.json has duplicate group title "${group.title}"`,
          );
        }
        titles.add(group.title);
        if (
          group.description !== undefined &&
          (typeof group.description !== "string" ||
            group.description.length > 500)
        ) {
          errors.push(
            `skills.sh.json grouping "${group.title}" description must be a string <=500 chars`,
          );
        }
        for (const slug of group.skills) {
          if (!skillSlugSet.has(slug)) {
            errors.push(
              `skills.sh.json references unknown skill "${slug}" (no ${skillsDir}/${slug}/SKILL.md)`,
            );
          }
          if (grouped.has(slug)) {
            errors.push(`skills.sh.json lists skill "${slug}" more than once`);
          }
          grouped.add(slug);
        }
      }
    }

    for (const slug of skillSlugSet) {
      if (!grouped.has(slug)) {
        errors.push(
          `skills.sh.json is missing grouping entry for skill "${slug}"`,
        );
      }
    }
  }
}

// A guide may explain comparing two JSON files with the system diff tool, so the claim-shaped diff phrases are skipped.
if (existsSync(guideContentDir)) {
  for (const name of readdirSync(guideContentDir).sort()) {
    if (name.endsWith(".ts")) {
      scanForStaleClaims(`${guideContentDir}/${name}`, {
        skipDiffPhrasing: true,
      });
    }
  }
}

if (
  existsSync("landing-page/public/llms.txt") &&
  existsSync("landing-page/src/app/page.tsx")
) {
  const llmsTxt = readFileSync("landing-page/public/llms.txt", "utf8");
  // The page body lives in home.tsx and benchmarks.tsx; page.tsx composes them.
  const pageTsx = [
    "landing-page/src/app/page.tsx",
    "landing-page/src/app/home.tsx",
    "landing-page/src/app/benchmarks.tsx",
  ]
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const anchors = new Set(
    Array.from(
      llmsTxt.matchAll(/https:\/\/gronify\.vercel\.app\/#([a-z0-9-]+)/g),
      (match) => match[1],
    ),
  );
  for (const anchor of anchors) {
    if (!pageTsx.includes(`id="${anchor}"`)) {
      errors.push(
        `landing-page/public/llms.txt links to #${anchor}, which is missing from the landing page components`,
      );
    }
  }
}

if (existsSync("src/packages/cli/package.json")) {
  const pkg = JSON.parse(readFileSync("src/packages/cli/package.json", "utf8"));

  const expected = {
    license: "MIT",
    author: "Solomon Wakhungu",
    homepage: "https://gronify.vercel.app",
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
