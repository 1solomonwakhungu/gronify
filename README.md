<div align="center">
  <img src="branding/logo.svg" alt="Gronify Logo" width="200" height="200">
</div>


# Gronify# Gronify

Make big JSON easy to search, inspect, and diff — in your terminal and VS Code — powered by [fastgron](https://github.com/adamritter/fastgron).Make big JSON easy to search, inspect, and diff — in your terminal and VS Code — powered by [fastgron].

## Why## Why

Developers constantly poke at large or deeply nested JSON. Gronify flattens JSON into greppable “paths” (gron-style), lets you search/filter quickly, and round-trips back to JSON.

Developers constantly work with large or deeply nested JSON data. Gronify flattens JSON into greppable "paths" (gron-style), lets you search and filter quickly with powerful regex support, and round-trips back to JSON. All with beautiful colored output and Unix pipeline support.

## Features (MVP)

## Features- Flatten JSON → gron lines

- Unflatten back to JSON

- 🚀 **Fast JSON flattening** - Convert JSON to searchable gron format- Search/filter paths

- 🔄 **Reversible** - Convert gron back to JSON perfectly - VS Code command: “Gronify: Flatten JSON” (preview panel)

- 🔍 **Powerful search** - Regex patterns, case sensitivity, match counting

- 🎨 **Beautiful output** - Syntax highlighting and colored formatting## Install

- 📡 **Unix pipelines** - Full stdin/stdout support for composability

- 🧪 **Battle-tested** - Comprehensive test suite with 15+ test scenarios### Prereq: fastgron

- 🛠️ **Professional CLI** - Built with commander.js for robust argument handlingmacOS/Linux (Homebrew):

````bash

## Installationbrew install fastgron


### Prerequisites: fastgron

**macOS/Linux (Homebrew):**
```bash
brew install fastgron
````

**Or visit:** https://github.com/adamritter/fastgron for other installation methods.

### Install Gronify

```bash
# Clone and install
git clone https://github.com/yourusername/gronify.git
cd gronify/packages/cli
npm install
npm run build

# Make globally available
npm link
```

## Usage

### Basic Commands

**Flatten JSON to gron format:**

```bash
# From file
gronify flatten data.json

# From stdin
cat data.json | gronify flatten
echo '{"name":"Alice","age":30}' | gronify flatten
```

**Convert gron back to JSON:**

```bash
# From file
gronify unflatten data.gron

# From stdin
cat data.gron | gronify unflatten
gronify flatten data.json | gronify unflatten  # Round trip
```

**Search through JSON:**

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

### Output Formatting

**Colored output (auto-detected):**

```bash
gronify flatten data.json --color          # Force colors
gronify flatten data.json --no-color       # Disable colors
```

**Pretty formatting:**

```bash
gronify flatten data.json --pretty         # Enhanced readability
```

### Examples

**Example JSON:**

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

**Flattened output:**

```bash
$ gronify flatten example.json
json = {}
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
json.meta.page = 1
```

**Search examples:**

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

**Pipeline workflows:**

```bash
# Complex processing pipeline
cat data.json | \
  gronify flatten | \
  grep "user" | \
  grep -v "password" | \
  gronify unflatten

# Search and transform
curl -s api.json | gronify search "important" | head -10
```

## Command Reference

### Global Options

| Option          | Description              |
| --------------- | ------------------------ |
| `--color`       | Force colored output     |
| `--no-color`    | Disable colored output   |
| `--pretty`      | Enable pretty formatting |
| `-h, --help`    | Show help information    |
| `-V, --version` | Show version number      |

### Commands

#### `flatten [file]`

Convert JSON to gron format.

- **Arguments:** `[file]` - JSON file to flatten (optional, reads from stdin if not provided)
- **Examples:**
  ```bash
  gronify flatten data.json
  cat data.json | gronify flatten
  ```

#### `unflatten [file]`

Convert gron format back to JSON.

- **Arguments:** `[file]` - Gron file to unflatten (optional, reads from stdin if not provided)
- **Examples:**
  ```bash
  gronify unflatten data.gron
  cat data.gron | gronify unflatten
  ```

#### `search <file_or_term> [term]`

Search through flattened JSON paths.

- **Arguments:**
  - `<file_or_term>` - JSON file to search OR search term (if using stdin)
  - `[term]` - Search term or regex pattern (required if first arg is file)
- **Options:**
  - `-r, --regex` - Use regex pattern matching
  - `-c, --case-sensitive` - Case sensitive search
  - `--count` - Show only the count of matches
- **Examples:**
  ```bash
  gronify search data.json "user"
  gronify search data.json -r "user\\.\\w+"
  cat data.json | gronify search "name"
  gronify search data.json --count "field"
  ```

## Development

### Setup

```bash
cd packages/cli
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
packages/cli/
├── src/
│   ├── index.ts           # Main CLI entry point
│   ├── formatter.ts       # Output formatting and colors
│   └── index.d.ts         # Type definitions
├── __tests__/
│   └── cli.test.ts        # Comprehensive test suite
├── dist/                  # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## Roadmap

- [ ] **Native JSON querying** - Eliminate grep dependency for cross-platform support
- [ ] **Diff functionality** - Compare JSON files with colored diff output
- [ ] **VS Code extension** - Inline JSON manipulation and visualization
- [ ] **Performance optimization** - Streaming support for massive JSON files
- [ ] **Output formats** - YAML, CSV, and other export formats

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Run the test suite (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

- Built on top of [fastgron](https://github.com/adamritter/fastgron) for high-performance JSON flattening
- Inspired by the original [gron](https://github.com/tomnomnom/gron) tool
- Uses [commander.js](https://github.com/tj/commander.js) for professional CLI interface
- Colored output powered by [chalk](https://github.com/chalk/chalk)
