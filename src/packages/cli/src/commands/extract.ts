import { Command } from "commander";
import { search as jmespathSearch } from "jmespath";
import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { readJson } from "../utils/readJson.js";
import { normalizeRecords } from "../utils/normalizeRecords.js";
import { toCsv } from "../utils/toCsv.js";
import { toTsv } from "../utils/toTsv.js";
import { toMarkdown } from "../utils/toMarkdown.js";
import { toTemplate } from "../utils/toTemplate.js";

export interface ExtractOptions {
  paths: string;
  format?: "csv" | "tsv" | "markdown" | "template";
  template?: string;
  templateFile?: string;
  header?: boolean;
  output?: string;
  column?: string;
  delimiter?: string;
  strict?: boolean;
  pretty?: boolean;
  quiet?: boolean;
}

/**
 * Create the extract command
 */
export function createExtractCommand(): Command {
  const command = new Command("extract");

  command
    .description("Extract and transform JSON data using JMESPath queries")
    .argument("[input]", "JSON file to extract from (or read from stdin if omitted or '-')")
    .requiredOption("-p, --paths <expr>", "JMESPath expression to extract data")
    .option(
      "-f, --format <type>",
      "Output format: csv, tsv, markdown, template",
      "csv"
    )
    .option("-t, --template <string>", "Handlebars template string (required for template format)")
    .option("--template-file <path>", "Read template from file")
    .option("--header", "Include header row (default: true)", true)
    .option("--no-header", "Exclude header row")
    .option("-o, --output <file>", "Write output to file (default: stdout)")
    .option("--column <name>", "Column name for primitive values", "value")
    .option("--delimiter <char>", "CSV delimiter character (auto-set to tab for TSV)")
    .option("--strict", "Error on missing fields instead of using empty string", false)
    .option("--pretty", "Pretty-align markdown tables", false)
    .option("--quiet", "Suppress non-fatal warnings", false)
    .action(async (input: string | undefined, options: ExtractOptions) => {
      await executeExtract(input, options);
    });

  // Add examples to help
  command.addHelpText(
    "after",
    `
Examples:
  # Extract to CSV
  $ gronify extract data.json -p "users[*].{name,email}" -f csv

  # Extract to TSV without header
  $ gronify extract data.json -p "items[*].{id,price}" -f tsv --no-header

  # Extract to Markdown table
  $ gronify extract data.json -p "orders[*].{id,status,total}" -f markdown

  # Extract with custom template
  $ gronify extract data.json -p "users[*]" -f template -t "{{name}}: {{email}}"

  # Read from stdin
  $ cat data.json | gronify extract -p "users[*].name" -f csv

  # Output to file
  $ gronify extract data.json -p "users[*]" -f csv -o output.csv

Path Syntax:
  Uses JMESPath for powerful querying. Learn more at https://jmespath.org/
  - Select array elements: users[*]
  - Project fields: users[*].{name: name, email: email}
  - Shorthand: users[*].{name,email}
  - Functions: users[*].{name, skills: join(',', skills)}

Why Extract?
  - Fastgron only outputs gron format
  - Transform nested JSON into spreadsheet-ready data
  - Template support for custom line-by-line formatting
`
  );

  return command;
}

/**
 * Execute the extract command
 */
async function executeExtract(
  input: string | undefined,
  options: ExtractOptions
): Promise<void> {
  try {
    // Validate template requirement
    if (options.format === "template" && !options.template && !options.templateFile) {
      console.error("Error: --template or --template-file is required when using template format");
      process.exit(2);
    }

    // Read JSON input
    let data: any;
    try {
      data = await readJson(input);
    } catch (error: any) {
      console.error(`Error reading JSON: ${error.message}`);
      process.exit(1);
    }

    // Apply JMESPath query
    let result: any;
    try {
      result = jmespathSearch(data, options.paths);
    } catch (error: any) {
      console.error(`Error evaluating path expression: ${error.message}`);
      process.exit(3);
    }

    // Check if result is empty
    if (result === null || result === undefined || (Array.isArray(result) && result.length === 0)) {
      if (!options.quiet) {
        console.warn("Warning: No results found for the given path");
      }
      process.exit(0);
    }

    // Normalize data
    const flattenNested = options.format !== "template";
    const normalizeOptions: any = { flattenNested };
    if (options.strict !== undefined) {
      normalizeOptions.strict = options.strict;
    }
    if (options.column !== undefined) {
      normalizeOptions.columnName = options.column;
    }
    const normalized = normalizeRecords(result, normalizeOptions);

    // Format output
    let output: string;
    try {
      output = await formatOutput(normalized, options);
    } catch (error: any) {
      console.error(`Error formatting output: ${error.message}`);
      process.exit(1);
    }

    // Write output
    try {
      if (options.output) {
        await writeFile(options.output, output, "utf-8");
        if (!options.quiet) {
          console.error(`Output written to ${options.output}`);
        }
      } else {
        console.log(output);
      }
    } catch (error: any) {
      console.error(`Error writing output: ${error.message}`);
      process.exit(1);
    }

    process.exit(0);
  } catch (error: any) {
    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Format normalized data according to the specified format
 */
async function formatOutput(
  data: any,
  options: ExtractOptions
): Promise<string> {
  switch (options.format) {
    case "csv": {
      const csvOptions: any = {};
      if (options.delimiter !== undefined) {
        csvOptions.delimiter = options.delimiter;
      }
      if (options.header !== undefined) {
        csvOptions.includeHeader = options.header;
      }
      return toCsv(data, csvOptions);
    }

    case "tsv": {
      const tsvOptions: any = {};
      if (options.header !== undefined) {
        tsvOptions.includeHeader = options.header;
      }
      return toTsv(data, tsvOptions);
    }

    case "markdown": {
      const mdOptions: any = {};
      if (options.header !== undefined) {
        mdOptions.includeHeader = options.header;
      }
      if (options.pretty !== undefined) {
        mdOptions.pretty = options.pretty;
      }
      return toMarkdown(data, mdOptions);
    }

    case "template": {
      let template: string;
      if (options.templateFile) {
        template = await readFile(options.templateFile, "utf-8");
      } else if (options.template) {
        template = options.template;
      } else {
        throw new Error("Template is required for template format");
      }

      return toTemplate(data, { template });
    }

    default:
      throw new Error(`Unknown format: ${options.format}`);
  }
}

