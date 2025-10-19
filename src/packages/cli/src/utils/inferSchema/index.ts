import { collectValueStats, mergeStats, type TypeStats } from "./collectStats.js";
import { mergeTypes } from "./mergeTypes.js";
import { mergeFormats } from "./detectFormat.js";
import { stableSortKeys } from "./stableSortKeys.js";

export interface SchemaOptions {
  draft?: "2020-12" | "2019-09" | "07";
  title?: string;
  id?: string;
  additionalProperties?: boolean;
  enumThreshold?: number;
  detectFormats?: boolean;
  minmax?: boolean;
  examples?: boolean;
  requiredPolicy?: "loose" | "observed" | "strict";
}

/**
 * Infer JSON Schema from one or more data samples
 */
export function inferSchema(dataSamples: any[], options: SchemaOptions = {}): any {
  const {
    draft = "2020-12",
    title,
    id,
    additionalProperties = true,
    enumThreshold = 8,
    detectFormats = true,
    minmax = true,
    examples = true,
    requiredPolicy = "observed",
  } = options;

  // Collect stats from all samples
  let mergedStats: TypeStats | null = null;

  for (const data of dataSamples) {
    const stats: TypeStats = { types: new Set(), presenceCount: 0 };
    collectValueStats(data, stats);

    if (mergedStats === null) {
      mergedStats = stats;
    } else {
      mergedStats = mergeStats(mergedStats, stats);
    }
  }

  if (!mergedStats) {
    // No data provided
    return buildSchema({}, draft, title, id);
  }

  // Convert stats to schema
  const schema = statsToSchema(
    mergedStats,
    dataSamples.length,
    {
      additionalProperties,
      enumThreshold,
      detectFormats,
      minmax,
      examples,
      requiredPolicy,
    }
  );

  return buildSchema(schema, draft, title, id);
}

/**
 * Build the top-level schema object with metadata
 */
function buildSchema(
  schema: any,
  draft: string,
  title?: string,
  id?: string
): any {
  const result: any = {};

  // Add $schema
  switch (draft) {
    case "2020-12":
      result.$schema = "https://json-schema.org/draft/2020-12/schema";
      break;
    case "2019-09":
      result.$schema = "https://json-schema.org/draft/2019-09/schema";
      break;
    case "07":
      result.$schema = "http://json-schema.org/draft-07/schema#";
      break;
  }

  // Add $id if provided
  if (id) {
    result.$id = id;
  }

  // Add title if provided
  if (title) {
    result.title = title;
  }

  // Merge with inferred schema
  Object.assign(result, schema);

  return stableSortKeys(result);
}

/**
 * Convert TypeStats to JSON Schema
 */
function statsToSchema(
  stats: TypeStats,
  totalSamples: number,
  opts: {
    additionalProperties: boolean;
    enumThreshold: number;
    detectFormats: boolean;
    minmax: boolean;
    examples: boolean;
    requiredPolicy: "loose" | "observed" | "strict";
  }
): any {
  const schema: any = {};

  // Determine type
  const type = mergeTypes(stats.types);
  schema.type = type;

  // Handle different types
  const primaryType = Array.isArray(type) ? type[0] : type;

  if (primaryType === "object" && stats.objectKeys) {
    // Object schema
    schema.properties = {};

    const required: string[] = [];

    // Count how many samples had this object level
    const objectSampleCount = stats.presenceCount || totalSamples;

    for (const [key, keyStats] of stats.objectKeys.entries()) {
      schema.properties[key] = statsToSchema(keyStats, objectSampleCount, opts);

      // Determine if required based on policy
      const presenceCount = keyStats.presenceCount || 0;
      if (opts.requiredPolicy === "strict" && presenceCount > 0) {
        required.push(key);
      } else if (opts.requiredPolicy === "observed" && presenceCount === objectSampleCount) {
        required.push(key);
      }
      // loose policy adds no required fields
    }

    if (required.length > 0) {
      required.sort();
      schema.required = required;
    }

    schema.additionalProperties = opts.additionalProperties;
  } else if (primaryType === "array" && stats.arrayItems) {
    // Array schema
    schema.items = statsToSchema(stats.arrayItems, totalSamples, opts);

    if (opts.minmax) {
      if (stats.minItems !== undefined) {
        schema.minItems = stats.minItems;
      }
      if (stats.maxItems !== undefined) {
        schema.maxItems = stats.maxItems;
      }
    }
  } else if (primaryType === "string") {
    // String schema
    if (opts.minmax) {
      if (stats.minLength !== undefined) {
        schema.minLength = stats.minLength;
      }
      if (stats.maxLength !== undefined) {
        schema.maxLength = stats.maxLength;
      }
    }

    // Detect enum
    if (
      stats.uniqueValues &&
      stats.uniqueValues.size <= opts.enumThreshold &&
      stats.uniqueValues.size > 0
    ) {
      schema.enum = Array.from(stats.uniqueValues).sort();
    }

    // Detect format
    if (opts.detectFormats && stats.formats && stats.formats.size > 0) {
      const format = mergeFormats(Array.from(stats.formats));
      if (format) {
        schema.format = format;
      }
    }
  } else if (primaryType === "number" || primaryType === "integer") {
    // Number schema
    if (stats.isInteger && !Array.isArray(type)) {
      schema.type = "integer";
    }

    if (opts.minmax) {
      if (stats.min !== undefined) {
        schema.minimum = stats.min;
      }
      if (stats.max !== undefined) {
        schema.maximum = stats.max;
      }
    }

    // Detect enum for numbers too
    if (
      stats.uniqueValues &&
      stats.uniqueValues.size <= opts.enumThreshold &&
      stats.uniqueValues.size > 0
    ) {
      schema.enum = Array.from(stats.uniqueValues).sort((a, b) => a - b);
    }
  } else if (primaryType === "boolean") {
    // Boolean schema - no additional constraints needed
  }

  // Add examples if enabled
  if (opts.examples && stats.examples && stats.examples.length > 0) {
    schema.examples = stats.examples;
  }

  return schema;
}

export { inferSchema as default };

