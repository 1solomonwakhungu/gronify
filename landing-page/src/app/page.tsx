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
import posthog from "posthog-js";

import { GronifyLogo } from "./logo";
import styles from "./page.module.css";
import {
  cliVersion,
  faqs,
  nodeRequirement,
  npmBuildRequirement,
  npmPackageUrl,
  repositoryUrl,
  skillsUrl,
} from "./seo-data";

type TerminalLine = {
  kind: "command" | "output";
  text: string;
};

function Terminal({
  lines,
  label,
  className,
}: {
  lines: TerminalLine[];
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`${styles.terminal} ${className ?? ""}`}
      role="figure"
      aria-label={label}
    >
      {lines.map((line, index) => (
        <code
          key={`${index}-${line.text}`}
          className={`${styles.terminalLine} ${
            line.kind === "command" ? "" : styles.terminalPath
          }`}
        >
          {line.kind === "command" ? (
            <>
              <span className={styles.terminalPrompt} aria-hidden="true">
                ${" "}
              </span>
              {line.text}
            </>
          ) : (
            line.text
          )}
        </code>
      ))}
    </div>
  );
}

const heroTranscript: TerminalLine[] = [
  { kind: "command", text: 'gronify search payload.json --regex "status|version"' },
  { kind: "output", text: 'json.service.status = "degraded"' },
  { kind: "output", text: 'json.deployments[0].version = "2026.05.22"' },
  { kind: "output", text: 'json.deployments[1].version = "2026.05.21"' },
];

