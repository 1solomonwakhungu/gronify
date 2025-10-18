import type { NormalizedData } from "./normalizeRecords.js";

export interface CsvOptions {
  delimiter?: string;
  includeHeader?: boolean;
}

/**
 * Convert normalized data to CSV format
 * Implements RFC 4180 compliant CSV escaping
 */
export function toCsv(data: NormalizedData, options: CsvOptions = {}): string {
  const { delimiter = ",", includeHeader = true } = options;

  const lines: string[] = [];

  // Add header row
  if (includeHeader && data.headers.length > 0) {
    lines.push(data.headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter));
  }

  // Add data rows
  for (const row of data.rows) {
    const values = data.headers.map((header) => {
      const value = row[header];
      return escapeCsvField(formatValue(value), delimiter);
    });
    lines.push(values.join(delimiter));
  }

  return lines.join("\n");
}

/**
 * Escape a CSV field according to RFC 4180
 * Fields containing delimiter, quotes, or newlines must be quoted
 * Quotes within fields are escaped by doubling
 */
function escapeCsvField(field: string, delimiter: string): string {
  const needsQuoting =
    field.includes(delimiter) ||
    field.includes('"') ||
    field.includes("\n") ||
    field.includes("\r");

  if (!needsQuoting) {
    return field;
  }

  // Escape quotes by doubling them
  const escaped = field.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Format a value for CSV output
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

