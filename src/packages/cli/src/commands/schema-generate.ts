import chalk from "chalk";
import { readJson, readJsonInput } from "../utils/readJson.js";
import { writeOutput } from "../utils/writeFile.js";
import { inferSchema, type SchemaOptions } from "../utils/inferSchema/index.js";

export interface SchemaGenerateOptions {
  output?: string;
  title?: string;
  id?: string;
  draft?: "2020-12" | "2019-09" | "07";
  additionalProperties?: boolean;
  enumThreshold?: number;
  detectFormats?: boolean;
  minmax?: boolean;
  examples?: boolean;
  requiredPolicy?: "loose" | "observed" | "strict";
  color?: boolean;
  quiet?: boolean;
}

/**
 * Generate JSON Schema from example data
 */
export async function schemaGenerateCommand(
  inputFiles: string[],
  options: SchemaGenerateOptions
): Promise<void> {
  try {
    // Read all input files
    const dataSamples: any[] = [];

    if (inputFiles.length === 0 || (inputFiles.length === 1 && inputFiles[0] === "-")) {
      // Read from stdin
      dataSamples.push(readJsonInput(undefined));
    } else {
      // Read from files
      for (const file of inputFiles) {
        if (file === "-") {
          dataSamples.push(readJsonInput(undefined));
        } else {
          dataSamples.push(readJson(file));
        }
      }
    }

    if (dataSamples.length === 0) {
      throw new Error("No input data provided");
    }

    // Infer schema
    const schemaOpts: SchemaOptions = {
      draft: options.draft || "2020-12",
      additionalProperties: options.additionalProperties !== false, // Default true
      enumThreshold: options.enumThreshold || 8,
      detectFormats: options.detectFormats !== false, // Default true
      minmax: options.minmax !== false, // Default true
      examples: options.examples !== false, // Default true
      requiredPolicy: options.requiredPolicy || "observed",
    };

    // Add optional properties only if provided
    if (options.title) {
      schemaOpts.title = options.title;
    }
    if (options.id) {
      schemaOpts.id = options.id;
    }

    const schema = inferSchema(dataSamples, schemaOpts);

    // Output schema
    const output = JSON.stringify(schema, null, 2);
    writeOutput(options.output, output);

    // Print success message if not quiet and outputting to file
    if (!options.quiet && options.output) {
      const msg = `Schema generated successfully: ${options.output}`;
      if (options.color !== false) {
        console.error(chalk.green("✓ ") + msg);
      } else {
        console.error(`✓ ${msg}`);
      }
    }

    process.exit(0);
  } catch (error: any) {
    // IO/parse errors
    const msg = `Error: ${error.message}`;
    if (options.color !== false) {
      console.error(chalk.red(msg));
    } else {
      console.error(msg);
    }
    process.exit(1);
  }
}

