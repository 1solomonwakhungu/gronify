import { detectFormat, mergeFormats, type StringFormat } from "./detectFormat.js";

export interface TypeStats {
  types: Set<string>; // "string", "number", "integer", "boolean", "null", "object", "array"
  isInteger?: boolean; // For numbers
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueValues?: Set<any>; // For enum detection
  formats?: Set<StringFormat>; // For string format detection
  examples?: any[];
  objectKeys?: Map<string, TypeStats>; // For objects
  arrayItems?: TypeStats; // For arrays (merged)
  presenceCount?: number; // How many times this field appeared
}

/**
 * Create a new TypeStats object
 */
export function createStats(): TypeStats {
  return {
    types: new Set(),
    uniqueValues: new Set(),
    formats: new Set(),
    examples: [],
    presenceCount: 0,
  };
}

/**
 * Collect statistics from a value
 */
export function collectValueStats(
  value: any,
  stats: TypeStats,
  opts: { maxUniqueValues?: number; maxExamples?: number } = {}
): void {
  const { maxUniqueValues = 50, maxExamples = 3 } = opts;

  if (value === null) {
    stats.types.add("null");
    if (stats.uniqueValues && stats.uniqueValues.size < maxUniqueValues) {
      stats.uniqueValues.add(null);
    }
    return;
  }

  const type = typeof value;

  if (type === "boolean") {
    stats.types.add("boolean");
    if (stats.uniqueValues && stats.uniqueValues.size < maxUniqueValues) {
      stats.uniqueValues.add(value);
    }
    if (stats.examples && stats.examples.length < maxExamples) {
      stats.examples.push(value);
    }
  } else if (type === "number") {
    const isInteger = Number.isInteger(value);
    if (isInteger) {
      stats.types.add("integer");
      stats.isInteger = stats.isInteger !== false; // Only false if we've seen non-integers
    } else {
      stats.types.add("number");
      stats.isInteger = false;
    }

    stats.min = stats.min !== undefined ? Math.min(stats.min, value) : value;
    stats.max = stats.max !== undefined ? Math.max(stats.max, value) : value;

    if (stats.uniqueValues && stats.uniqueValues.size < maxUniqueValues) {
      stats.uniqueValues.add(value);
    }
    if (stats.examples && stats.examples.length < maxExamples) {
      stats.examples.push(value);
    }
  } else if (type === "string") {
    stats.types.add("string");

    const len = value.length;
    stats.minLength = stats.minLength !== undefined ? Math.min(stats.minLength, len) : len;
    stats.maxLength = stats.maxLength !== undefined ? Math.max(stats.maxLength, len) : len;

    if (stats.uniqueValues && stats.uniqueValues.size < maxUniqueValues) {
      stats.uniqueValues.add(value);
    }

    // Detect format
    const format = detectFormat(value);
    if (format && stats.formats) {
      stats.formats.add(format);
    }

    if (stats.examples && stats.examples.length < maxExamples) {
      stats.examples.push(value);
    }
  } else if (Array.isArray(value)) {
    stats.types.add("array");

    const len = value.length;
    stats.minItems = stats.minItems !== undefined ? Math.min(stats.minItems, len) : len;
    stats.maxItems = stats.maxItems !== undefined ? Math.max(stats.maxItems, len) : len;

    // Initialize array items stats if not present
    if (!stats.arrayItems) {
      stats.arrayItems = createStats();
    }

    // Collect stats from each item
    for (const item of value) {
      collectValueStats(item, stats.arrayItems, opts);
    }
  } else if (type === "object") {
    stats.types.add("object");

    // Initialize object keys map if not present
    if (!stats.objectKeys) {
      stats.objectKeys = new Map();
    }

    // Collect stats for each property
    for (const [key, val] of Object.entries(value)) {
      if (!stats.objectKeys.has(key)) {
        stats.objectKeys.set(key, createStats());
      }
      const keyStats = stats.objectKeys.get(key)!;
      keyStats.presenceCount = (keyStats.presenceCount || 0) + 1;
      collectValueStats(val, keyStats, opts);
    }
  }
}

/**
 * Merge two TypeStats objects
 */
export function mergeStats(a: TypeStats, b: TypeStats): TypeStats {
  const merged: TypeStats = createStats();

  // Merge types
  merged.types = new Set([...a.types, ...b.types]);

  // Merge integer flag
  merged.isInteger = (a.isInteger ?? true) && (b.isInteger ?? true);

  // Merge min/max
  if (a.min !== undefined || b.min !== undefined) {
    merged.min = Math.min(a.min ?? Infinity, b.min ?? Infinity);
  }
  if (a.max !== undefined || b.max !== undefined) {
    merged.max = Math.max(a.max ?? -Infinity, b.max ?? -Infinity);
  }

  // Merge minLength/maxLength
  if (a.minLength !== undefined || b.minLength !== undefined) {
    merged.minLength = Math.min(a.minLength ?? Infinity, b.minLength ?? Infinity);
  }
  if (a.maxLength !== undefined || b.maxLength !== undefined) {
    merged.maxLength = Math.max(a.maxLength ?? -Infinity, b.maxLength ?? -Infinity);
  }

  // Merge minItems/maxItems
  if (a.minItems !== undefined || b.minItems !== undefined) {
    merged.minItems = Math.min(a.minItems ?? Infinity, b.minItems ?? Infinity);
  }
  if (a.maxItems !== undefined || b.maxItems !== undefined) {
    merged.maxItems = Math.max(a.maxItems ?? -Infinity, b.maxItems ?? -Infinity);
  }

  // Merge unique values (with limit)
  if (a.uniqueValues || b.uniqueValues) {
    merged.uniqueValues = new Set([
      ...(a.uniqueValues || []),
      ...(b.uniqueValues || []),
    ]);
    if (merged.uniqueValues.size > 50) {
      delete merged.uniqueValues; // Too many values
    }
  }

  // Merge formats
  if (a.formats || b.formats) {
    merged.formats = new Set([...(a.formats || []), ...(b.formats || [])]);
  }

  // Merge examples (limit to 3)
  merged.examples = [...(a.examples || []), ...(b.examples || [])].slice(0, 3);

  // Merge presence count
  merged.presenceCount = (a.presenceCount || 0) + (b.presenceCount || 0);

  // Merge object keys
  if (a.objectKeys || b.objectKeys) {
    merged.objectKeys = new Map();
    const allKeys = new Set([
      ...(a.objectKeys?.keys() || []),
      ...(b.objectKeys?.keys() || []),
    ]);
    for (const key of allKeys) {
      const aStats = a.objectKeys?.get(key);
      const bStats = b.objectKeys?.get(key);
      if (aStats && bStats) {
        merged.objectKeys.set(key, mergeStats(aStats, bStats));
      } else {
        merged.objectKeys.set(key, aStats || bStats!);
      }
    }
  }

  // Merge array items
  if (a.arrayItems || b.arrayItems) {
    if (a.arrayItems && b.arrayItems) {
      merged.arrayItems = mergeStats(a.arrayItems, b.arrayItems);
    } else if (a.arrayItems) {
      merged.arrayItems = a.arrayItems;
    } else if (b.arrayItems) {
      merged.arrayItems = b.arrayItems;
    }
  }

  return merged;
}

