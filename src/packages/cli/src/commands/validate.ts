import chalk from "chalk";
import { readJson, readJsonInput } from "../utils/readJson.js";
import { validateWithAjv, type ValidationOptions } from "../utils/validateWithAjv.js";
import { writeOutput } from "../utils/writeFile.js";

export interface ValidateCommandOptions {
  schema: string;
  draft?: "2020-12" | "2019-09" | "07";
  allErrors?: boolean;
  formats?: boolean;
  strict?: boolean;
  output?: string;
  report?: "pretty" | "ndjson" | "json";
  quiet?: boolean;
  color?: boolean;
}

/**
 * Validate JSON against a JSON Schema
 */
export async function validateCommand(
  inputFile: string | undefined,
  options: ValidateCommandOptions
): Promise<void> {
  try {
    // Read input JSON
    const data = readJsonInput(inputFile);

    // Read schema
    const schema = readJson(options.schema);

    // Validate
    const validationOpts: ValidationOptions = {
      draft: options.draft || "2020-12",
      allErrors: options.allErrors !== false, // Default true
      formats: options.formats !== false, // Default true
      strict: options.strict || false,
    };

    const result = validateWithAjv(data, schema, validationOpts);

    // Format output
    const reportType = options.report || "pretty";

    if (result.valid) {
      // Valid case
      if (!options.quiet) {
        if (options.color !== false) {
          console.log(chalk.green("✓ Valid"));
        } else {
          console.log("✓ Valid");
        }
      }

      // Write empty report if output specified
      if (options.output) {
        if (reportType === "json") {
          writeOutput(options.output, JSON.stringify([], null, 2));
        } else if (reportType === "ndjson") {
          writeOutput(options.output, "");
        }
      }

      process.exit(0);
    } else {
      // Invalid case
      if (reportType === "pretty") {
        printPrettyErrors(result.errors, options.color !== false);
      } else if (reportType === "ndjson") {
        const output = result.errors.map((e) => JSON.stringify(e)).join("\n");
        if (options.output) {
          writeOutput(options.output, output);
        } else {
          console.log(output);
        }
      } else if (reportType === "json") {
        const output = JSON.stringify(result.errors, null, 2);
        if (options.output) {
          writeOutput(options.output, output);
        } else {
          console.log(output);
        }
      }

      process.exit(2); // Exit code 2 for validation failure
    }
  } catch (error: any) {
    // IO/parse errors
    console.error(
      options.color !== false
        ? chalk.red("Error: ") + error.message
        : `Error: ${error.message}`
    );
    process.exit(1);
  }
}

/**
 * Print validation errors in a pretty format
 */
function printPrettyErrors(
  errors: Array<{
    gronPath: string;
    keyword: string;
    message: string;
    schemaPath: string;
    instancePath: string;
    params?: Record<string, any>;
  }>,
  useColor: boolean
): void {
  if (useColor) {
    console.error(chalk.red.bold(`✗ Validation failed with ${errors.length} error(s):\n`));
  } else {
    console.error(`✗ Validation failed with ${errors.length} error(s):\n`);
  }

  for (const error of errors) {
    if (useColor) {
      console.error(chalk.cyan("  Path: ") + chalk.yellow(error.gronPath));
      console.error(chalk.cyan("  Keyword: ") + error.keyword);
      console.error(chalk.cyan("  Message: ") + error.message);
      if (error.params && Object.keys(error.params).length > 0) {
        console.error(
          chalk.cyan("  Details: ") + JSON.stringify(error.params, null, 2)
        );
      }
      console.error(chalk.gray("  Schema Path: ") + error.schemaPath);
      console.error(); // Empty line between errors
    } else {
      console.error(`  Path: ${error.gronPath}`);
      console.error(`  Keyword: ${error.keyword}`);
      console.error(`  Message: ${error.message}`);
      if (error.params && Object.keys(error.params).length > 0) {
        console.error(`  Details: ${JSON.stringify(error.params, null, 2)}`);
      }
      console.error(`  Schema Path: ${error.schemaPath}`);
      console.error(); // Empty line between errors
    }
  }
}

