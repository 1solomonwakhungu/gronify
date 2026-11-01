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
      {lines.map((line) => (
        <code
          key={line.text}
          className={`${styles.terminalLine} ${
            line.kind === "command" ? "" : styles.terminalPath
          }`}
        >
          {line.kind === "command" ? (
            <>
              <span className={styles.terminalPrompt}>$ </span>
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
      "Stream document-order gron assignments through the built-in unflatten command to reconstruct valid JSON with source numbers preserved verbatim.",
    label: "Round-tripping gron assignments back to JSON",
    lines: [
      { kind: "command", text: "gronify flatten data.json | gronify unflatten" },
      { kind: "output", text: '{"service":{"name":"checkout"}}' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Stream multi-gigabyte JSON in ~100 MB memory",
    description:
      "All three commands stream their input, keeping peak memory around 100 MB on the default path at any file size; --sort on a large top-level object and out-of-order unflatten input use more. With -m or --limit, Gronify stops reading at the cap, writes a notice to stderr (the last line below), and exits 0.",
    label: "Stopping a JSON search after two matches",
    lines: [
      { kind: "command", text: 'gronify search events.json -m 2 "error"' },
      { kind: "output", text: 'json[0].error = "timeout"' },
      { kind: "output", text: 'json[7].error = "connection reset"' },
      { kind: "output", text: "Stopped after 2 matches (--max-count); there may be more" },
    ] satisfies TerminalLine[],
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
            <a className={styles.navLink} href="#commands">
              Commands
            </a>
            <a className={styles.navLink} href="#install">
              Install
            </a>
            <a className={styles.navLink} href="#faq">
              FAQ
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
              Traditional JSON parsing loads an entire document into memory with
              JSON.parse() or requires upfront filter queries. Gronify tokenizes
              raw JSON streams in 1 MB chunks so you can flatten paths, search
              matches, and round-trip valid JSON in ~100 MB of memory on the
              default path.
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
            <Link href={repositoryUrl} size="small" arrowDirection="none">
              Repository
            </Link>
            <Link href={npmPackageUrl} size="small" arrowDirection="none">
              npm
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
