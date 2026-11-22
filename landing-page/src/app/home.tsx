"use client";

import {
  Box,
  Button,
  CTABanner,
  FAQ,
  Grid,
  Heading,
  Hero,
  Link,
  River,
  Section,
  SectionIntro,
  Stack,
  Text,
} from "@primer/react-brand";
import NextLink from "next/link";
import posthog from "posthog-js";
import type { ReactNode } from "react";

import type { BenchmarkView } from "./benchmark-data";
import styles from "./page.module.css";
import { SiteFooter, SiteHeader } from "./site-chrome";
import {
  cliVersion,
  nodeRequirement,
  npmBuildRequirement,
  repositoryUrl,
  skillsUrl,
} from "./site-config";
import { HeroInstallCommand } from "./install-command";
import { Terminal, type TerminalLine } from "./terminal";

const heroTranscript: TerminalLine[] = [
  { kind: "command", text: "npm install -g gronify" },
  {
    kind: "command",
    text: 'gronify search payload.json --regex "status|version"',
  },
  { kind: "output", text: 'json.service.status = "degraded"' },
  { kind: "output", text: 'json.deployments[0].version = "2026.05.22"' },
  { kind: "output", text: 'json.deployments[1].version = "2026.05.21"' },
];

const rivers = [
  {
    heading: "Flatten nested JSON into greppable lines",
    guide: { href: "/guides/flatten-json", text: "guide to flattening JSON" },
    description:
      "gronify flatten prints each value on its own line as path = value, in document order. Pipe the lines to grep, head, or any other text tool.",
    label: "gronify flatten output for a small service JSON file",
    lines: [
      { kind: "command", text: "gronify flatten service.json" },
      { kind: "output", text: "json = {}" },
      { kind: "output", text: "json.service = {}" },
      { kind: "output", text: 'json.service.name = "checkout"' },
      { kind: "output", text: 'json.service.status = "degraded"' },
      { kind: "output", text: "json.deployments = []" },
      { kind: "output", text: "json.deployments[0] = {}" },
      { kind: "output", text: 'json.deployments[0].region = "us-central1"' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Search JSON keys and values with text or regex",
    guide: { href: "/guides/grep-json", text: "guide to grepping JSON" },
    description:
      "gronify search flattens and filters in one pass, so you do not need grep. A plain term matches keys and values without regard to case. Add --regex for patterns, -c for exact case, -v to invert, or --count for a total.",
    label: "Regex search for user email paths in a JSON file",
    lines: [
      {
        kind: "command",
        text: 'gronify search data.json --regex "users\\[[0-9]+\\]\\.email"',
      },
      { kind: "output", text: 'json.users[0].email = "ada@example.com"' },
      { kind: "output", text: 'json.users[1].email = "grace@example.com"' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Unflatten gron lines back into JSON (ungron)",
    guide: { href: "/guides/unflatten-json", text: "ungron guide" },
    description:
      "gronify unflatten rebuilds JSON from full or grep-filtered gron lines, filling in missing parent containers automatically, and streams as it goes. Numbers come out with the digits they went in with, 64-bit IDs and trailing zeros included.",
    label: "Flattening a JSON file and unflattening it back to JSON",
    lines: [
      {
        kind: "command",
        text: "gronify flatten checkout.json | gronify unflatten",
      },
      { kind: "output", text: '{"service":{"name":"checkout"}}' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Search large JSON files without loading them",
    guide: {
      href: "/guides/large-json-files",
      text: "guide to searching large JSON files",
    },
    secondaryGuide: {
      href: "/guides/fix-err-string-too-long-json",
      text: "fixing ERR_STRING_TOO_LONG in Node.js",
    },
    description:
      "All three commands read a file or stdin in chunks and write output as they go, so the file does not have to fit in memory. Pass --stream for JSON Lines (NDJSON) logs. With -m or --limit, Gronify stops reading at the cap, prints a notice to stderr (the last line here), and exits 0.",
    label:
      "Piping a compressed JSON export into gronify search with a two-match cap",
    lines: [
      {
        kind: "command",
        text: 'gzip -dc events.json.gz | gronify search -m 2 "error"',
      },
      { kind: "output", text: 'json[0].error = "timeout"' },
      { kind: "output", text: 'json[7].error = "connection reset"' },
      {
        kind: "output",
        text: "Stopped after 2 matches (--max-count); there may be more",
      },
    ] satisfies TerminalLine[],
  },
];

const buildComparisons = (facts: ComparisonFacts) => [
  {
    kicker: "vs. jq & JSON.parse()",
    title: "Find a key's path without writing a jq filter",
    guide: { href: "/guides/jq-alternative", text: "jq alternative guide" },
    secondaryGuide: {
      href: "/guides/json-number-precision",
      text: "how jq rounds large numbers",
    },
    description: `jq is the better tool once you know the path and want to reshape data. Gronify needs no query. Search for a key or a value and it prints the full path. It also prints numbers as written. ${facts.numericCheck} JSON.parse() rounds integers above 2^53, and jq can too, depending on version and filter. Node cannot hand JSON.parse() a string over about 512 MB (ERR_STRING_TOO_LONG); Gronify reads the bytes in chunks.`,
    label: "Search output with a 64-bit integer and a trailing zero intact",
    lines: [
      {
        kind: "command",
        text: 'gronify search ledger.json --regex "id|amount"',
      },
      { kind: "output", text: "json.entries[0].id = 12345678901234567890" },
      { kind: "output", text: "json.entries[0].amount = 1.10" },
    ] satisfies TerminalLine[],
  },
  {
    kicker: "vs. gron & fastgron",
    title: "A gron alternative with built-in search and streaming ungron",
    guide: {
      href: "/guides/gron-alternative",
      text: "gron, fastgron, and Gronify comparison",
    },
    description: `Gronify installs with npm on macOS, Linux, and Windows and searches by text or regex. gron leaves filtering to grep, and fastgron filters by fixed string (-F). Gronify keeps document order unless you pass --sort and streams in both directions: ${facts.unflatten} (${facts.measuredOn}, from the benchmark below). gron and fastgron are native binaries that need no Node.js, and fastgron flattens faster when the file fits in memory.`,
    label: "Unflattening a gron file to an output file with -o",
    lines: [
      {
        kind: "command",
        text: "gronify -o restored.json unflatten archive.gron",
      },
      { kind: "output", text: "Output written to restored.json" },
    ] satisfies TerminalLine[],
  },
  {
    kicker: "vs. raw grep on JSON",
    title: "Grep minified JSON and still see the full path",
    guide: {
      href: "/guides/find-json-path",
      text: "guide to finding a JSON path",
    },
    description: `grep on minified JSON prints the whole file, because it is one line. On pretty-printed JSON it prints the matching key or value with no parent keys or array indexes. Gronify prints the full path on every line and has no nesting limit. Gronify ${facts.deep} (${facts.measuredOn}).`,
    label: "Finding the full path of a value inside minified JSON",
    lines: [
      {
        kind: "command",
        text: 'gronify search cluster-state.min.json "unhealthy"',
      },
      {
        kind: "output",
        text: 'json.clusters[2].nodes[14].status = "unhealthy"',
      },
    ] satisfies TerminalLine[],
  },
  {
    kicker: "With system diff",
    title: "Compare two JSON files with --sort and system diff",
    guide: {
      href: "/guides/compare-json-files",
      text: "guide to comparing two JSON files",
    },
    description:
      "Flatten both files with --sort and hand the output to diff. --sort orders object keys at every level by UTF-16 code unit, keeps each object's lines together, and leaves arrays in index order. Reordered keys then produce no output, and a real change shows up with its full path. Piping through plain sort would put [10] before [2] and split objects apart.",
    label:
      "Comparing two JSON files path by path using flatten --sort with system diff",
    lines: [
      {
        kind: "command",
        text: "diff <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json)",
      },
      { kind: "output", text: "4c4" },
      { kind: "output", text: '< json.service.version = "2026.05.21"' },
      { kind: "output", text: "---" },
      { kind: "output", text: '> json.service.version = "2026.05.22"' },
    ] satisfies TerminalLine[],
  },
];

const buildAgentRivers = (facts: ComparisonFacts) => [
  {
    heading: "Count matches first, then read only a few lines",
    description: `Run search --count to learn how many lines match before printing any. Then take a sample with -m, or look at the shape of the file with flatten --limit. Add --no-color so the output is plain text wherever it runs. Gronify stops reading the input at the cap, so when matches come early the file size hardly matters. In our benchmark, ${facts.capped} (${facts.measuredOn}).`,
    label: "Counting matches in a JSON export, then printing the first three",
    lines: [
      {
        kind: "command",
        text: "gronify --no-color search export.json error --count",
      },
      { kind: "output", text: "482" },
      {
        kind: "command",
        text: "gronify --no-color search export.json error -m 3",
      },
      { kind: "output", text: 'json.events[0].error = "upstream timeout"' },
      { kind: "output", text: 'json.events[14].error = "rate limit exceeded"' },
      { kind: "output", text: 'json.events[29].error = "connection reset"' },
      {
        kind: "output",
        text: "Stopped after 3 matches (--max-count); there may be more",
      },
    ] satisfies TerminalLine[],
    linkText: "See the result-cap flags",
    linkHref: "#commands",
    isExternal: false,
  },
  {
    heading: "Use exit codes in scripts and install the agent skills",
    description:
      "With --exit-status, search exits 0 on a match, 1 on no match, and 2 on an error, as grep does. -o writes to a temp file and replaces the target only after the run succeeds. The Gronify agent skills on skills.sh teach supported coding agents the count-then-cap routine, large JSON exploration, JSONL log search, key-sorted comparison with diff, OpenAPI and lockfile audits, and path-to-jq workflows.",
    label:
      "Installing the Gronify agent skills and branching on the exit status",
    lines: [
      {
        kind: "command",
        text: "npx skills add 1solomonwakhungu/gronify",
      },
      {
        kind: "command",
        text: 'if gronify --no-color search --exit-status config.json -m 1 "debug = true" >/dev/null 2>&1; then echo "debug is on"; fi',
      },
      { kind: "output", text: "debug is on" },
    ] satisfies TerminalLine[],
    linkText: "View agent skills on skills.sh",
    linkHref: skillsUrl,
    isExternal: true,
  },
];

const agentSkills = [
  {
    slug: "gronify-json-flatten-search",
    description:
      "Core CLI workflow for flattening, searching, shell branching with --exit-status, and unflattening.",
  },
  {
    slug: "large-json-search",
    description:
      "Size gate, 5-step narrowing loop, and gzipped pipes for files over 50 KB or multi-GB exports.",
  },
  {
    slug: "jsonl-ndjson-log-search",
    description:
      "Stream-search .jsonl and .ndjson logs, pull records by index, and convert to a JSON array (Gronify 1.4.0+).",
  },
  {
    slug: "json-compare-sorted-diff",
    description:
      "Key-sorted path comparison using flatten --sort with system diff, PowerShell, or git textconv.",
  },
  {
    slug: "openapi-lockfile-json-search",
    description:
      "Path-anchored regex recipes for OpenAPI specs, package-lock.json, kubectl JSON, and AWS exports.",
  },
  {
    slug: "json-path-to-jq-and-unflatten",
    description:
      "Turn printed paths into jq filters or JSONPath, keep 64-bit numbers exact, and unflatten subsets (parent synthesis in 1.4.0+).",
  },
];

const useCases = [
  {
    title: "Incident response",
    description:
      "Pipe a service response into gronify search and see every status, version, or error field with its full path, without opening an editor.",
  },
  {
    title: "Failed CI builds",
    description:
      "Check a generated manifest or build artifact from a script. search --exit-status fails the step when the value you need is missing.",
  },
  {
    title: "Support bundles",
    description:
      "Search a multi-gigabyte customer export on your own machine. Gronify makes no network requests, so the data stays where it is.",
  },
  {
    title: "Config changes",
    description:
      "Flatten the old and new file with --sort, then run diff. Reordered keys drop out and each change shows its path.",
  },
];

const commands = [
  {
    name: "flatten",
    signature: "gronify flatten [file]",
    description:
      "Print JSON or JSON Lines (--stream) from a file or stdin as one path = value line per value. Numbers keep the digits they have in the source.",
    examples: [
      "gronify flatten data.json",
      "gronify flatten --stream events.jsonl",
      "gronify flatten --sort --limit 100 data.json",
    ],
  },
  {
    name: "search",
    signature: "gronify search <file_or_term> [term]",
    description:
      "Flatten and filter JSON or JSON Lines (--stream) in one pass. Match plain text or a regex, cap the results, or print only the count.",
    examples: [
      'gronify search data.json "service"',
      'gronify search --stream events.jsonl "timeout"',
      'gronify search --exit-status data.json -m 1 "debug = true"',
    ],
  },
  {
    name: "unflatten",
    signature: "gronify unflatten [file]",
    description:
      "Turn full or filtered gron lines from a file or stdin back into JSON. Missing parent containers are filled in automatically.",
    examples: [
      "gronify unflatten data.gron",
      "gronify flatten data.json | gronify unflatten",
      'gronify search data.json "status" | gronify unflatten',
    ],
  },
];

const optionGroups = [
  {
    title: "Global options",
    options: [
      ["--color", "Enable color when the terminal supports it"],
      ["--no-color", "Force plain output for pipes and logs"],
      ["--pretty", "Indent and group formatted flatten or unflatten output"],
      [
        "-o, --output <file>",
        "Write to a file, replaced only after the run succeeds",
      ],
      ["-h, --help", "Show help for any command"],
      ["-V, --version", "Show the CLI version"],
    ],
  },
  {
    title: "Flatten options",
    options: [
      ["--limit <n>", "Stop after n lines and stop reading the input"],
      [
        "--sort",
        "Sort object keys at every level by UTF-16 code unit; arrays keep their order",
      ],
      [
        "-s, --stream, --jsonl",
        "Read JSON Lines / NDJSON (one JSON value per line)",
      ],
    ],
  },
  {
    title: "Search options",
    options: [
      ["-r, --regex", "Treat the term as a JavaScript regular expression"],
      ["-c, --case-sensitive", "Respect exact letter case"],
      ["--count", "Print only the number of matches"],
      ["-v, --invert-match", "Show lines that do not match"],
      [
        "-m, --max-count <n>",
        "Stop after n matches and stop reading the input",
      ],
      ["--sort", "Sort matching lines by object key, as flatten --sort does"],
      ["--exit-status", "Exit 1 when nothing matches; errors then exit 2"],
      [
        "-s, --stream, --jsonl",
        "Read JSON Lines / NDJSON (one JSON value per line)",
      ],
    ],
  },
];

const installSteps = [
  {
    step: "npm",
    title: "npm or npx",
    label: "Install Gronify with npm or run via npx",
    lines: [
      { kind: "command", text: "npm install -g gronify" },
      { kind: "command", text: "npx gronify --help" },
    ] satisfies TerminalLine[],
  },
  {
    step: "brew",
    title: "Homebrew",
    label: "Install Gronify with Homebrew",
    lines: [
      { kind: "command", text: "brew install 1solomonwakhungu/tap/gronify" },
    ] satisfies TerminalLine[],
  },
  {
    step: "source",
    title: "Build from source",
    label: "Build Gronify TypeScript CLI from source",
    lines: [
      { kind: "command", text: "git clone " + repositoryUrl + ".git" },
      { kind: "command", text: "cd gronify/src/packages/cli" },
      { kind: "command", text: "npm ci && npm run build && npm link" },
    ] satisfies TerminalLine[],
  },
  {
    step: "verify",
    title: "Verify the CLI",
    label: "Verify Gronify CLI installation",
    lines: [
      { kind: "command", text: "gronify --version" },
      { kind: "command", text: "gronify flatten data.json" },
    ] satisfies TerminalLine[],
  },
];

const requirements = [
  ["Node.js", nodeRequirement],
  ["npm (from source)", npmBuildRequirement],
  ["External tools", "None required"],
  ["License", "MIT"],
  ["Current release", `v${cliVersion}`],
];

type ComparisonFacts = BenchmarkView["comparisonFacts"];

type HomeProps = {
  /** Figures quoted by the comparison copy, derived from the benchmark results. */
  facts: ComparisonFacts;
  faqs: { question: string; answer: string }[];
  /** Server-rendered benchmark section, so its data never ships to the client. */
  benchmarks: ReactNode;
};

export function Home({ faqs, facts, benchmarks }: HomeProps) {
  const comparisons = buildComparisons(facts);
  const agentRivers = buildAgentRivers(facts);

  const captureRepositoryLinkClick = (
    placement: "header" | "cta" | "footer",
  ) => {
    posthog.capture("repository_link_clicked", { placement });
  };

  const captureIssueReportLinkClick = () => {
    posthog.capture("issue_report_link_clicked", { placement: "cta" });
  };

  const captureSkillLinkClick = (skill?: string) => {
    posthog.capture("skill_link_clicked", {
      placement: "agents",
      ...(skill ? { skill } : {}),
    });
  };

  return (
    <>
      <a href="#top" className={styles.skipLink}>
        Skip to main content
      </a>

      <SiteHeader onHome />

      <main id="top">
        <Box paddingBlockStart={64} />

        <Section
          as="div"
          paddingBlockStart="none"
          paddingBlockEnd="none"
          fullWidth
        >
          <div className={styles.heroReveal}>
            <Hero
              align="start"
              variant="gridline-expressive"
              trailingComponent={HeroInstallCommand}
            >
              <Hero.Label>
                v{cliVersion} · Open source CLI · MIT license
              </Hero.Label>
              <Hero.Heading>
                A gron-style CLI to search and flatten nested JSON.
              </Hero.Heading>
              <Hero.Description>
                Gronify is a gron-style CLI that prints every JSON value on its
                own line with its full path, searches those lines by plain text
                or regex, and turns them back into JSON. It streams, so a
                multi-gigabyte file never has to fit in memory.
              </Hero.Description>
              <Hero.ButtonGroup>
                <Button as="a" href="#install" variant="primary">
                  Install Gronify
                </Button>
                <Button as="a" href="/playground" variant="secondary">
                  Try it in the browser
                </Button>
              </Hero.ButtonGroup>
            </Hero>
          </div>
        </Section>

        <div className={styles.heroBand}>
          <div className={styles.heroBandInner}>
            <Terminal
              label="Searching a deployment JSON payload with Gronify"
              lines={heroTranscript}
              className={styles.terminalReveal}
            />
          </div>
        </div>

        <Section
          id="workflow"
          paddingBlockStart="spacious"
          paddingBlockEnd="none"
        >
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>How it works</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Make JSON greppable, search it, and convert it back.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              grep cannot tell you where a match sits inside nested JSON, and a
              jq filter is easiest to write once you know the path. Gronify
              prints each value with its full path, so a text search finds the
              key, the value, and its position in the document.
            </SectionIntro.Description>
          </SectionIntro>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Stack direction="vertical" padding="none" gap="spacious">
            {rivers.map((river) => (
              <River key={river.heading} variant="gridline" align="start">
                <River.Visual>
                  <Terminal label={river.label} lines={river.lines} />
                </River.Visual>
                <River.Content>
                  <Heading as="h3" size="4">
                    {river.heading}
                  </Heading>
                  <Text>
                    {river.description} Read the{" "}
                    <NextLink
                      className={styles.inlineLink}
                      href={river.guide.href}
                    >
                      {river.guide.text}
                    </NextLink>
                    {river.secondaryGuide ? (
                      <>
                        {" "}
                        or see{" "}
                        <NextLink
                          className={styles.inlineLink}
                          href={river.secondaryGuide.href}
                        >
                          {river.secondaryGuide.text}
                        </NextLink>
                      </>
                    ) : null}
                    .
                  </Text>
                </River.Content>
              </River>
            ))}
          </Stack>
        </Section>

        <Section
          id="compare"
          paddingBlockStart="spacious"
          paddingBlockEnd="none"
        >
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Comparison</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Gronify vs jq, gron, fastgron, and plain grep.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Use jq when you know the path and want to transform data. Use
              Gronify to find the path, keep numbers exact, search a file too
              large to load, or line up two files for diff. Measured time and
              memory for the same tools are in the{" "}
              <a className={styles.inlineLink} href="#benchmarks">
                benchmarks below
              </a>
              .
            </SectionIntro.Description>
          </SectionIntro>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Grid>
            <Grid.Column span={12}>
              <div className={`${styles.gridFrame} ${styles.gridFrameTwoUp}`}>
                {comparisons.map((item) => (
                  <div key={item.kicker} className={styles.gridCell}>
                    <Text as="p" size="100" font="monospace" variant="muted">
                      {item.kicker}
                    </Text>
                    <Heading as="h3" size="6">
                      {item.title}
                    </Heading>
                    <Text as="p" variant="muted" size="200">
                      {item.description} Read the{" "}
                      <NextLink
                        className={styles.inlineLink}
                        href={item.guide.href}
                      >
                        {item.guide.text}
                      </NextLink>
                      {item.secondaryGuide ? (
                        <>
                          {" "}
                          or see{" "}
                          <NextLink
                            className={styles.inlineLink}
                            href={item.secondaryGuide.href}
                          >
                            {item.secondaryGuide.text}
                          </NextLink>
                        </>
                      ) : null}
                      .
                    </Text>
                    <Box paddingBlockStart={16} className={styles.cellFooter}>
                      <Terminal label={item.label} lines={item.lines} />
                    </Box>
                  </div>
                ))}
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        {benchmarks}

        <Section
          id="agents"
          paddingBlockStart="spacious"
          paddingBlockEnd="none"
        >
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>AI agents and scripts</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Use Gronify with AI coding agents on large JSON files.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              An agent that reads a large JSON file whole fills its context with
              data it does not need. With Gronify it can count the matches, read
              a capped sample, and branch on the exit code. Shell scripts use
              the same flags. Read the{" "}
              <NextLink
                className={styles.inlineLink}
                href="/guides/json-for-ai-agents"
              >
                guide for AI coding agents
              </NextLink>
              .
            </SectionIntro.Description>
          </SectionIntro>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Stack direction="vertical" padding="none" gap="spacious">
            {agentRivers.map((river) => (
              <River key={river.heading} variant="gridline" align="start">
                <River.Visual>
                  <Terminal label={river.label} lines={river.lines} />
                </River.Visual>
                <River.Content>
                  <Heading as="h3" size="4">
                    {river.heading}
                  </Heading>
                  <Text>{river.description}</Text>
                  <Link
                    href={river.linkHref}
                    isExternal={river.isExternal}
                    onClick={
                      river.isExternal
                        ? () => captureSkillLinkClick()
                        : undefined
                    }
                  >
                    {river.linkText}
                  </Link>
                </River.Content>
              </River>
            ))}
          </Stack>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Grid>
            <Grid.Column span={12}>
              <div className={`${styles.gridFrame} ${styles.gridFrameThreeUp}`}>
                {agentSkills.map((skill) => (
                  <div key={skill.slug} className={styles.gridCell}>
                    <Heading
                      as="h3"
                      size="subhead-medium"
                      font="monospace"
                      weight="semibold"
                      className={styles.wrapAnywhere}
                    >
                      <a
                        className={styles.inlineLink}
                        href={`${skillsUrl}/${skill.slug}`}
                        onClick={() => captureSkillLinkClick(skill.slug)}
                      >
                        {skill.slug}
                      </a>
                    </Heading>
                    <Text as="p" variant="muted" size="200">
                      {skill.description}
                    </Text>
                    <Box paddingBlockStart={16} className={styles.cellFooter}>
                      <Terminal
                        label={`Install the ${skill.slug} agent skill`}
                        lines={[
                          {
                            kind: "command" as const,
                            text: `npx skills add 1solomonwakhungu/gronify --skill ${skill.slug}`,
                          },
                        ]}
                      />
                    </Box>
                  </div>
                ))}
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        <Section
          id="use-cases"
          paddingBlockStart="spacious"
          paddingBlockEnd="none"
        >
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Use cases</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Debug API responses, CI artifacts, and config in the shell.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Gronify reads a file or stdin and writes to stdout, so it fits
              anywhere a pipe does. When the JSON is broken, the error gives the
              byte offset, line, and column. For worked recipes on real specs
              and manifests, read the{" "}
              <NextLink
                className={styles.inlineLink}
                href="/guides/search-openapi-and-lockfiles"
              >
                guide to searching OpenAPI specs, package-lock.json, and
                Kubernetes JSON
              </NextLink>
              .
            </SectionIntro.Description>
          </SectionIntro>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Grid>
            <Grid.Column span={12}>
              <div className={`${styles.gridFrame} ${styles.gridFrameTwoUp}`}>
                {useCases.map((useCase) => (
                  <div key={useCase.title} className={styles.gridCell}>
                    <Heading as="h3" size="6">
                      {useCase.title}
                    </Heading>
                    <Text as="p" variant="muted" size="200">
                      {useCase.description}
                    </Text>
                  </div>
                ))}
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        <Section
          id="commands"
          paddingBlockStart="spacious"
          paddingBlockEnd="none"
        >
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Commands</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Gronify commands: flatten, search, and unflatten.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Each command reads a file or stdin and writes to stdout, or to a
              file with -o. Global options set color, indentation, and the
              output file. Command flags cap, sort, and filter the output.
            </SectionIntro.Description>
          </SectionIntro>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Grid>
            <Grid.Column span={12}>
              <div className={`${styles.gridFrame} ${styles.gridFrameThreeUp}`}>
                {commands.map((command) => (
                  <div key={command.name} className={styles.gridCell}>
                    <Heading
                      as="h3"
                      size="subhead-medium"
                      font="monospace"
                      weight="semibold"
                      className={styles.wrapAnywhere}
                    >
                      {command.signature}
                    </Heading>
                    <Text as="p" variant="muted" size="200">
                      {command.description}
                    </Text>
                    <Box paddingBlockStart={16} className={styles.cellFooter}>
                      <Terminal
                        label={`Examples for gronify ${command.name}`}
                        lines={command.examples.map((example) => ({
                          kind: "command" as const,
                          text: example,
                        }))}
                      />
                    </Box>
                  </div>
                ))}
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Grid>
            <Grid.Column span={12}>
              <div className={`${styles.gridFrame} ${styles.gridFrameThreeUp}`}>
                {optionGroups.map((group) => (
                  <div key={group.title} className={styles.gridCell}>
                    <Heading as="h3" size="6">
                      {group.title}
                    </Heading>
                    <Box paddingBlockStart={8}>
                      <Stack
                        direction="vertical"
                        gap="condensed"
                        padding="none"
                      >
                        {group.options.map(([flag, description]) => (
                          <Text key={flag} as="p" size="200">
                            <code className={styles.wrapAnywhere}>{flag}</code>{" "}
                            <Text as="span" variant="muted" size="200">
                              {description}
                            </Text>
                          </Text>
                        ))}
                      </Stack>
                    </Box>
                  </div>
                ))}
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        <Section
          id="install"
          paddingBlockStart="spacious"
          paddingBlockEnd="none"
        >
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Install</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Install Gronify with npm or Homebrew, or build from source.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Install with npm on macOS, Linux, or Windows, or use Homebrew, a
              GitHub release archive, or a source build. Gronify needs Node.js
              20 or newer. Result caps, --sort, and --exit-status need v1.2.0 or
              later; JSON Lines (--stream) and filtered unflatten need v1.4.0 or
              later. On Windows, read the{" "}
              <NextLink
                className={styles.inlineLink}
                href="/guides/grep-json-windows-powershell"
              >
                PowerShell and cmd guide
              </NextLink>
              .
            </SectionIntro.Description>
          </SectionIntro>
        </Section>

        <Section paddingBlockStart="normal" paddingBlockEnd="none">
          <Grid>
            <Grid.Column span={12}>
              <div className={styles.gridFrame}>
                {installSteps.map((step) => (
                  <div key={step.step} className={styles.gridCell}>
                    <Stack
                      direction="horizontal"
                      gap="normal"
                      padding="none"
                      alignItems="center"
                    >
                      <Text as="p" size="100" font="monospace" variant="muted">
                        {step.step}
                      </Text>
                      <Heading as="h3" size="6">
                        {step.title}
                      </Heading>
                    </Stack>
                    <Box paddingBlockStart={16}>
                      <Terminal label={step.label} lines={step.lines} />
                    </Box>
                  </div>
                ))}
                <div className={styles.gridCell}>
                  <Heading as="h3" size="6">
                    Requirements
                  </Heading>
                  <Box paddingBlockStart={8}>
                    <Stack direction="vertical" gap="condensed" padding="none">
                      {requirements.map(([label, value]) => (
                        <Text key={label} as="p" size="200">
                          {label} —{" "}
                          <Text as="span" variant="muted" size="200">
                            {value}
                          </Text>
                        </Text>
                      ))}
                    </Stack>
                  </Box>
                </div>
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        <Box paddingBlockStart={64} paddingBlockEnd={64} id="faq">
          <FAQ variant="gridline">
            <FAQ.Heading
              as="h2"
              size="4"
              align="center"
              className={styles.faqHeading}
            >
              Frequently asked questions
            </FAQ.Heading>
            {faqs.map((faq, index) => (
              <FAQ.Item key={faq.question} open={index === 0} disableAnimation>
                <FAQ.Question as="h3">{faq.question}</FAQ.Question>
                <FAQ.Answer>
                  <Text as="p" variant="muted">
                    {faq.answer}
                  </Text>
                </FAQ.Answer>
              </FAQ.Item>
            ))}
          </FAQ>
        </Box>

        <CTABanner align="center" hasGridLines className={styles.ctaBanner}>
          <CTABanner.Heading as="h2" size="3">
            Try Gronify on the next JSON file you have to search.
          </CTABanner.Heading>
          <CTABanner.Description>
            Gronify is open source under the MIT license. Read the code, report
            an issue, or build the CLI from source.
          </CTABanner.Description>
          <CTABanner.ButtonGroup>
            <Button
              as="a"
              href={repositoryUrl}
              variant="primary"
              onClick={() => captureRepositoryLinkClick("cta")}
            >
              View the repository
            </Button>
            <Button
              as="a"
              href={`${repositoryUrl}/issues`}
              variant="secondary"
              onClick={captureIssueReportLinkClick}
            >
              Report an issue
            </Button>
          </CTABanner.ButtonGroup>
        </CTABanner>
      </main>

      <SiteFooter onHome />
    </>
  );
}
