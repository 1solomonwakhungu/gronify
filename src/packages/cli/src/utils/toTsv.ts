import { toCsv, type CsvOptions } from "./toCsv.js";
import type { NormalizedData } from "./normalizeRecords.js";

export interface TsvOptions {
  includeHeader?: boolean;
}

/**
 * Convert normalized data to TSV format
 * TSV uses tabs as delimiters
 */
export function toTsv(data: NormalizedData, options: TsvOptions = {}): string {
  const csvOptions: CsvOptions = {
    delimiter: "\t",
    includeHeader: options.includeHeader ?? true,
  };

  return toCsv(data, csvOptions);
}

