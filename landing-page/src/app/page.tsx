/*
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5
 * Hallmark · macrostructure: Workbench · genre: modern-minimal
 * audience: engineers inspecting operational JSON · use: understand and install
 * theme: Linear-derived dark · nav: inline command pill · footer: statement
 * enrichment: real CLI transformation · motion: reveal + path-highlight
 *
 * THESIS: JSON becomes useful when its structure becomes searchable; this page
 * refuses the generic feature-card hero and opens on the transformation itself.
 * OWN-WORLD: violet-black canvas, precise separators, indigo action, code as data.
 * STORY: see the mechanism, choose a workflow, understand the commands, install.
 * FIRST VIEWPORT: offer and actions left; a real flatten/search trace right.
 * FORM: operational workbench with alternating dense and quiet passages.
 */

const repositoryUrl = "https://github.com/1solomonwakhungu/gronify";

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GitHubIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.02c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.74-1.55-2.57-.29-5.28-1.29-5.28-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.94 10.94 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.05c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
  </svg>
);

const Mark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="339 399 347 226" fill="currentColor">
      <path d="M0 0 C2.91286278 1.45643139 5.42505219 2.86796524 8.10546875 4.66015625 C9.31614014 5.46791504 9.31614014 5.46791504 10.55126953 6.29199219 C11.42122559 6.87625977 12.29118164 7.46052734 13.1875 8.0625 C14.0935498 8.66868164 14.99959961 9.27486328 15.93310547 9.89941406 C26.55915797 17.02183842 37.13046279 24.22537583 47.69775391 31.43457031 C49.45901273 32.63215161 51.22786304 33.81857536 53 35 C53 35.66 53 36.32 53 37 C51.19140625 38.3046875 51.19140625 38.3046875 48.5625 39.875 C43.57579202 42.95746062 38.77297111 46.22173617 34 49.625 C27.62181536 54.16138692 21.20758283 58.63975441 14.75 63.0625 C13.95207031 63.6105127 13.15414063 64.15852539 12.33203125 64.72314453 C11.20087891 65.49634033 11.20087891 65.49634033 10.046875 66.28515625 C9.38526367 66.73769775 8.72365234 67.19023926 8.04199219 67.65649414 C5.73801534 69.17236987 3.36490713 70.58105572 1 72 C1 63.75 1 55.5 1 47 C-96.35 47 -193.7 47 -294 47 C-294 39.74 -294 32.48 -294 25 C-196.98 25 -99.96 25 0 25 C0 16.75 0 8.5 0 0 Z" transform="translate(633,476)" />
      <path d="M0 0 C68.31 0 136.62 0 207 0 C207 6.93 207 13.86 207 21 C138.69 21 70.38 21 0 21 C0 14.07 0 7.14 0 0 Z" transform="translate(339,553)" />
      <path d="M0 0 C68.31 0 136.62 0 207 0 C207 6.93 207 13.86 207 21 C138.69 21 70.38 21 0 21 C0 14.07 0 7.14 0 0 Z" transform="translate(339,450)" />
      <path d="M0 0 C37.95 0 75.9 0 115 0 C115 6.93 115 13.86 115 21 C77.05 21 39.1 21 0 21 C0 14.07 0 7.14 0 0 Z" transform="translate(339,604)" />
      <path d="M0 0 C37.95 0 75.9 0 115 0 C115 6.93 115 13.86 115 21 C77.05 21 39.1 21 0 21 C0 14.07 0 7.14 0 0 Z" transform="translate(339,399)" />
    </svg>
  </span>
);

