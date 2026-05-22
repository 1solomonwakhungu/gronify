const CodeBlock = ({
  children,
  title,
}: {
  children: string;
  title?: string;
}) => (
  <div className="overflow-hidden rounded-lg bg-gray-900">
    {title && (
      <div className="bg-gray-800 px-4 py-2 text-sm text-gray-300">{title}</div>
    )}
    <pre className="overflow-x-auto p-4 text-sm text-gray-100">
      <code>{children}</code>
    </pre>
  </div>
);

const FeatureCard = ({
  marker,
  title,
  description,
}: {
  marker: string;
  title: string;
  description: string;
}) => (
  <div className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
    <div className="mb-3 font-mono text-2xl text-blue-600 dark:text-blue-300">
      {marker}
    </div>
    <h3 className="mb-2 text-lg font-semibold">{title}</h3>
    <p className="text-gray-600 dark:text-gray-300">{description}</p>
  </div>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Gronify
            </h1>
            <div className="flex items-center gap-4">
              <a
                href="#features"
                className="text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Features
              </a>
              <a
                href="#examples"
                className="text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Examples
              </a>
              <a
                href="#install"
                className="text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Install
              </a>
              <a
                href="https://github.com/1solomonwakhungu/gronify"
                className="rounded-lg bg-gray-900 px-4 py-2 text-white transition-colors hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </nav>

      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="mb-6 text-4xl font-bold text-gray-900 sm:text-6xl lg:text-7xl dark:text-white">
              Terminal JSON inspection
              <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                powered by fastgron
              </span>
            </h1>
            <p className="mx-auto mb-8 max-w-3xl text-xl text-gray-600 sm:text-2xl dark:text-gray-300">
              Turn large JSON payloads into greppable paths for debugging
              service responses, generated config, CI artifacts, and support
              bundles.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <a
                href="#install"
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-8 py-4 font-semibold text-white transition-colors hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Get Started
              </a>
              <a
                href="#examples"
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-8 py-4 font-semibold text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-800"
              >
                View Examples
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-gray-50 py-20 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white">
              Focused JSON Workflows
            </h2>
            <p className="mx-auto max-w-2xl text-xl text-gray-600 dark:text-gray-300">
              Gronify keeps JSON inspection close to the terminal, where
              platform and developer tooling teams already triage operational
              data.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              marker="{}"
              title="Flatten JSON"
              description="Convert JSON to searchable gron-style assignments."
            />
            <FeatureCard
              marker="<>"
              title="Round Trip"
              description="Convert gron output back to JSON through fastgron unflattening."
            />
            <FeatureCard
              marker="/"
              title="Search Paths"
              description="Use plain text, extended regex, case-sensitive matching, and match counts."
            />
            <FeatureCard
              marker="Aa"
              title="Readable Output"
              description="Optional colors and pretty indentation make nested data easier to scan."
            />
            <FeatureCard
              marker="|"
              title="Pipelines"
              description="Stdin and stdout support keeps Gronify composable with shell workflows."
            />
            <FeatureCard
              marker="$"
              title="Scriptable CLI"
              description="Commander.js provides predictable command parsing and help output."
            />
          </div>
        </div>
      </section>

      <section id="examples" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white">
              See Gronify in Action
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Transform nested JSON into searchable, greppable paths.
            </p>
          </div>

          <div className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-4 text-xl font-semibold">Input JSON</h3>
              <CodeBlock title="example.json">
                {`{
  "service": {
    "name": "checkout",
    "status": "degraded"
  },
  "deployments": [
    { "region": "us-central1", "version": "2026.05.22" }
  ]
}`}
              </CodeBlock>
            </div>
            <div>
              <h3 className="mb-4 text-xl font-semibold">Flattened Output</h3>
              <CodeBlock title="$ gronify flatten example.json">
                {`json = {}
json.deployments = []
json.deployments[0] = {}
json.deployments[0].region = "us-central1"
json.deployments[0].version = "2026.05.22"
json.service = {}
json.service.name = "checkout"
json.service.status = "degraded"`}
              </CodeBlock>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div>
              <h3 className="mb-4 text-xl font-semibold">Search Status</h3>
              <CodeBlock title="$ gronify search example.json 'status'">
                {`json.service.status = "degraded"`}
              </CodeBlock>
            </div>
            <div>
              <h3 className="mb-4 text-xl font-semibold">
                Pipeline Processing
              </h3>
              <CodeBlock title="$ cat data.json | gronify flatten | grep service">
                {`json.service = {}
json.service.name = "checkout"`}
              </CodeBlock>
            </div>
            <div>
              <h3 className="mb-4 text-xl font-semibold">Round Trip</h3>
              <CodeBlock title="$ gronify flatten data.json | gronify unflatten">
                {`{
  "service": {
    "name": "checkout"
  }
}`}
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      <section id="install" className="bg-gray-50 py-20 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white">
              Build Locally from Source
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Install fastgron, then build and link the CLI locally.
            </p>
          </div>

          <div className="mx-auto max-w-4xl">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-4 text-xl font-semibold">
                  1. Install fastgron
                </h3>
                <CodeBlock>
                  {`# macOS/Linux (Homebrew)
brew install fastgron

# Other install methods:
# https://github.com/adamritter/fastgron`}
                </CodeBlock>
              </div>
              <div>
                <h3 className="mb-4 text-xl font-semibold">
                  2. Install Gronify
                </h3>
                <CodeBlock>
                  {`git clone https://github.com/1solomonwakhungu/gronify.git
cd gronify/src/packages/cli
npm ci
npm run build
npm link`}
                </CodeBlock>
              </div>
            </div>

            <div className="mt-12">
              <h3 className="mb-4 text-center text-xl font-semibold">
                Run a Command
              </h3>
              <CodeBlock>
                {`gronify flatten data.json
gronify search data.json "service"
cat data.json | gronify flatten | grep "name"`}
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white">
              Command Reference
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Focused commands for flattening, searching, and unflattening JSON.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-lg font-semibold">Flatten JSON</h3>
              <p className="mb-4 text-gray-600 dark:text-gray-300">
                Convert JSON to gron format.
              </p>
              <CodeBlock>{`gronify flatten data.json
cat data.json | gronify flatten`}</CodeBlock>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-lg font-semibold">Search Paths</h3>
              <p className="mb-4 text-gray-600 dark:text-gray-300">
                Find patterns with plain text or regex.
              </p>
              <CodeBlock>{`gronify search data.json "user"
gronify search data.json --regex "user\\.\\w+"`}</CodeBlock>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-lg font-semibold">Unflatten</h3>
              <p className="mb-4 text-gray-600 dark:text-gray-300">
                Convert gron back to JSON.
              </p>
              <CodeBlock>{`gronify unflatten data.gron
cat data.gron | gronify unflatten`}</CodeBlock>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-900 py-20 dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
            Inspect JSON where your team already works
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-gray-300">
            Gronify keeps JSON inspection close to terminals, logs, and support
            workflows.
          </p>
          <a
            href="https://github.com/1solomonwakhungu/gronify"
            className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-4 font-semibold text-gray-900 transition-colors hover:bg-gray-200"
          >
            View on GitHub
          </a>
        </div>
      </section>

      <footer className="bg-gray-50 py-12 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Gronify
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Terminal-first JSON inspection for developer tooling and
                platform support workflows.
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                Resources
              </h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://github.com/1solomonwakhungu/gronify"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  >
                    Documentation
                  </a>
                </li>
                <li>
                  <a
                    href="#examples"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  >
                    Examples
                  </a>
                </li>
                <li>
                  <a
                    href="#install"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  >
                    Install
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                Project
              </h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://github.com/1solomonwakhungu/gronify/issues"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  >
                    Issues
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/1solomonwakhungu/gronify/security"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  >
                    Security
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-8 text-center dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-300">
              Copyright{" "}
              {new Date().getFullYear() === 2026
                ? "2026"
                : `2026-${new Date().getFullYear()}`}{" "}
              Gronify. MIT licensed.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
