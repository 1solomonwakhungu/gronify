import chalk from "chalk";

export interface FormatOptions {
  color?: boolean;
  pretty?: boolean;
  format?: 'gron' | 'json' | 'minimal';
}

export class OutputFormatter {
  private options: FormatOptions;

  constructor(options: FormatOptions = {}) {
    this.options = {
      color: true, // Default to color if terminal supports it
      pretty: false,
      format: 'gron',
      ...options
    };

    // Auto-detect if NO_COLOR is set or if not in a TTY
    if (process.env.NO_COLOR || !process.stdout.isTTY) {
      this.options.color = false;
    }
  }

  /**
   * Format gron output with syntax highlighting
   */
  formatGron(gronOutput: string): string {
    const lines = gronOutput.split('\n').filter(line => line.trim());
    let formattedLines = lines;

    // Apply color formatting first (on clean lines)
    if (this.options.color) {
      formattedLines = formattedLines.map(line => this.colorizeGronLine(line));
    }

    // Then apply pretty formatting (which adds indentation)
    if (this.options.pretty) {
      formattedLines = this.applyPrettyFormattingToColoredLines(formattedLines);
    }

    return formattedLines.join('\n');
  }

  /**
   * Format JSON output with syntax highlighting
   */
  formatJson(jsonOutput: string): string {
    let formatted = jsonOutput;

    // Apply pretty formatting if enabled (parse and re-stringify with indentation)
    if (this.options.pretty) {
      try {
        const parsed = JSON.parse(jsonOutput);
        formatted = JSON.stringify(parsed, null, 2); // 2-space indentation
      } catch {
        // If parsing fails, use original
        formatted = jsonOutput;
      }
    }

    // Apply color formatting if enabled
    if (!this.options.color) {
      return formatted;
    }

    // Enhanced JSON syntax highlighting
    return formatted
      .replace(/"([^"]+)":/g, chalk.blue('"$1"') + chalk.gray(':'))
      .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"'))
      .replace(/: (\d+)/g, ': ' + chalk.yellow('$1'))
      .replace(/: (true|false)/g, ': ' + chalk.magenta('$1'))
      .replace(/: (null)/g, ': ' + chalk.gray('$1'))
      .replace(/({|})/g, chalk.gray('$1'))
      .replace(/(\[|\])/g, chalk.gray('$1'));
  }

  /**
   * Format search results with highlighting
   */
  formatSearchResults(results: string, searchTerm: string): string {
    if (!this.options.color) {
      return results;
    }

    // Highlight the search term in results
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    
    return results
      .split('\n')
      .map(line => {
        // First colorize the gron syntax
        const coloredLine = this.colorizeGronLine(line);
        // Then highlight the search term
        return coloredLine.replace(regex, chalk.bgYellow.black('$1'));
      })
      .join('\n');
  }

  /**
   * Format error messages
   */
  formatError(message: string): string {
    if (!this.options.color) {
      return `Error: ${message}`;
    }
    return chalk.red('Error: ') + message;
  }

  /**
   * Format warning messages
   */
  formatWarning(message: string): string {
    if (!this.options.color) {
      return `Warning: ${message}`;
    }
    return chalk.yellow('Warning: ') + message;
  }

  /**
   * Format success messages
   */
  formatSuccess(message: string): string {
    if (!this.options.color) {
      return message;
    }
    return chalk.green(message);
  }

  /**
   * Format info messages
   */
  formatInfo(message: string): string {
    if (!this.options.color) {
      return message;
    }
    return chalk.cyan(message);
  }

  /**
   * Colorize a single gron line
   */
  private colorizeGronLine(line: string): string {
    if (!line.trim()) return line;

    // Match gron syntax: json.path = value
    const gronMatch = line.match(/^(json(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[[^\]]+\])*)\s*=\s*(.+)$/);
    
    if (gronMatch && gronMatch[1] && gronMatch[2]) {
      const [, path, value] = gronMatch;
      const coloredPath = this.colorizeGronPath(path);
      const coloredValue = this.colorizeGronValue(value);
      return `${coloredPath} ${chalk.gray('=')} ${coloredValue}`;
    }

    return line;
  }

  /**
   * Colorize gron path (json.user.name)
   */
  private colorizeGronPath(path: string): string {
    return path
      .replace(/^json/, chalk.blue('json'))
      .replace(/\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, chalk.gray('.') + chalk.cyan('$1'))
      .replace(/\[(\d+)\]/g, chalk.gray('[') + chalk.yellow('$1') + chalk.gray(']'))
      .replace(/\["([^"]+)"\]/g, chalk.gray('[') + chalk.green('"$1"') + chalk.gray(']'));
  }

  /**
   * Colorize gron values
   */
  private colorizeGronValue(value: string): string {
    const trimmed = value.trim();
    
    // String values
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return chalk.green(trimmed);
    }
    
    // Numbers
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return chalk.yellow(trimmed);
    }
    
    // Booleans
    if (trimmed === 'true' || trimmed === 'false') {
      return chalk.magenta(trimmed);
    }
    
    // null
    if (trimmed === 'null') {
      return chalk.gray(trimmed);
    }
    
    // Arrays and objects
    if (trimmed === '{}' || trimmed === '[]') {
      return chalk.gray(trimmed);
    }
    
    return trimmed;
  }

  /**
   * Apply pretty formatting with indentation and grouping
   */
  private applyPrettyFormatting(lines: string[]): string[] {
    const result: string[] = [];
    let lastTopLevel = '';

    lines.forEach((line, index) => {
      // Calculate indentation based on nesting level
      const nestingLevel = Math.max(0, (line.match(/\[/g) || []).length + (line.match(/\./g) || []).length - 1);
      const indent = '  '.repeat(Math.min(nestingLevel, 6)); // Max 6 levels
      
      // Extract top-level object (e.g., "users" from "json.users[0].name")
      const topLevelMatch = line.match(/^json\.([^\[.]+)/);
      const currentTopLevel = topLevelMatch ? topLevelMatch[1] : 'root';
      
      // Add spacing between different top-level objects
      if (index > 0 && currentTopLevel !== lastTopLevel && lastTopLevel !== 'root') {
        result.push('');
      }
      
      result.push(indent + line);
      lastTopLevel = currentTopLevel || 'root';
    });

    return result;
  }

  /**
   * Apply pretty formatting to already colored lines
   */
  private applyPrettyFormattingToColoredLines(lines: string[]): string[] {
    const result: string[] = [];
    let lastTopLevel = '';

    lines.forEach((line, index) => {
      // Strip ANSI codes to analyze the original line structure
      const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '');
      
      // Calculate indentation based on nesting level
      const nestingLevel = Math.max(0, (cleanLine.match(/\[/g) || []).length + (cleanLine.match(/\./g) || []).length - 1);
      const indent = '  '.repeat(Math.min(nestingLevel, 6)); // Max 6 levels
      
      // Extract top-level object (e.g., "users" from "json.users[0].name")
      const topLevelMatch = cleanLine.match(/^json\.([^\[.]+)/);
      const currentTopLevel = topLevelMatch ? topLevelMatch[1] : 'root';
      
      // Add spacing between different top-level objects
      if (index > 0 && currentTopLevel !== lastTopLevel && lastTopLevel !== 'root') {
        result.push('');
      }
      
      result.push(indent + line);
      lastTopLevel = currentTopLevel || 'root';
    });

    return result;
  }
}

/**
 * Create a formatter with auto-detected options
 */
export function createFormatter(options: Partial<FormatOptions> = {}): OutputFormatter {
  return new OutputFormatter(options);
}

/**
 * Quick utility to check if colors should be enabled
 */
export function shouldUseColor(): boolean {
  // Don't use colors if NO_COLOR is set
  if (process.env.NO_COLOR) {
    return false;
  }
  
  // Don't use colors if not in a TTY
  if (!process.stdout.isTTY) {
    return false;
  }
  
  // Don't use colors if stdin is being piped (more conservative approach)
  if (!process.stdin.isTTY) {
    return false;
  }
  
  return true;
}