const CodePanel = ({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <figure className={`code-panel ${className}`}>
    <figcaption>{label}</figcaption>
    <pre tabIndex={0}>
      <code>{children}</code>
    </pre>
  </figure>
);

const SectionHeading = ({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) => (
  <div className="section-heading">
    <p className="section-label">{label}</p>
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  </div>
);

const commands = [
  {
    name: "flatten",
    signature: "gronify flatten [file]",
    description: "Convert JSON from a file or stdin into one greppable assignment per path.",
    examples: ["gronify flatten data.json", "cat data.json | gronify flatten"],
  },
  {
    name: "search",
    signature: "gronify search <file_or_term> [term]",
    description: "Flatten and filter in one step with plain text, regex, case sensitivity, or counts.",
    examples: [
      'gronify search data.json "service"',
      'gronify search data.json --regex "users\\[[0-9]+\\]"',
    ],
  },
  {
    name: "unflatten",
    signature: "gronify unflatten [file]",
    description: "Turn gron assignments from a file or stdin back into valid JSON.",
    examples: ["gronify unflatten data.gron", "gronify flatten data.json | gronify unflatten"],
  },
];

const useCases = [
  ["Incident response", "Find status, version, region, and error fields in service payloads without opening an editor."],
  ["CI investigation", "Inspect generated manifests and artifacts with grep-compatible output that fits existing scripts."],
  ["Support bundles", "Search deeply nested exports locally while keeping customer data inside your shell workflow."],
  ["Configuration review", "Compare meaningful paths instead of visually tracing braces through a large document."],
];

export default function Home() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="site-header">
        <nav className="nav-shell" aria-label="Primary navigation">
          <a className="wordmark" href="#top" aria-label="Gronify home">
            <Mark />
            <span>Gronify</span>
          </a>
          <div className="nav-links">
            <a href="#workflow">Workflow</a>
            <a className="nav-command-link" href="#commands">Commands</a>
            <a href="#install">Install</a>
          </div>
          <a className="nav-github" href={repositoryUrl} target="_blank" rel="noreferrer">
            <GitHubIcon />
            <span>GitHub</span>
          </a>
        </nav>
      </header>

      <main id="main">
        <section id="top" className="hero" aria-labelledby="hero-title">
          <div className="hero-glow" aria-hidden="true" />
          <div className="page-width hero-grid">
            <div className="hero-copy">
              <div className="status-chip">
                <span aria-hidden="true" />
                Local-first JSON tooling
              </div>
              <h1 id="hero-title">Make nested JSON answerable.</h1>
              <p className="hero-lede">
                Flatten large payloads into greppable paths, search the fields that matter, and reconstruct valid JSON without leaving the terminal.
              </p>
              <div className="hero-actions">
                <a className="button button--primary" href="#install">
                  Install Gronify <ArrowIcon />
                </a>
                <a className="button button--secondary" href="#workflow">
                  See the workflow
                </a>
              </div>
              <dl className="requirement-strip" aria-label="Runtime requirements">
                <div><dt>Runtime</dt><dd>Node.js 20+</dd></div>
                <div><dt>Engine</dt><dd>Built in</dd></div>
                <div><dt>Input</dt><dd>File or stdin</dd></div>
              </dl>
            </div>

            <div className="hero-workbench" aria-label="Gronify command demonstration">
              <div className="workbench-head">
                <span>payload.json</span>
                <span className="workbench-state">3 matches</span>
              </div>
              <div className="workbench-command">
                <span className="prompt">$</span>
                <span>gronify search payload.json --regex</span>
                <strong>&quot;status|version&quot;</strong>
              </div>
              <div className="path-output">
                <p><span>json.deployments[0].</span>version <b>=</b> <strong>&quot;2026.05.22&quot;</strong>;</p>
                <p><span>json.deployments[1].</span>version <b>=</b> <strong>&quot;2026.05.21&quot;</strong>;</p>
                <p><span>json.service.</span>status <b>=</b> <strong className="warning">&quot;degraded&quot;</strong>;</p>
              </div>
              <div className="workbench-foot">
                <span>plain text</span><span>extended regex</span><span>stdin / stdout</span>
              </div>
            </div>
          </div>
        </section>

        <section className="context-band" aria-label="Gronify use cases">
          <div className="page-width context-row">
            <p>Built for the JSON that appears in</p>
            <ul>
              <li>CI logs</li><li>service responses</li><li>generated config</li><li>support bundles</li>
            </ul>
          </div>
        </section>

        <section id="workflow" className="section page-width">
          <SectionHeading
            label="The workflow"
            title="Structure first. Search second. Pipe everything."
            description="Gronify ships flattening, unflattening, and search in one standalone TypeScript CLI. The transformation stays explicit and the common inspection loop gets a focused command interface."
          />

          <div className="transformation">
            <CodePanel label="01 · Input JSON">
              {`{
  "service": {
    "name": "checkout",
    "status": "degraded"
  },
  "deployments": [
    { "region": "us-central1", "version": "2026.05.22" }
  ]
}`}
            </CodePanel>
            <div className="transform-arrow" aria-hidden="true"><ArrowIcon /></div>
            <CodePanel label="02 · Greppable output" className="code-panel--accent">
              <><span className="code-dim">json.service.name = </span><span className="code-value">&quot;checkout&quot;</span>{`;\n`}<span className="code-dim">json.service.status = </span><span className="code-value">&quot;degraded&quot;</span>{`;\n`}<span className="code-dim">json.deployments[0].region = </span><span className="code-value">&quot;us-central1&quot;</span>{`;\n`}<span className="code-dim">json.deployments[0].version = </span><span className="code-value">&quot;2026.05.22&quot;</span>;</>
            </CodePanel>
          </div>

          <div className="workflow-notes">
            <article><span>Flatten</span><h3>Expose every path</h3><p>Nested values become line-oriented assignments that standard text tools can inspect.</p></article>
            <article><span>Search</span><h3>Keep only the signal</h3><p>Use plain text or extended regex, then choose case-sensitive output or a match count.</p></article>
            <article><span>Unflatten</span><h3>Return to valid JSON</h3><p>Send complete, structurally valid gron data through the built-in engine when a JSON document is needed.</p></article>
          </div>
        </section>

        <section className="section section--muted">
          <div className="page-width">
            <SectionHeading
              label="Where it fits"
              title="One tool, four operational moments."
              description="The interface stays small because the shell already provides composition, redirection, diffing, and automation."
            />
            <div className="use-case-grid">
              {useCases.map(([title, description], index) => (
                <article key={title}>
                  <span className="use-case-index">0{index + 1}</span>
                  <div><h3>{title}</h3><p>{description}</p></div>
                </article>
              ))}
            </div>
            <div className="pipeline-callout">
              <div>
                <p className="section-label">Composability</p>
                <h3>Use the tools already in your muscle memory.</h3>
                <p>Gronify reads stdin and writes stdout, so it can sit between curl, grep, sort, diff, and the rest of your shell workflow.</p>
              </div>
              <CodePanel label="A real pipeline">
                {`curl -s https://example.com/payload.json \\
  | gronify search --regex "metadata|status"`}
              </CodePanel>
            </div>
          </div>
        </section>

        <section id="commands" className="section page-width">
          <SectionHeading
            label="Command reference"
            title="A small surface area by design."
            description="Three commands cover the round trip. Global options control presentation; search options control matching."
          />
          <div className="command-list">
            {commands.map((command) => (
              <article key={command.name}>
                <div className="command-summary">
                  <code>{command.name}</code>
                  <div><h3>{command.signature}</h3><p>{command.description}</p></div>
                </div>
                <pre tabIndex={0}><code>{command.examples.join("\n")}</code></pre>
              </article>
            ))}
          </div>

          <div className="options-grid">
            <div>
              <h3>Global options</h3>
              <dl>
                <div><dt><code>--color</code></dt><dd>Enable color when supported</dd></div>
                <div><dt><code>--no-color</code></dt><dd>Force plain output</dd></div>
                <div><dt><code>--pretty</code></dt><dd>Add readable grouping</dd></div>
                <div><dt><code>-h, --help</code></dt><dd>Show command help</dd></div>
              </dl>
            </div>
            <div>
              <h3>Search options</h3>
              <dl>
                <div><dt><code>-r, --regex</code></dt><dd>Use extended regular expressions</dd></div>
                <div><dt><code>-c, --case-sensitive</code></dt><dd>Match exact letter case</dd></div>
                <div><dt><code>--count</code></dt><dd>Print only the match count</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section id="install" className="section install-section">
          <div className="page-width install-grid">
            <div className="install-copy">
              <p className="section-label">Installation</p>
              <h2>Install it your way.</h2>
              <p>Use Homebrew for the shortest path, download the latest release archive, or clone the repository to build the CLI from source.</p>
              <div className="requirements">
                <h3>Before you begin</h3>
                <ul>
                  <li><span>Node.js</span><strong>20 or newer</strong></li>
                  <li><span>External tools</span><strong>none required</strong></li>
                  <li><span>License</span><strong>MIT</strong></li>
                  <li><span>Current release</span><strong>v1.0.0</strong></li>
                </ul>
              </div>
            </div>
            <div className="install-steps">
              <CodePanel label="1 · Homebrew">
                {`brew install 1solomonwakhungu/tap/gronify
gronify --help`}
              </CodePanel>
              <CodePanel label="2 · Release archive">
                {`# Download the archive for your platform
https://github.com/1solomonwakhungu/gronify/releases`}
              </CodePanel>
              <CodePanel label="3 · Build from source">
                {`git clone https://github.com/1solomonwakhungu/gronify.git
cd gronify/src/packages/cli
npm ci
npm run build
npm link`}
              </CodePanel>
              <CodePanel label="4 · Verify the CLI">
                {`gronify --help
gronify flatten data.json`}
              </CodePanel>
            </div>
          </div>
        </section>

        <section className="section page-width troubleshooting">
          <SectionHeading
            label="Troubleshooting"
            title="Common setup questions, answered."
            description="The CLI delegates transformation and search to tools on your machine, so most setup issues are straightforward to isolate."
          />
          <div className="faq-list">
            <details>
              <summary><span>Does Gronify require fastgron or grep?</span><span aria-hidden="true">+</span></summary>
              <p>No. Flattening, unflattening, and search are built into the standalone CLI.</p>
            </details>
            <details>
              <summary><span>Can I use Gronify on Windows?</span><span aria-hidden="true">+</span></summary>
              <p>Use the release archive for your platform, Homebrew where supported, or build the TypeScript CLI from source with Node.js 20 or newer.</p>
            </details>
            <details>
              <summary><span>Why do the integration tests fail before assertions run?</span><span aria-hidden="true">+</span></summary>
              <p>Run <code>npm run build</code> first so <code>dist/index.js</code> exists before starting the integration tests.</p>
            </details>
            <details>
              <summary><span>Does Gronify send JSON to a service?</span><span aria-hidden="true">+</span></summary>
              <p>No. Gronify is local-first and processes data through the CLI tools installed on your machine.</p>
            </details>
          </div>
        </section>

        <section className="final-cta">
          <div className="page-width final-cta__inner">
            <div>
              <Mark />
              <h2>Stop tracing braces.<br />Start searching paths.</h2>
            </div>
            <div>
              <p>Inspect the source, report an issue, or build the CLI locally. Gronify is open source and MIT licensed.</p>
              <a className="button button--primary" href={repositoryUrl} target="_blank" rel="noreferrer">
                View the repository <ArrowIcon />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-inner">
          <a className="wordmark" href="#top"><Mark /><span>Gronify</span></a>
          <p>Local-first JSON inspection for the terminal.</p>
          <div>
            <a href={`${repositoryUrl}/issues`}>Issues</a>
            <a href={`${repositoryUrl}/security`}>Security</a>
            <a href={`${repositoryUrl}/blob/main/LICENSE`}>MIT License</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