const rivers = [
  {
    heading: "Flatten nested JSON into greppable paths",
    description:
      "Stream nested objects and arrays into one path assignment per line in document order, ready for standard shell pipelines.",
    label: "Every JSON value on one greppable path line",
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
    description:
      "Filter flattened JSON paths in one pass with plain text or extended regex, case-sensitive matching, inverted matches, match counts, or grep-style exit codes—no external grep required.",
    label: "Regex search across a JSON payload",
    lines: [
      { kind: "command", text: 'gronify search data.json --regex "users\\[[0-9]+\\]\\.email"' },
      { kind: "output", text: 'json.users[0].email = "ada@example.com"' },
      { kind: "output", text: 'json.users[1].email = "grace@example.com"' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Unflatten gron output back into valid JSON",
    description:
      "Stream document-order gron assignments through the built-in unflatten (ungron) command to reconstruct valid JSON with source numbers preserved verbatim.",
    label: "Round-tripping gron assignments back to JSON",
    lines: [
      { kind: "command", text: "gronify flatten data.json | gronify unflatten" },
      { kind: "output", text: '{"service":{"name":"checkout"}}' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Stream multi-gigabyte JSON in ~100 MB memory",
    description:
      "All three commands stream their input, keeping peak memory around 100 MB on the default path at any file size; --sort spills buffered object lines past 64 MiB to a temp file, and out-of-order unflatten input rebuilds in memory only within the first 16 MiB (failing past that). With -m or --limit, Gronify stops reading at the cap, writes a notice to stderr (the final line in the transcript), and exits 0.",
    label: "Stopping a JSON search after two matches",
    lines: [
      { kind: "command", text: 'gronify search events.json -m 2 "error"' },
      { kind: "output", text: 'json[0].error = "timeout"' },
      { kind: "output", text: 'json[7].error = "connection reset"' },
      { kind: "output", text: "Stopped after 2 matches (--max-count); there may be more" },
    ] satisfies TerminalLine[],
  },
];

const comparisons = [
  {
    kicker: "vs. jq & JSON.parse()",
    title: "Explore unknown schemas and preserve exact numbers",
    description:
      "jq excels when you already know the exact path and want data transformations, while Node's JSON.parse() hits V8 string limits (~512 MB, ERR_STRING_TOO_LONG) on multi-gigabyte dumps. Gronify streams raw bytes with zero upfront query DSL and keeps 64-bit integer IDs above 2^53 and trailing decimals verbatim.",
    label: "Preserving 64-bit integers and trailing decimals during search",
    lines: [
      { kind: "command", text: 'gronify search ledger.json --regex "id|amount"' },
      { kind: "output", text: "json.entries[0].id = 12345678901234567890" },
      { kind: "output", text: "json.entries[0].amount = 1.10" },
    ] satisfies TerminalLine[],
  },
  {
    kicker: "vs. gron & fastgron",
    title: "Cross-platform npm install, built-in search, and streaming ungron",
    description:
      "A cross-platform gron and fastgron alternative for macOS, Linux, and Windows: install via npm with built-in regex search and zero external grep or native binary setup. Unlike gron, Gronify preserves document order by default and streams single-document flatten and unflatten in one pass—reconstructing a 3 GB gron file in 7.31 s at 100 MB RSS (Apple M5 Pro, Node.js 22).",
    label: "Streaming unflatten from gron paths to an atomic output file",
    lines: [
      { kind: "command", text: "gronify -o restored.json unflatten archive.gron" },
      { kind: "output", text: "Output written to restored.json" },
    ] satisfies TerminalLine[],
  },
  {
    kicker: "vs. raw grep on JSON",
    title: "Full path context on minified or deeply nested payloads",
    description:
      "Running grep on minified JSON dumps an entire multi-megabyte line; on formatted JSON it prints an isolated key or value without parent array indexes. Gronify emits the complete root-to-leaf path on every line and handles 100,000 nesting levels in 63 MB RSS (Apple M5 Pro, Node.js 22) without call-stack overflow.",
    label: "Finding the exact parent path inside minified nested JSON",
    lines: [
      { kind: "command", text: 'gronify search cluster-state.min.json "unhealthy"' },
      { kind: "output", text: 'json.clusters[2].nodes[14].status = "unhealthy"' },
    ] satisfies TerminalLine[],
  },
  {
    kicker: "With system diff",
    title: "Sort object keys deterministically without breaking array order",
    description:
      "Plain line-sorting interleaves sibling subtrees and orders [10] before [2]. Gronify's --sort orders object keys by UTF-16 code unit at every level, keeps each subtree contiguous, preserves array index order, and spills buffered object lines above 64 MiB to a temp file so two payloads compare cleanly with system diff.",
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

const agentRivers = [
  {
    heading: "Count and cap matches before reading into prompt context",
    description:
      "Large JSON exports quickly exhaust an LLM context window if read whole. Pass --no-color, check match cardinality with --count first, then sample matches with -m or inspect schema shape with flatten --limit. Because Gronify stops reading the input stream at the cap, search -m 5 on a 1.2 GiB JSON array finishes in 0.03 s at 57 MB RSS (Apple M5 Pro, Node.js 22).",
    label: "Progressive JSON narrowing for AI coding agents",
    lines: [
      { kind: "command", text: "gronify --no-color search payload.json error --count" },
      { kind: "output", text: "482" },
      { kind: "command", text: "gronify --no-color search payload.json error -m 3" },
      { kind: "output", text: 'json.events[0].error = "upstream timeout"' },
      { kind: "output", text: 'json.events[14].error = "rate limit exceeded"' },
      { kind: "output", text: 'json.events[29].error = "connection reset"' },
      { kind: "output", text: "Stopped after 3 matches (--max-count); there may be more" },
    ] satisfies TerminalLine[],
    linkText: "Explore result-cap flags",
    linkHref: "#commands",
    isExternal: false,
  },
  {
    heading: "Automate checks with exit codes, atomic writes, and agent skills",
    description:
      "Use --exit-status for deterministic shell branching (0 match, 1 no match, 2 error) and -o to write output atomically only after a run succeeds. Install the open gronify-json-flatten-search skill so supported AI coding agents automatically apply capped, context-safe JSON exploration.",
    label: "Installing the Gronify agent skill and checking JSON exit status",
    lines: [
      {
        kind: "command",
        text: "npx skills add https://github.com/1solomonwakhungu/gronify --skill gronify-json-flatten-search",
      },
      {
        kind: "command",
        text: 'if gronify --no-color search --exit-status config.json -m 1 "debug = true" >/dev/null 2>&1; then echo "debug is on"; fi',
      },
      { kind: "output", text: "debug is on" },
    ] satisfies TerminalLine[],
    linkText: "View agent skill on skills.sh",
    linkHref: skillsUrl,
    isExternal: true,
  },
];

const useCases = [
  {
    title: "Incident response",
    description:
      "Parse service responses and logs to find status, version, region, and error paths immediately without opening an editor.",
  },
  {
    title: "CI investigation",
    description:
      "Inspect generated JSON manifests and build artifacts with deterministic path output and --exit-status checks that fit shell scripts.",
  },
  {
    title: "Support bundles",
    description:
      "Stream and search deeply nested multi-gigabyte exports locally while keeping sensitive customer payloads on your machine.",
  },
  {
    title: "Configuration review",
    description:
      "Flatten both JSON versions with --sort so object keys line up deterministically, then compare paths with diff instead of tracing braces.",
  },
];

const commands = [
  {
    name: "flatten",
    signature: "gronify flatten [file]",
    description:
      "Stream-parse JSON from a file or stdin into one greppable assignment per path. Numbers keep their exact source digits.",
    examples: [
      "gronify flatten data.json",
      "cat data.json | gronify flatten",
      "gronify flatten --sort --limit 100 data.json",
    ],
  },
  {
    name: "search",
    signature: "gronify search <file_or_term> [term]",
    description:
      "Stream-filter JSON from a file or stdin with plain text, extended regex, case sensitivity, match caps, or counts.",
    examples: [
      'gronify search data.json "service"',
      'gronify search data.json --regex "users\\[[0-9]+\\]"',
      'gronify search --exit-status data.json -m 1 "debug = true"',
    ],
  },
  {
    name: "unflatten",
    signature: "gronify unflatten [file]",
    description:
      "Turn gron path assignments from a file or stdin back into valid JSON. Input in document order, as flatten writes it, streams in one pass.",
    examples: [
      "gronify unflatten data.gron",
      "gronify flatten data.json | gronify unflatten",
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
    ],
  },
  {
    title: "Search options",
    options: [
      ["-r, --regex", "Match with extended regular expressions"],
      ["-c, --case-sensitive", "Respect exact letter case"],
      ["--count", "Print only the number of matches"],
      ["-v, --invert-match", "Show lines that do not match"],
      ["-m, --max-count <n>", "Stop after n matches and stop reading the input"],
      ["--sort", "Sort matching lines by object key, as flatten --sort does"],
      ["--exit-status", "Exit 1 when nothing matches; errors then exit 2"],
    ],
  },
];

const installSteps = [
  {
    step: "01",
    title: "npm or npx",
    label: "Install Gronify with npm or run via npx",
    lines: [
      { kind: "command", text: "npm install -g gronify" },
      { kind: "command", text: "npx gronify --help" },
    ] satisfies TerminalLine[],
  },
  {
    step: "02",
    title: "Homebrew",
    label: "Install Gronify with Homebrew",
    lines: [
      { kind: "command", text: "brew install 1solomonwakhungu/tap/gronify" },
    ] satisfies TerminalLine[],
  },
  {
    step: "03",
    title: "Build from source",
    label: "Build Gronify TypeScript CLI from source",
    lines: [
      { kind: "command", text: "git clone " + repositoryUrl + ".git" },
      { kind: "command", text: "cd gronify/src/packages/cli" },
      { kind: "command", text: "npm ci && npm run build && npm link" },
    ] satisfies TerminalLine[],
  },
  {
    step: "04",
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

export default function Home() {
  const captureRepositoryLinkClick = (placement: "header" | "cta") => {
    posthog.capture("repository_link_clicked", { placement });
  };

  const captureIssueReportLinkClick = () => {
    posthog.capture("issue_report_link_clicked", { placement: "cta" });
  };

  const captureSkillLinkClick = (placement: "agents" | "footer") => {
    posthog.capture("skill_link_clicked", { placement });
  };

  return (
    <>
      <a href="#top" className={styles.skipLink}>
        Skip to main content
      </a>

      <header className={styles.navBar}>
        <div className={styles.navBarInner}>
          <a className={styles.wordmark} href="#top" aria-label="Gronify, home">
            <GronifyLogo height={18} decorative />
            <span className={styles.wordmarkText}>Gronify</span>
          </a>
          <nav className={styles.navLinks} aria-label="Page sections">
            <a className={styles.navLink} href="#workflow">
              Workflow
            </a>
            <a className={styles.navLink} href="#compare">
              Compare
            </a>
            <a className={styles.navLink} href="#agents">
              Agents
            </a>
            <a className={styles.navLink} href="#commands">
              Commands
            </a>
            <a className={styles.navLink} href="#install">
              Install
            </a>
          </nav>
          <Button
            as="a"
            href={repositoryUrl}
            variant="secondary"
            size="small"
            onClick={() => captureRepositoryLinkClick("header")}
          >
            View on GitHub
          </Button>
        </div>
      </header>

      <main id="top">
        <Box paddingBlockStart={64} />

        <Section as="div" paddingBlockStart="none" paddingBlockEnd="none" fullWidth>
          <div className={styles.heroReveal}>
            <Hero align="start" variant="gridline-expressive">
              <Hero.Label>
                v{cliVersion} · Local-first TypeScript CLI · MIT
              </Hero.Label>
              <Hero.Heading>
                Gronify: Parse, flatten, and search JSON in the terminal.
              </Hero.Heading>
              <Hero.Description>
                A standalone streaming JSON parser and gron CLI that flattens
                nested payloads into greppable path assignments, filters keys
                and values with plain text or regex, and reconstructs valid
                JSON—without loading multi-gigabyte files into memory.
              </Hero.Description>
              <Hero.ButtonGroup>
                <Button as="a" href="#install" variant="primary">
                  Install Gronify
                </Button>
                <Button as="a" href="#workflow" variant="secondary">
                  See the workflow
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

        <Section id="workflow" paddingBlockStart="spacious" paddingBlockEnd="none">
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Streaming JSON parsing workflow</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Flatten, search, and unflatten JSON in one standalone CLI.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Traditional JSON parsing loads an entire document with
              JSON.parse() or demands an upfront query DSL. Gronify tokenizes
              raw byte streams in 1 MB chunks so you can flatten paths, filter
              matches, and round-trip valid JSON at any file size.
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
                  <Text>{river.description}</Text>
                </River.Content>
              </River>
            ))}
          </Stack>
        </Section>

        <Section id="compare" paddingBlockStart="spacious" paddingBlockEnd="none">
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Ecosystem comparison</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              When to use Gronify vs. jq, gron, fastgron, and grep.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Pick the right command-line tool for the payload in front of you:
              schema-free path discovery, exact 64-bit numbers, single-document
              streaming unflatten, and deterministic key order for system diff.
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
                      {item.description}
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

        <Section id="agents" paddingBlockStart="spacious" paddingBlockEnd="none">
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>AI coding agents & automation</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Explore large JSON files without flooding LLM context.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Built for shell scripts and AI coding agents that inspect unknown
              JSON payloads: count matches first, stop reading early at a line
              cap, branch on grep-style exit codes, and write output atomically.
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
                        ? () => captureSkillLinkClick("agents")
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

        <Section
          id="use-cases"
          paddingBlockStart="spacious"
          paddingBlockEnd="none"
        >
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Operational JSON use cases</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Built for terminal JSON debugging and shell pipelines.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Inspect API responses, CI artifacts, support bundles, and
              generated manifests locally over stdin and stdout, with strict
              JSON syntax diagnostics reporting exact byte offset, line, and
              column.
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

        <Section id="commands" paddingBlockStart="spacious" paddingBlockEnd="none">
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>CLI command reference</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Three Gronify commands: flatten, search, and unflatten.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Move from raw JSON to greppable paths and back over files or
              stdin. Global options control formatting and atomic file writes;
              command flags cap, sort, and filter output.
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
                      <Stack direction="vertical" gap="condensed" padding="none">
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

        <Section id="install" paddingBlockStart="spacious" paddingBlockEnd="none">
          <SectionIntro align="center" fullWidth>
            <SectionIntro.Label>Cross-platform installation</SectionIntro.Label>
            <SectionIntro.Heading size="3">
              Install Gronify via npm, Homebrew, or source.
            </SectionIntro.Heading>
            <SectionIntro.Description>
              Install on macOS, Linux, or Windows via npm, use Homebrew where
              supported, download a GitHub release archive, or build the
              TypeScript CLI from source. Result caps, --sort, and --exit-status
              require v{cliVersion} or newer.
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
              <FAQ.Item
                key={faq.question}
                open={index === 0}
                disableAnimation
              >
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
            Parse and search nested JSON locally with Gronify.
          </CTABanner.Heading>
          <CTABanner.Description>
            Gronify is open source and MIT licensed. Read the source, report an
            issue, or build the standalone TypeScript CLI locally.
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

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <GronifyLogo height={18} decorative />
            <Text as="p" size="200" variant="muted">
              Gronify — local-first streaming JSON parsing and search CLI for
              the terminal. MIT licensed.
            </Text>
          </div>
          <Stack
            direction="horizontal"
            gap="normal"
            padding="none"
            flexWrap="wrap"
          >
            <Link href="#faq" size="small" arrowDirection="none">
              FAQ
            </Link>
            <Link href={repositoryUrl} size="small" arrowDirection="none">
              Repository
            </Link>
            <Link href={npmPackageUrl} size="small" arrowDirection="none">
              npm
            </Link>
            <Link
              href={skillsUrl}
              size="small"
              arrowDirection="none"
              onClick={() => captureSkillLinkClick("footer")}
            >
              Agent Skill
            </Link>
            <Link
              href={`${repositoryUrl}/issues`}
              size="small"
              arrowDirection="none"
            >
              Issues
            </Link>
            <Link
              href={`${repositoryUrl}/security`}
              size="small"
              arrowDirection="none"
            >
              Security
            </Link>
            <Link
              href={`${repositoryUrl}/blob/main/LICENSE`}
              size="small"
              arrowDirection="none"
            >
              MIT License
            </Link>
            <Link href="/llms.txt" size="small" arrowDirection="none">
              llms.txt
            </Link>
            <Link href="/llms-full.txt" size="small" arrowDirection="none">
              llms-full.txt
            </Link>
          </Stack>
        </div>
      </footer>
    </>
  );
}
