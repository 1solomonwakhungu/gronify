import { flatten } from "./flatten.js";

export interface NormalizeOptions {
  strict?: boolean;
  columnName?: string;
  flattenNested?: boolean;
}

export interface NormalizedData {
  headers: string[];
  rows: Array<Record<string, any>>;
}

/**
 * Normalize JMESPath query results into a consistent format
 * @param data - Result from JMESPath query
 * @param options - Normalization options
 * @returns Normalized data with headers and rows
 */
export function normalizeRecords(
  data: any,
  options: NormalizeOptions = {}
): NormalizedData {
  const { strict = false, columnName = "value", flattenNested = true } = options;

  // Handle null/undefined
  if (data === null || data === undefined) {
    return { headers: [columnName], rows: [{ [columnName]: data }] };
  }

  // Handle primitives
  if (typeof data !== "object") {
    return { headers: [columnName], rows: [{ [columnName]: data }] };
  }

  // Handle array of primitives
  if (Array.isArray(data) && data.length > 0 && typeof data[0] !== "object") {
    return {
      headers: [columnName],
      rows: data.map((value) => ({ [columnName]: value })),
    };
  }

  // Handle empty array
  if (Array.isArray(data) && data.length === 0) {
    return { headers: [], rows: [] };
  }

  // Handle array of objects
  if (Array.isArray(data)) {
    const processedRows = flattenNested
      ? data.map((item) => {
          if (typeof item === "object" && !Array.isArray(item)) {
            return flatten(item);
          }
          return { [columnName]: item };
        })
      : data.map((item) => {
          if (typeof item === "object" && !Array.isArray(item)) {
            // Don't flatten, but stringify nested arrays
            const result: Record<string, any> = {};
            for (const [key, value] of Object.entries(item)) {
              if (Array.isArray(value)) {
                result[key] = JSON.stringify(value);
              } else if (typeof value === "object" && value !== null) {
                result[key] = JSON.stringify(value);
              } else {
                result[key] = value;
              }
            }
            return result;
          }
          return { [columnName]: item };
        });

    // Derive headers as union of keys across all rows (stable order)
    const headers = deriveHeaders(processedRows);

    // Normalize rows to include all headers
    const normalizedRows = processedRows.map((row) => {
      const normalizedRow: Record<string, any> = {};
      for (const header of headers) {
        if (header in row) {
          normalizedRow[header] = row[header];
        } else {
          if (strict) {
            throw new Error(`Missing field '${header}' in row`);
          }
          normalizedRow[header] = "";
        }
      }
      return normalizedRow;
    });

    return { headers, rows: normalizedRows };
  }

  // Handle single object
  const processedObj = flattenNested ? flatten(data) : data;
  const headers = Object.keys(processedObj);
  return { headers, rows: [processedObj] };
}

/**
 * Derive headers from an array of objects
 * Maintains stable order: keys from first row, then new keys as encountered
 */
function deriveHeaders(rows: Array<Record<string, any>>): string[] {
  if (rows.length === 0) {
    return [];
  }

  const headersSet = new Set<string>();
  const headersOrder: string[] = [];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headersSet.has(key)) {
        headersSet.add(key);
        headersOrder.push(key);
      }
    }
  }

  return headersOrder;
}

