# Gronify for VS Code

> Transform JSON into a searchable, greppable format directly in your editor

Gronify is a professional VS Code extension that makes working with large, complex JSON files effortless. Convert JSON to "gron" format for easy searching, diffing, and understanding of nested structures.

![VS Code Extension Version](https://img.shields.io/badge/version-0.0.1-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0+-brightgreen)

## Features

### Flatten JSON to Gron
Transform complex nested JSON into a flat, line-by-line format that's easy to search and understand.

**Before (JSON):**
```json
{
  "users": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "address": {
        "street": "123 Main St",
        "city": "Boston"
      }
    }
  ]
}
```

**After (Gron):**
```
json = {}
json.users = []
json.users[0] = {}
json.users[0].id = 1
json.users[0].name = "John Doe"
json.users[0].email = "john@example.com"
json.users[0].address = {}
json.users[0].address.street = "123 Main St"
json.users[0].address.city = "Boston"
```

### Unflatten Gron to JSON
Convert gron format back to properly formatted JSON for editing and viewing.

### Search JSON with Regex
Powerful search functionality using regex patterns to find specific data in large JSON structures:
- Find all email fields: `.*email.*`
- Search user data: `users\[.*\]\.name`
- Locate configuration values: `config\..*\.enabled`

## Quick Start

### Installation
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Gronify"
4. Click Install

### Usage

#### Method 1: Right-Click Context Menu
1. Open any JSON file
2. Right-click in the editor
3. Select from Gronify options:
   - **Gronify: Flatten JSON to Gron**
   - **Gronify: Unflatten Gron to JSON**
   - **Gronify: Search JSON**

#### Method 2: Command Palette
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type "Gronify"
3. Select your desired command

#### Method 3: Selected Text
1. Select JSON text in any file
2. Right-click on selection
3. Choose appropriate Gronify command

## Use Cases

### Debugging API Responses
```bash
# Instead of scrolling through nested JSON
curl api.example.com/users | gronify flatten
# Now you can grep for specific fields
grep "email" flattened.gron
```

### Analyzing Configuration Files
- Quickly locate specific settings in large config files
- Compare configuration differences between environments
- Search for all instances of a particular setting

### Data Processing
- Extract specific fields from complex JSON structures
- Transform data for further processing
- Validate JSON structure and content

## Requirements

- **VS Code**: Version 1.104.0 or higher
- **Gronify CLI**: The extension integrates with the Gronify command-line tool
- **Operating System**: Windows, macOS, or Linux

## Commands

| Command | Description | Context Menu | Keyboard Shortcut |
|---------|-------------|--------------|-------------------|
| `gronify.flatten` | Convert JSON to Gron format | Available for JSON files | - |
| `gronify.unflatten` | Convert Gron to JSON format | Available for all files | - |
| `gronify.search` | Search JSON using regex | Available for JSON files | - |

## Configuration

This extension works out of the box with no configuration required. It automatically detects and integrates with your project's Gronify CLI installation.

## Known Issues

- Large JSON files (>10MB) may take longer to process
- Complex regex patterns in search may require escaping

## Release Notes

### 0.0.1 (Initial Release)
- JSON to Gron flattening
- Gron to JSON unflattening  
- Regex-powered JSON search
- Right-click context menu integration
- Command palette support
- Comprehensive error handling
- Input validation for JSON and Gron formats

## Contributing

Found a bug or have a feature request? 

- **Issues**: [GitHub Issues](https://github.com/1solomonwakhungu/gronify/issues)
- **Source Code**: [GitHub Repository](https://github.com/1solomonwakhungu/gronify)

## License

This extension is part of the Gronify project. See the [LICENSE](https://github.com/1solomonwakhungu/gronify/blob/main/LICENSE) file for details.

---

**Professional JSON processing tools for developers working with complex data structures.**