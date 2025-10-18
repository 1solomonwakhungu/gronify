import type { NormalizedData } from "./normalizeRecords.js";

export interface MarkdownOptions {
  includeHeader?: boolean;
  pretty?: boolean;
}

/**
 * Convert normalized data to Markdown table format
 */
export function toMarkdown(
  data: NormalizedData,
  options: MarkdownOptions = {}
): string {
  const { includeHeader = true, pretty = false } = options;

  if (data.headers.length === 0 || data.rows.length === 0) {
    return "";
  }

  const lines: string[] = [];

  // Calculate column widths for pretty formatting
  const columnWidths = pretty ? calculateColumnWidths(data) : {};

  // Format a row
  const formatRow = (values: string[]): string => {
    const formatted = values.map((value, i) => {
      const header = data.headers[i];
      if (pretty && header && columnWidths[header]) {
        return value.padEnd(columnWidths[header] ?? 0);
      }
      return value;
    });
    return `| ${formatted.join(" | ")} |`;
  };

  // Add header row
  if (includeHeader) {
    lines.push(formatRow(data.headers));

    // Add separator row
    const separators = data.headers.map((header) => {
      const width = pretty && columnWidths[header] ? columnWidths[header]! : 3;
      return "-".repeat(width);
    });
    lines.push(formatRow(separators));
  }

  // Add data rows
  for (const row of data.rows) {
    const values = data.headers.map((header) => {
      const value = row[header];
      return escapeMarkdownPipe(formatValue(value));
    });
    lines.push(formatRow(values));
  }

  return lines.join("\n");
}

/**
 * Escape pipe characters in markdown table cells
 */
function escapeMarkdownPipe(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/**
 * Format a value for markdown output
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

/**
 * Calculate column widths for pretty formatting
 */
function calculateColumnWidths(data: NormalizedData): Record<string, number> {
  const widths: Record<string, number> = {};

  for (const header of data.headers) {
    widths[header] = header.length;
  }

  for (const row of data.rows) {
    for (const header of data.headers) {
      const value = formatValue(row[header]);
      widths[header] = Math.max(widths[header] ?? 0, value.length);
    }
  }

  return widths;
}

