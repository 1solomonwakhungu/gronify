import Ajv from "ajv";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { jsonPointerToGron } from "./jsonPointerToGron.js";

export interface ValidationError {
  gronPath: string;
  keyword: string;
  message: string;
  schemaPath: string;
  instancePath: string;
  params?: Record<string, any>;
}

export interface ValidationOptions {
  draft?: "2020-12" | "2019-09" | "07";
  allErrors?: boolean;
  formats?: boolean;
  strict?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Get Ajv draft version configuration
 */
function getDraftConfig(draft: string): any {
  switch (draft) {
    case "2020-12":
      return { strict: false }; // Ajv 8 defaults to 2020-12
    case "2019-09":
      return { strict: false };
    case "07":
      return { strict: false };
    default:
      return { strict: false };
  }
}

/**
 * Validate JSON data against a JSON Schema using Ajv
 * @param data The data to validate
 * @param schema The JSON Schema
 * @param opts Validation options
 * @returns Validation result with errors augmented with gronPath
 */
export function validateWithAjv(
  data: any,
  schema: any,
  opts: ValidationOptions = {}
): ValidationResult {
  const {
    draft = "2020-12",
    allErrors = true,
    formats = true,
    strict = false,
  } = opts;

  // Configure Ajv
  const ajvOptions = {
    ...getDraftConfig(draft),
    allErrors,
    strict: false, // Disable strict mode to allow $schema in data schemas
    verbose: true, // Include schema and data in errors
  };

  const ajv = new (Ajv as any)(ajvOptions);

  // Add format validation if enabled
  if (formats) {
    (addFormats as any)(ajv);
  }

  // Compile and validate
  let validate;
  try {
    // Remove $schema from the schema object if present to avoid validation issues
    const schemaToCompile = { ...schema };
    delete schemaToCompile.$schema;
    validate = ajv.compile(schemaToCompile);
  } catch (error: any) {
    throw new Error(`Invalid JSON Schema: ${error.message}`);
  }

  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  // Convert Ajv errors to our format with gron paths
  const errors: ValidationError[] = (validate.errors || []).map(
    (error: ErrorObject) => {
      const gronPath = jsonPointerToGron(error.instancePath || "");
      
      return {
        gronPath,
        keyword: error.keyword,
        message: error.message || "Validation failed",
        schemaPath: error.schemaPath,
        instancePath: error.instancePath || "",
        params: error.params,
      };
    }
  );

  return { valid: false, errors };
}

