const CodeBlock = ({ children, title }: { children: string; title?: string }) => (
  <div className="bg-gray-900 rounded-lg overflow-hidden">
    {title && (
      <div className="bg-gray-800 px-4 py-2 text-sm text-gray-300">
        {title}
      </div>
    )}
    <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
      <code>{children}</code>
    </pre>
  </div>
);

const FeatureCard = ({ icon, title, description }: { icon: string; title: string; description: string }) => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
    <div className="text-2xl mb-3">{icon}</div>
    <h3 className="text-lg font-semibold mb-2">{title}</h3>
    <p className="text-gray-600 dark:text-gray-300">{description}</p>
  </div>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation */}
      <nav className="sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gronify</h1>
            </div>
            <div className="flex items-center gap-4">
              <a href="#features" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Features
              </a>
              <a href="#examples" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Examples
              </a>
              <a href="#install" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Install
              </a>
              <a
                href="https://github.com/1solomonwakhungu/gronify"
                className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-6">
              Your powerful tool for
              <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                effortless JSON exploration
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
              Make big JSON easy to search, inspect, and diff — in your terminal and VS Code — powered by fastgron.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#install"
                className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-8 py-4 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors inline-flex items-center justify-center"
              >
                Get Started
              </a>
              <a
                href="#examples"
                className="border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white px-8 py-4 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors inline-flex items-center justify-center"
              >
                View Examples
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              JSON Processing, Simplified
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Developers constantly work with large or deeply nested JSON data. Gronify makes it greppable, searchable, and manageable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon="🚀"
              title="Fast JSON Flattening"
              description="Convert JSON to searchable gron format with lightning speed using fastgron under the hood."
            />
            <FeatureCard
              icon="🔄"
              title="Reversible Operations"
              description="Convert gron back to JSON perfectly. Round-trip your data without loss."
            />
            <FeatureCard
              icon="🔍"
              title="Powerful Search"
              description="Regex patterns, case sensitivity, match counting. Find exactly what you need."
            />
            <FeatureCard
              icon="🎨"
              title="Beautiful Output"
              description="Syntax highlighting and colored formatting make complex data readable."
            />
            <FeatureCard
              icon="📡"
              title="Unix Pipelines"
              description="Full stdin/stdout support for composability with your favorite tools."
            />
            <FeatureCard
              icon="🛠️"
              title="Professional CLI"
              description="Built with commander.js for robust argument handling and user experience."
            />
          </div>
        </div>
      </section>

      {/* Examples Section */}
      <section id="examples" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              See Gronify in Action
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Transform complex JSON into searchable, greppable paths
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            <div>
              <h3 className="text-xl font-semibold mb-4">Input JSON</h3>
              <CodeBlock title="example.json">
                {`{
  "users": [
    { "name": "Alice", "age": 30, "active": true },
    { "name": "Bob", "age": 25, "active": false }
  ],
  "meta": {
    "total": 2,
    "page": 1
  }
}`}
              </CodeBlock>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Flattened Output</h3>
              <CodeBlock title="$ gronify flatten example.json">
                {`json = {}
json.users = []
json.users[0] = {}
json.users[0].name = "Alice"
json.users[0].age = 30
json.users[0].active = true
json.users[1] = {}
json.users[1].name = "Bob"
json.users[1].age = 25
json.users[1].active = false
json.meta = {}
json.meta.total = 2
json.meta.page = 1`}
              </CodeBlock>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">Search Users</h3>
              <CodeBlock title="$ gronify search example.json 'name'">
                {`json.users[0].name = "Alice"
json.users[1].name = "Bob"`}
              </CodeBlock>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Pipeline Processing</h3>
              <CodeBlock title="$ cat data.json | gronify flatten | grep user">
                {`json.users = []
json.users[0] = {}
json.users[0].name = "Alice"
json.users[1] = {}`}
              </CodeBlock>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Round Trip</h3>
              <CodeBlock title="$ gronify flatten data.json | gronify unflatten">
                {`{
  "users": [...],
  "meta": {...}
}`}
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section id="install" className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Install fastgron and Gronify to start exploring JSON like never before
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-4">1. Install fastgron</h3>
                <CodeBlock>
                  {`# macOS/Linux (Homebrew)
brew install fastgron

# Or visit:
# https://github.com/adamritter/fastgron`}
                </CodeBlock>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">2. Install Gronify</h3>
                <CodeBlock>
                  {`# Clone and install
git clone https://github.com/1solomonwakhungu/gronify.git
cd src/packages/cli
npm install && npm run build
npm link`}
                </CodeBlock>
              </div>
            </div>

            <div className="mt-12">
              <h3 className="text-xl font-semibold mb-4 text-center">Start Using Gronify</h3>
              <CodeBlock>
                {`# Flatten JSON
gronify flatten data.json

# Search through JSON
gronify search data.json "user"

# Use with pipes
cat data.json | gronify flatten | grep "name"`}
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      {/* Command Reference Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Command Everything
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Powerful commands for every JSON processing need
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-3">Flatten JSON</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Convert JSON to gron format</p>
              <CodeBlock>
                {`gronify flatten data.json
cat data.json | gronify flatten`}
              </CodeBlock>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-3">Search & Filter</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Find patterns with regex support</p>
              <CodeBlock>
                {`gronify search data.json "user"
gronify search -r "user\\.\\w+"`}
              </CodeBlock>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-3">Unflatten</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Convert gron back to JSON</p>
              <CodeBlock>
                {`gronify unflatten data.gron
cat data.gron | gronify unflatten`}
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-900 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Streamline your JSON workflow today
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Imagine your JSON workflow, just smoother and more powerful. That&apos;s the developer experience Gronify is built to deliver.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/1solomonwakhungu/gronify"
              className="bg-white text-gray-900 px-8 py-4 rounded-lg font-semibold hover:bg-gray-200 transition-colors inline-flex items-center justify-center"
            >
              Get Started on GitHub
            </a>
            <a
              href="#examples"
              className="border border-gray-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-gray-800 transition-colors inline-flex items-center justify-center"
            >
              View More Examples
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Gronify</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Make big JSON easy to search, inspect, and diff. Transform complex nested data into greppable paths for faster development workflows.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Resources</h4>
              <ul className="space-y-2">
                <li><a href="https://github.com/1solomonwakhungu/gronify" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Documentation</a></li>
                <li><a href="#examples" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Examples</a></li>
                <li><a href="#install" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">CLI Reference</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Community</h4>
              <ul className="space-y-2">
                <li><a href="https://github.com/1solomonwakhungu/gronify" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">GitHub</a></li>
                <li><a href="https://github.com/1solomonwakhungu/gronify/issues" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Issues</a></li>
                <li><a href="https://github.com/1solomonwakhungu/gronify/discussions" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Discussions</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 mt-8 pt-8 text-center">
            <p className="text-gray-600 dark:text-gray-300">
              © {new Date().getFullYear() === 2025 ? '2025' : `2025-${new Date().getFullYear()}`} Gronify. Built with ❤️ for developers who love JSON.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
