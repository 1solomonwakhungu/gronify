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

import { GronifyLogo } from "./logo";
import styles from "./page.module.css";

const repositoryUrl = "https://github.com/1solomonwakhungu/gronify";

type TerminalLine = {
  kind: "command" | "output";
  text: string;
};

function Terminal({
  lines,
  label,
}: {
  lines: TerminalLine[];
  label: string;
}) {
  return (
    <div className={styles.terminal} role="figure" aria-label={label}>
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
  { kind: "output", text: 'json.deployments[0].version = "2026.05.22";' },
  { kind: "output", text: 'json.deployments[1].version = "2026.05.21";' },
  { kind: "output", text: 'json.service.status = "degraded";' },
];

const rivers = [
  {
    heading: "Flatten: expose every path",
    description:
      "Nested values become line-oriented assignments that standard text tools can inspect.",
    label: "Every value on one line",
    lines: [
      { kind: "command", text: "gronify flatten service.json" },
      { kind: "output", text: 'json.service.name = "checkout";' },
      { kind: "output", text: 'json.service.status = "degraded";' },
      { kind: "output", text: 'json.deployments[0].region = "us-central1";' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Search: keep only the signal",
    description:
      "Use plain text or extended regex, then choose case-sensitive output or a match count.",
    label: "Regex search across a payload",
    lines: [
      { kind: "command", text: 'gronify search data.json --regex "users\\[[0-9]+\\]"' },
      { kind: "output", text: 'json.users[0].email = "ada@example.com";' },
      { kind: "output", text: 'json.users[1].email = "grace@example.com";' },
    ] satisfies TerminalLine[],
  },
  {
    heading: "Unflatten: return to valid JSON",
    description:
      "Send structurally valid gron data back through the built-in engine when a JSON document is needed.",
    label: "Round-tripping gron back to JSON",
    lines: [
      { kind: "command", text: "gronify flatten data.json | gronify unflatten" },
      { kind: "output", text: "{" },
      { kind: "output", text: '  "service": { "name": "checkout" }' },
      { kind: "output", text: "}" },
    ] satisfies TerminalLine[],
  },
];

const useCases = [
  {
    title: "Incident response",
    description:
      "Find status, version, region, and error fields in service payloads without opening an editor.",
  },
  {
    title: "CI investigation",
    description:
      "Inspect generated manifests and artifacts with grep-compatible output that fits existing scripts.",
  },
  {
    title: "Support bundles",
    description:
      "Search deeply nested exports locally while keeping customer data inside your shell workflow.",
  },
  {
    title: "Configuration review",
    description:
      "Compare meaningful paths instead of visually tracing braces through a large document.",
  },
];

const commands = [
  {
    name: "flatten",
    signature: "gronify flatten [file]",
    description:
      "Convert JSON from a file or stdin into one greppable assignment per path.",
    examples: ["gronify flatten data.json", "cat data.json | gronify flatten"],
  },
  {
    name: "search",
    signature: "gronify search <file> [term]",
    description:
      "Flatten and filter in one step with plain text, regex, case sensitivity, or counts.",
    examples: [
      'gronify search data.json "service"',
      'gronify search data.json --regex "users\\[[0-9]+\\]"',
    ],
  },
  {
    name: "unflatten",
    signature: "gronify unflatten [file]",
    description:
      "Turn gron assignments from a file or stdin back into valid JSON.",
    examples: [
      "gronify unflatten data.gron",
      "gronify flatten data.json | gronify unflatten",
    ],
  },
];

const globalOptions = [
  ["--color", "Enable color when the terminal supports it"],
  ["--no-color", "Force plain output for pipes and logs"],
  ["--pretty", "Add readable grouping to flattened output"],
  ["-h, --help", "Show help for any command"],
];

const searchOptions = [
  ["-r, --regex", "Match with extended regular expressions"],
  ["-c, --case-sensitive", "Respect exact letter case"],
  ["--count", "Print only the number of matches"],
];

const installSteps = [
  {
    step: "01",
    title: "Homebrew",
    lines: [
      { kind: "command", text: "brew install 1solomonwakhungu/tap/gronify" },
    ] satisfies TerminalLine[],
  },
  {
    step: "02",
    title: "Build from source",
    lines: [
      { kind: "command", text: "git clone " + repositoryUrl + ".git" },
      { kind: "command", text: "cd gronify/src/packages/cli" },
      { kind: "command", text: "npm ci && npm run build && npm link" },
    ] satisfies TerminalLine[],
  },
  {
    step: "03",
    title: "Verify the CLI",
    lines: [
      { kind: "command", text: "gronify --help" },
      { kind: "command", text: "gronify flatten data.json" },
    ] satisfies TerminalLine[],
  },
];

const requirements = [
  ["Node.js", "20 or newer"],
  ["External tools", "None required"],
  ["License", "MIT"],
  ["Current release", "v1.0.0"],
];

const faqs = [
  {
    question: "Does Gronify require fastgron or grep?",
    answer:
      "No. Flattening, unflattening, and search are all built into the standalone CLI.",
  },
  {
    question: "Can I use Gronify on Windows?",
    answer:
      "Yes. Use the release archive for your platform, Homebrew where supported, or build the TypeScript CLI from source with Node.js 20 or newer.",
  },
  {
    question: "Why do the integration tests fail before assertions run?",
    answer:
      "Run npm run build first, so that dist/index.js exists before the integration tests start.",
  },
  {
    question: "Does Gronify send JSON to a service?",
    answer:
      "No. Gronify is local-first. Every payload is processed by the CLI on your own machine.",
  },
];

export default function Home() {
  return (
    <>
      <div className={styles.navBar}>
        <div className={styles.navBarInner}>
          <a className={styles.wordmark} href="#top" aria-label="Gronify, home">
            <GronifyLogo height={18} />
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
          </nav>
          <Button as="a" href={repositoryUrl} variant="secondary" size="small">
            View on GitHub
          </Button>
        </div>
      </div>

      <Box paddingBlockStart={64} id="top" />

      <Section paddingBlockStart="none" paddingBlockEnd="none" fullWidth>
        <Hero align="start" variant="gridline-expressive">
          <Hero.Label>Local-first JSON tooling</Hero.Label>
          <Hero.Heading>Search JSON. Find answers.</Hero.Heading>
          <Hero.Description>
            Flatten large payloads into greppable paths, search the fields that
            matter, and reconstruct valid JSON without leaving the terminal.
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
      </Section>

      <div className={styles.heroBand}>
        <div className={styles.heroBandInner}>
          <Terminal
            label="Searching a deployment payload with Gronify"
            lines={heroTranscript}
          />
        </div>
      </div>

      <Section id="workflow" paddingBlockStart="spacious" paddingBlockEnd="none">
        <SectionIntro align="center" fullWidth>
          <SectionIntro.Label>The workflow</SectionIntro.Label>
          <SectionIntro.Heading size="3">
            Structure first. Search second. Pipe everything.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            Gronify ships flattening, unflattening, and search in one standalone
            TypeScript CLI.
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
                <Heading size="4">{river.heading}</Heading>
                <Text>{river.description}</Text>
              </River.Content>
            </River>
          ))}
        </Stack>
      </Section>

      <Section paddingBlockStart="spacious" paddingBlockEnd="none">
        <SectionIntro align="center" fullWidth>
          <SectionIntro.Label>Where it fits</SectionIntro.Label>
          <SectionIntro.Heading size="3">
            One tool, four operational moments.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            The interface stays small because the shell already provides
            composition, redirection, diffing, and automation.
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
          <SectionIntro.Label>Command reference</SectionIntro.Label>
          <SectionIntro.Heading size="3">
            A small surface area by design.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            Three commands cover the round trip. Global options control
            presentation; search options control matching.
          </SectionIntro.Description>
        </SectionIntro>
      </Section>

      <Section paddingBlockStart="normal" paddingBlockEnd="none">
        <Grid>
          <Grid.Column span={12}>
            <div className={`${styles.gridFrame} ${styles.gridFrameThreeUp}`}>
              {commands.map((command) => (
                <div key={command.name} className={styles.gridCell}>
                  <Text
                    as="p"
                    size="100"
                    font="monospace"
                    weight="semibold"
                    className={styles.wrapAnywhere}
                  >
                    {command.signature}
                  </Text>
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
            <div className={`${styles.gridFrame} ${styles.gridFrameTwoUp}`}>
              <div className={styles.gridCell}>
                <Heading as="h3" size="6">
                  Global options
                </Heading>
                <Box paddingBlockStart={8}>
                  <Stack direction="vertical" gap="condensed" padding="none">
                    {globalOptions.map(([flag, description]) => (
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
              <div className={styles.gridCell}>
                <Heading as="h3" size="6">
                  Search options
                </Heading>
                <Box paddingBlockStart={8}>
                  <Stack direction="vertical" gap="condensed" padding="none">
                    {searchOptions.map(([flag, description]) => (
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
            </div>
          </Grid.Column>
        </Grid>
      </Section>

      <Section id="install" paddingBlockStart="spacious" paddingBlockEnd="none">
        <SectionIntro align="center" fullWidth>
          <SectionIntro.Label>Installation</SectionIntro.Label>
          <SectionIntro.Heading size="3">Install it your way.</SectionIntro.Heading>
          <SectionIntro.Description>
            Use Homebrew for the shortest path, or clone the repository and build
            the CLI from source.
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
                    <Terminal
                      label={`How to ${step.title.toLowerCase()}`}
                      lines={step.lines}
                    />
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

      <Box paddingBlockStart={64} paddingBlockEnd={64}>
        <FAQ variant="gridline">
          <FAQ.Heading size="4" align="center">
            Frequently asked questions
          </FAQ.Heading>
          {faqs.map((faq, index) => (
            <FAQ.Item key={faq.question} name="gronify-faq" open={index === 0}>
              <FAQ.Question>{faq.question}</FAQ.Question>
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
        <CTABanner.Heading size="3">
          Stop tracing braces. Start searching paths.
        </CTABanner.Heading>
        <CTABanner.Description>
          Gronify is open source and MIT licensed. Read the source, report an
          issue, or build the CLI locally.
        </CTABanner.Description>
        <CTABanner.ButtonGroup>
          <Button as="a" href={repositoryUrl} variant="primary">
            View the repository
          </Button>
          <Button as="a" href={`${repositoryUrl}/issues`} variant="secondary">
            Report an issue
          </Button>
        </CTABanner.ButtonGroup>
      </CTABanner>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <GronifyLogo height={18} />
            <Text as="p" size="200" variant="muted">
              Local-first JSON inspection for the terminal. MIT licensed.
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
          </Stack>
        </div>
      </footer>
    </>
  );
}
