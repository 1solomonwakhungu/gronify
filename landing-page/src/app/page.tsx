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

const repositoryUrl = "https://github.com/1solomonwakhungu/gronify";

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
    signature: "gronify search <file_or_term> [term]",
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

const useCases = [
  [
    "Incident response",
    "Find status, version, region, and error fields in service payloads without opening an editor.",
  ],
  [
    "CI investigation",
    "Inspect generated manifests and artifacts with grep-compatible output that fits existing scripts.",
  ],
  [
    "Support bundles",
    "Search deeply nested exports locally while keeping customer data inside your shell workflow.",
  ],
  [
    "Configuration review",
    "Compare meaningful paths instead of visually tracing braces through a large document.",
  ],
];

export default function Home() {
  return (
    <Box>
      <Box
        borderBlockEndWidth="thin"
        borderColor="muted"
        borderStyle="solid"
        backgroundColor="default"
        style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 10 }}
      >
        <Box padding={16}>
          <Stack
            direction="horizontal"
            justifyContent="space-between"
            alignItems="center"
            padding="none"
          >
            <Text as="p" weight="semibold" size="300">
              Gronify
            </Text>
            <Stack direction="horizontal" gap="spacious" padding="none">
              <Link href="#workflow" size="small">
                Workflow
              </Link>
              <Link href="#commands" size="small">
                Commands
              </Link>
              <Link href="#install" size="small">
                Install
              </Link>
            </Stack>
            <Button as="a" href={repositoryUrl} variant="secondary" size="small">
              View on GitHub
            </Button>
          </Stack>
        </Box>
      </Box>

      <Box paddingBlockStart={64} id="top">
        <Section paddingBlockStart="none" paddingBlockEnd="none" fullWidth>
          <Hero align="start">
            <Hero.Label>Local-first JSON tooling</Hero.Label>
            <Hero.Heading>Search JSON. Find answers.</Hero.Heading>
            <Hero.Description>
              Flatten large payloads into greppable paths, search the fields
              that matter, and reconstruct valid JSON without leaving the
              terminal.
            </Hero.Description>
            <Hero.PrimaryAction href="#install">
              Install Gronify
            </Hero.PrimaryAction>
            <Hero.SecondaryAction href="#workflow">
              See the workflow
            </Hero.SecondaryAction>
          </Hero>
        </Section>
      </Box>

      <Section paddingBlockStart="none" paddingBlockEnd="spacious">
        <Box
          borderWidth="thin"
          borderColor="default"
          borderStyle="solid"
          borderRadius="medium"
          padding="normal"
        >
          <Stack direction="vertical" gap="condensed" padding="none">
            <Text as="p" size="100" variant="muted" font="monospace">
              $ gronify search payload.json --regex &quot;status|version&quot;
            </Text>
            <Text as="p" size="100" font="monospace">
              json.deployments[0].version = &quot;2026.05.22&quot;;
            </Text>
            <Text as="p" size="100" font="monospace">
              json.deployments[1].version = &quot;2026.05.21&quot;;
            </Text>
            <Text as="p" size="100" font="monospace">
              json.service.status = &quot;degraded&quot;;
            </Text>
          </Stack>
        </Box>
      </Section>

      <Section id="workflow" paddingBlockStart="none">
        <SectionIntro align="center" fullWidth>
          <SectionIntro.Label>The workflow</SectionIntro.Label>
          <SectionIntro.Heading>
            Structure first. Search second. Pipe everything.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            Gronify ships flattening, unflattening, and search in one
            standalone TypeScript CLI. The transformation stays explicit and
            the common inspection loop gets a focused command interface.
          </SectionIntro.Description>
        </SectionIntro>

        <Box paddingBlockStart={48}>
          <Stack direction="vertical" padding="none" gap="spacious">
            <River variant="gridline">
              <River.Visual>
                <Box
                  borderWidth="thin"
                  borderColor="default"
                  borderStyle="solid"
                  borderRadius="medium"
                  padding="normal"
                >
                  <Text as="p" size="100" font="monospace">
                    json.service.name = &quot;checkout&quot;;
                    <br />
                    json.service.status = &quot;degraded&quot;;
                    <br />
                    json.deployments[0].region = &quot;us-central1&quot;;
                  </Text>
                </Box>
              </River.Visual>
              <River.Content>
                <Heading size="4">Flatten: expose every path</Heading>
                <Text as="p">
                  Nested values become line-oriented assignments that
                  standard text tools can inspect.
                </Text>
              </River.Content>
            </River>
            <River variant="gridline">
              <River.Visual>
                <Box
                  borderWidth="thin"
                  borderColor="default"
                  borderStyle="solid"
                  borderRadius="medium"
                  padding="normal"
                >
                  <Text as="p" size="100" font="monospace">
                    $ gronify search data.json --regex
                    <br />
                    &quot;users\[[0-9]+\]&quot;
                  </Text>
                </Box>
              </River.Visual>
              <River.Content>
                <Heading size="4">Search: keep only the signal</Heading>
                <Text as="p">
                  Use plain text or extended regex, then choose
                  case-sensitive output or a match count.
                </Text>
              </River.Content>
            </River>
            <River variant="gridline">
              <River.Visual>
                <Box
                  borderWidth="thin"
                  borderColor="default"
                  borderStyle="solid"
                  borderRadius="medium"
                  padding="normal"
                >
                  <Text as="p" size="100" font="monospace">
                    $ gronify flatten data.json | gronify unflatten
                  </Text>
                </Box>
              </River.Visual>
              <River.Content>
                <Heading size="4">Unflatten: return to valid JSON</Heading>
                <Text as="p">
                  Send complete, structurally valid gron data through the
                  built-in engine when a JSON document is needed.
                </Text>
              </River.Content>
            </River>
          </Stack>
        </Box>
      </Section>

      <Section backgroundColor="subtle">
        <SectionIntro align="center" fullWidth>
          <SectionIntro.Label>Where it fits</SectionIntro.Label>
          <SectionIntro.Heading>
            One tool, four operational moments.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            The interface stays small because the shell already provides
            composition, redirection, diffing, and automation.
          </SectionIntro.Description>
        </SectionIntro>

        <Box paddingBlockStart={48}>
          <Box
            borderBlockStartWidth="thin"
            borderBlockEndWidth="thin"
            borderColor="muted"
            borderStyle="solid"
          >
            <Grid columnGap="none" rowGap="none" enableGutters={false}>
              {useCases.map(([title, description]) => (
                <Grid.Column key={title} span={{ xsmall: 12, medium: 6 }}>
                  <Box
                    padding="spacious"
                    borderInlineStartWidth="thin"
                    borderColor="muted"
                    borderStyle="solid"
                  >
                    <Heading size="6">{title}</Heading>
                    <Box paddingBlockStart={8}>
                      <Text as="p" variant="muted">
                        {description}
                      </Text>
                    </Box>
                  </Box>
                </Grid.Column>
              ))}
            </Grid>
          </Box>
        </Box>

        <Box paddingBlockStart={64}>
          <River imageTextRatio="60:40">
            <River.Visual>
              <Box
                borderWidth="thin"
                borderColor="default"
                borderStyle="solid"
                borderRadius="medium"
                padding="normal"
              >
                <Text as="p" size="100" font="monospace">
                  curl -s https://example.com/payload.json \
                  <br />
                  &nbsp;&nbsp;| gronify search --regex
                  &quot;metadata|status&quot;
                </Text>
              </Box>
            </River.Visual>
            <River.Content>
              <SectionIntro.Label>Composability</SectionIntro.Label>
              <Heading size="4">
                Use the tools already in your muscle memory.
              </Heading>
              <Text as="p">
                Gronify reads stdin and writes stdout, so it can sit between
                curl, grep, sort, and the rest of your shell workflow.
              </Text>
            </River.Content>
          </River>
        </Box>
      </Section>

      <Section id="commands">
        <SectionIntro align="center" fullWidth>
          <SectionIntro.Label>Command reference</SectionIntro.Label>
          <SectionIntro.Heading>
            A small surface area by design.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            Three commands cover the round trip. Global options control
            presentation; search options control matching.
          </SectionIntro.Description>
        </SectionIntro>

        <Box paddingBlockStart={48}>
          <Stack direction="vertical" gap="normal" padding="none">
            {commands.map((command) => (
              <Box
                key={command.name}
                borderWidth="thin"
                borderColor="muted"
                borderStyle="solid"
                borderRadius="medium"
                padding="normal"
              >
                <Grid>
                  <Grid.Column span={{ xsmall: 12, medium: 6 }}>
                    <Heading size="6">{command.signature}</Heading>
                    <Box paddingBlockStart={8}>
                      <Text as="p" variant="muted">
                        {command.description}
                      </Text>
                    </Box>
                  </Grid.Column>
                  <Grid.Column span={{ xsmall: 12, medium: 6 }}>
                    <Box
                      backgroundColor="subtle"
                      borderRadius="medium"
                      padding="condensed"
                    >
                      {command.examples.map((example) => (
                        <Text
                          key={example}
                          as="p"
                          size="100"
                          font="monospace"
                          variant="muted"
                        >
                          {example}
                        </Text>
                      ))}
                    </Box>
                  </Grid.Column>
                </Grid>
              </Box>
            ))}
          </Stack>
        </Box>

        <Box paddingBlockStart={64}>
          <Grid>
            <Grid.Column span={{ xsmall: 12, medium: 6 }}>
              <Heading size="6">Global options</Heading>
              <Box paddingBlockStart={16}>
                <Stack direction="vertical" gap="condensed" padding="none">
                  <Text as="p">
                    <code>--color</code> — Enable color when supported
                  </Text>
                  <Text as="p">
                    <code>--no-color</code> — Force plain output
                  </Text>
                  <Text as="p">
                    <code>--pretty</code> — Add readable grouping
                  </Text>
                  <Text as="p">
                    <code>-h, --help</code> — Show command help
                  </Text>
                </Stack>
              </Box>
            </Grid.Column>
            <Grid.Column span={{ xsmall: 12, medium: 6 }}>
              <Heading size="6">Search options</Heading>
              <Box paddingBlockStart={16}>
                <Stack direction="vertical" gap="condensed" padding="none">
                  <Text as="p">
                    <code>-r, --regex</code> — Use extended regular
                    expressions
                  </Text>
                  <Text as="p">
                    <code>-c, --case-sensitive</code> — Match exact letter
                    case
                  </Text>
                  <Text as="p">
                    <code>--count</code> — Print only the match count
                  </Text>
                </Stack>
              </Box>
            </Grid.Column>
          </Grid>
        </Box>
      </Section>

      <Section id="install" backgroundColor="subtle">
        <Grid>
          <Grid.Column span={{ xsmall: 12, medium: 5 }}>
            <SectionIntro.Label>Installation</SectionIntro.Label>
            <Box paddingBlockStart={16}>
              <Heading size="4">Install it your way.</Heading>
            </Box>
            <Box paddingBlockStart={16}>
              <Text as="p" variant="muted">
                Use Homebrew for the shortest path, download the latest
                release archive, or clone the repository to build the CLI
                from source.
              </Text>
            </Box>
            <Box paddingBlockStart={32}>
              <Stack direction="vertical" gap="condensed" padding="none">
                <Text as="p">
                  <b>Node.js</b> — 20 or newer
                </Text>
                <Text as="p">
                  <b>External tools</b> — none required
                </Text>
                <Text as="p">
                  <b>License</b> — MIT
                </Text>
                <Text as="p">
                  <b>Current release</b> — v1.0.0
                </Text>
              </Stack>
            </Box>
          </Grid.Column>
          <Grid.Column span={{ xsmall: 12, medium: 7 }}>
            <Stack direction="vertical" gap="normal" padding="none">
              <Box
                borderWidth="thin"
                borderColor="muted"
                borderStyle="solid"
                borderRadius="medium"
                padding="normal"
              >
                <Text as="p" size="100" variant="muted">
                  1 · Homebrew
                </Text>
                <Text as="p" size="100" font="monospace">
                  brew install 1solomonwakhungu/tap/gronify
                  <br />
                  gronify --help
                </Text>
              </Box>
              <Box
                borderWidth="thin"
                borderColor="muted"
                borderStyle="solid"
                borderRadius="medium"
                padding="normal"
              >
                <Text as="p" size="100" variant="muted">
                  2 · Release archive
                </Text>
                <Text as="p" size="100" font="monospace">
                  https://github.com/1solomonwakhungu/gronify/releases
                </Text>
              </Box>
              <Box
                borderWidth="thin"
                borderColor="muted"
                borderStyle="solid"
                borderRadius="medium"
                padding="normal"
              >
                <Text as="p" size="100" variant="muted">
                  3 · Build from source
                </Text>
                <Text as="p" size="100" font="monospace">
                  git clone https://github.com/1solomonwakhungu/gronify.git
                  <br />
                  cd gronify/src/packages/cli
                  <br />
                  npm ci
                  <br />
                  npm run build
                  <br />
                  npm link
                </Text>
              </Box>
              <Box
                borderWidth="thin"
                borderColor="muted"
                borderStyle="solid"
                borderRadius="medium"
                padding="normal"
              >
                <Text as="p" size="100" variant="muted">
                  4 · Verify the CLI
                </Text>
                <Text as="p" size="100" font="monospace">
                  gronify --help
                  <br />
                  gronify flatten data.json
                </Text>
              </Box>
            </Stack>
          </Grid.Column>
        </Grid>
      </Section>

      <Section>
        <SectionIntro fullWidth>
          <SectionIntro.Label>Troubleshooting</SectionIntro.Label>
          <SectionIntro.Heading>
            Common setup questions, answered.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            The CLI delegates transformation and search to tools on your
            machine, so most setup issues are straightforward to isolate.
          </SectionIntro.Description>
        </SectionIntro>

        <Box paddingBlockStart={48}>
          <FAQ>
            <FAQ.Heading>Frequently asked questions</FAQ.Heading>
            <FAQ.Item name="faq-1" open>
                <FAQ.Question>
                  Does Gronify require fastgron or grep?
                </FAQ.Question>
                <FAQ.Answer>
                  <p>
                    No. Flattening, unflattening, and search are built into
                    the standalone CLI.
                  </p>
                </FAQ.Answer>
              </FAQ.Item>
              <FAQ.Item name="faq-1">
                <FAQ.Question>Can I use Gronify on Windows?</FAQ.Question>
                <FAQ.Answer>
                  <p>
                    Use the release archive for your platform, Homebrew
                    where supported, or build the TypeScript CLI from source
                    with Node.js 20 or newer.
                  </p>
                </FAQ.Answer>
              </FAQ.Item>
              <FAQ.Item name="faq-1">
                <FAQ.Question>
                  Why do the integration tests fail before assertions run?
                </FAQ.Question>
                <FAQ.Answer>
                  <p>
                    Run <code>npm run build</code> first so{" "}
                    <code>dist/index.js</code> exists before starting the
                    integration tests.
                  </p>
                </FAQ.Answer>
              </FAQ.Item>
              <FAQ.Item name="faq-1">
                <FAQ.Question>
                  Does Gronify send JSON to a service?
                </FAQ.Question>
                <FAQ.Answer>
                  <p>
                    No. Gronify is local-first and processes data through the
                    CLI tools installed on your machine.
                  </p>
                </FAQ.Answer>
              </FAQ.Item>
          </FAQ>
        </Box>
      </Section>

      <CTABanner align="center" hasGridLines>
        <CTABanner.Heading>
          Stop tracing braces. Start searching paths.
        </CTABanner.Heading>
        <CTABanner.Description>
          Inspect the source, report an issue, or build the CLI locally.
          Gronify is open source and MIT licensed.
        </CTABanner.Description>
        <CTABanner.ButtonGroup>
          <Button as="a" href={repositoryUrl} variant="primary">
            View the repository
          </Button>
        </CTABanner.ButtonGroup>
      </CTABanner>

      <Box
        borderBlockStartWidth="thin"
        borderColor="muted"
        borderStyle="solid"
        padding={32}
      >
        <Stack
          direction="horizontal"
          justifyContent="space-between"
          alignItems="center"
          padding="none"
          flexWrap="wrap"
        >
          <Text as="p" variant="muted" size="200">
            Gronify — local-first JSON inspection for the terminal.
          </Text>
          <Stack direction="horizontal" gap="normal" padding="none">
            <Link href={`${repositoryUrl}/issues`} size="small">
              Issues
            </Link>
            <Link href={`${repositoryUrl}/security`} size="small">
              Security
            </Link>
            <Link href={`${repositoryUrl}/blob/main/LICENSE`} size="small">
              MIT License
            </Link>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
