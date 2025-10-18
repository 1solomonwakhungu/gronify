<div align="center">
  <img src="branding/logo.svg" alt="Gronify Logo" width="200" height="200">
</div>

# Gronify

Make big JSON easy to search, inspect, and diff — in your terminal and VS Code — powered by [fastgron](https://github.com/adamritter/fastgron).

## Why Gronify?

Developers constantly work with large or deeply nested JSON data. Gronify flattens JSON into greppable "paths" (gron-style), lets you search and filter quickly with powerful regex support, and round-trips back to JSON. All with beautiful colored output and Unix pipeline support.

## Features

- **Fast JSON flattening** - Convert JSON to searchable gron format
- **Reversible** - Convert gron back to JSON perfectly
- **Powerful search** - Regex patterns, case sensitivity, match counting
- **Data extraction** - Transform JSON to CSV, TSV, Markdown, or custom templates with JMESPath queries
- **Beautiful output** - Syntax highlighting and colored formatting
- **Unix pipelines** - Full stdin/stdout support for composability
- **Battle-tested** - Comprehensive test suite
- **Professional CLI** - Built with commander.js for robust argument handling

## Installation

### Prerequisites: fastgron

**macOS/Linux (Homebrew):**
```bash
brew install fastgron
```

**Or visit:** https://github.com/adamritter/fastgron for other installation methods.

### Install Gronify

```bash
# Clone and install
git clone https://github.com/yourusername/gronify.git
cd src/packages/cli
npm install
npm run build

# Make globally available
npm link
```

Or install globally:
```bash
npm install -g gronify
```

## Commands

### `flatten` - Convert JSON to gron format

Flatten JSON into searchable line-by-line format.

```bash
# From file
gronify flatten data.json

# From stdin
cat data.json | gronify flatten
echo '{"name":"Alice","age":30}' | gronify flatten
```

**Options:**
- `--color` / `--no-color` - Enable/disable colored output (auto-detected)
- `--pretty` - Enable pretty formatting with indentation and grouping

**Example output:**
```
json = {}
json.users = []
json.users[0] = {}
json.users[0].name = "Alice"
json.users[0].email = "alice@example.com"
json.users[1] = {}
json.users[1].name = "Bob"
json.users[1].email = "bob@example.com"
```

### `unflatten` - Convert gron back to JSON

```bash
# From file
gronify unflatten data.gron

# From stdin
cat data.gron | gronify unflatten
gronify flatten data.json | gronify unflatten  # Round trip
```

### `search` - Search through JSON paths

Search through flattened JSON with powerful pattern matching.

```bash
# Search in file
gronify search data.json "user"
gronify search data.json "age"

# Search from stdin
cat data.json | gronify search "name"

# With regex patterns
gronify search data.json -r "user\\.\\w+"
cat data.json | gronify search -r "items\\[\\d+\\]"

# Case sensitive search
gronify search data.json -c "Name"

# Count matches only
gronify search data.json --count "user"
```

**Options:**
- `-r, --regex` - Use regex pattern matching
- `-c, --case-sensitive` - Case sensitive search (default: case-insensitive)
- `--count` - Show only the count of matches

### `extract` - Transform JSON to structured formats

**Extract and transform JSON data using powerful queries and output to multiple formats.**

> **Why Extract?**
> - Fastgron only outputs gron format
> - Transform nested JSON into spreadsheet-ready data (CSV/TSV)
> - Generate markdown tables for documentation
> - Create custom formatted output with templates

```bash
gronify extract [input] -p <path-expression> [options]
```

**Required Options:**
- `-p, --paths <expr>` - JMESPath expression to extract data

**Format Options:**
- `-f, --format <type>` - Output format: `csv`, `tsv`, `markdown`, `template` (default: `csv`)
- `-t, --template <string>` - Handlebars template string (required for `template` format)
- `--template-file <path>` - Read template from file

**Output Options:**
- `--header` / `--no-header` - Include/exclude header row (default: include)
- `-o, --output <file>` - Write output to file (default: stdout)
- `--column <name>` - Column name for primitive values (default: `value`)
- `--delimiter <char>` - CSV delimiter character (auto-set to tab for TSV)
- `--pretty` - Pretty-align markdown tables
- `--quiet` - Suppress non-fatal warnings
- `--strict` - Error on missing fields instead of using empty string

#### Path Syntax (JMESPath)

Gronify uses [JMESPath](https://jmespath.org/) for powerful querying:

- **Select array elements**: `users[*]`
- **Project specific fields**: `users[*].{name: name, email: email}`
- **Shorthand projection**: `users[*].{name,email}`
- **Functions**: `users[*].{name, skills: join(',', skills)}`
- **Nested queries**: `departments[*].employees[*].{name, title: position.title}`
- **Filtering**: `users[?age > \`25\`].{name,age}`

Learn more at [jmespath.org](https://jmespath.org/).

#### Extract Examples

**CSV Format:**

```bash
# Extract user names and emails
gronify extract data.json -p "users[*].{name,email}" -f csv

# Output:
# name,email
# Alice,alice@example.com
# Bob,bob@example.com

# Extract without header
gronify extract data.json -p "users[*].{name,email}" -f csv --no-header
```

**TSV Format:**

```bash
# Tab-separated values
gronify extract data.json -p "items[*].{id,price,currency}" -f tsv

# Output:
# id	price	currency
# 1	99.99	USD
# 2	149.99	EUR
```

**Markdown Format:**

```bash
# Generate markdown table
gronify extract data.json -p "orders[*].{id,status,total}" -f markdown

# Output:
# | id | status | total |
# | --- | --- | --- |
# | 1 | completed | 299.99 |
# | 2 | pending | 149.99 |

# Pretty-aligned markdown table
gronify extract data.json -p "orders[*].{id,status}" -f markdown --pretty
```

**Template Format:**

```bash
# Custom line-by-line formatting
gronify extract data.json -p "users[*]" -f template -t "{{name}}: {{email}}"

# Output:
# Alice: alice@example.com
# Bob: bob@example.com

# Template with conditionals
gronify extract data.json -p "users[*]" \
  -f template \
  -t "- **{{name}}**{{#if age}} ({{age}}){{/if}}"

# Template from file
gronify extract data.json -p "users[*]" -f template --template-file report.hbs
```

**JMESPath Functions:**

```bash
# Join array values
gronify extract data.json \
  -p "users[*].{name, skills: join(', ', skills)}" \
  -f csv

# Extract from deeply nested structures
gronify extract company.json \
  -p "departments[*].employees[*].{name, title: position.title, salary: position.salary}" \
  -f csv
```

**Read from stdin and write to file:**

```bash
cat data.json | gronify extract -p "users[*].{name,email}" -f csv

curl https://api.example.com/data | gronify extract -p "results[*].{id,title}" -f markdown

gronify extract data.json -p "users[*]" -f csv -o output.csv
```

#### Data Normalization

The extract command automatically normalizes data for tabular output:

1. **Union of keys**: Headers include all unique keys from all rows
2. **Missing fields**: Empty string (or error with `--strict`)
3. **Nested objects**: Flattened with dot notation (e.g., `meta.city`)
4. **Arrays in values**: JSON-stringified (e.g., `["Go","Node"]`)
5. **Template format**: Nested objects preserved for template access

## Usage Examples

### Example JSON

```json
{
  "users": [
    { "name": "Alice", "age": 30, "active": true },
    { "name": "Bob", "age": 25, "active": false }
  ],
  "meta": {
    "total": 2,
    "page": 1
  }
}
```

### Search Examples

```bash
# Find all user names
$ gronify search example.json "name"
json.users[0].name = "Alice"
json.users[1].name = "Bob"

# Find active users
$ gronify search example.json "active.*true"
json.users[0].active = true

# Count total fields
$ gronify search example.json --count ".*"
11
```

### Pipeline Workflows

```bash
# Complex processing pipeline
cat data.json | \
  gronify flatten | \
  grep "user" | \
  grep -v "password" | \
  gronify unflatten

# Search and transform
curl -s api.json | gronify search "important" | head -10

# Extract and process
curl https://api.example.com/users | \
  gronify extract -p "users[*].{name,email}" -f csv | \
  csvtool drop 1 - | \
  while IFS=, read name email; do
    echo "Processing $name..."
  done
```

## Use Cases

### Exploring Large JSON Files

```bash
# Flatten and search
gronify flatten large-data.json | grep "error"

# Extract specific data
gronify extract large-data.json -p "logs[?level=='ERROR']" -f csv
```

### Comparing JSON Files

```bash
# Flatten both files and diff
diff <(gronify flatten file1.json) <(gronify flatten file2.json)
```

### Generating Reports

```bash
# Extract to CSV for spreadsheet analysis
gronify extract api-response.json -p "results[*].{id,name,status}" -f csv -o report.csv

# Generate markdown documentation
gronify extract data.json -p "endpoints[*]" -f markdown > API.md
```

## Global Options

All commands support:

| Option          | Description              |
| --------------- | ------------------------ |
| `--color`       | Force colored output     |
| `--no-color`    | Disable colored output   |
| `--pretty`      | Enable pretty formatting |
| `-h, --help`    | Show help information    |
| `-V, --version` | Show version number      |

**Environment Variables:**
- `NO_COLOR` - Set to any value to disable colored output

## Development

### Setup

```bash
cd src/packages/cli
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
```

### Project Structure

```
src/packages/cli/
├── src/
│   ├── index.ts              # Main CLI entry point
│   ├── formatter.ts          # Output formatting and colors
│   ├── commands/
│   │   └── extract.ts        # Extract command implementation
│   └── utils/
│       ├── readJson.ts       # JSON reading utilities
│       ├── normalizeRecords.ts
│       ├── flatten.ts
│       ├── toCsv.ts
│       ├── toTsv.ts
│       ├── toMarkdown.ts
│       └── toTemplate.ts
├── __tests__/
│   ├── cli.test.ts           # CLI tests
│   ├── formatters.test.ts    # Formatter unit tests
│   ├── extract.cli.test.ts   # Extract command tests
│   └── fixtures/             # Test fixtures
├── dist/                     # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Run the test suite (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

ISC License - see [LICENSE](LICENSE) file for details.

## Credits

- Built on top of [fastgron](https://github.com/adamritter/fastgron) for high-performance JSON flattening
- Inspired by the original [gron](https://github.com/tomnomnom/gron) tool
- Uses [commander.js](https://github.com/tj/commander.js) for professional CLI interface
- Colored output powered by [chalk](https://github.com/chalk/chalk)
- JMESPath querying via [jmespath](https://www.npmjs.com/package/jmespath)
- Template rendering with [Handlebars](https://handlebarsjs.com/)
