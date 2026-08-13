#!/usr/bin/env node
import { Command } from "commander";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { createFormatter, shouldUseColor, type FormatOptions, type OutputFormatter } from "./formatter.js";
import { flattenJson, unflattenGron } from "./gron.js";

const program = new Command();

program
  .name("gronify")
  .description("Flatten, search, and unflatten JSON from the command line")
  .version("__GRONIFY_VERSION__")
  .option("--color", "Enable colored output (default: auto-detect)")
  .option("--no-color", "Disable colored output")
  .option("--pretty", "Enable pretty formatting with better readability");

function hasStdinData(): boolean {
  return !process.stdin.isTTY;
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function createFormatterFromOptions(globalOptions: Record<string, unknown>): OutputFormatter {
  const formatOptions: FormatOptions = {
    color: globalOptions.color as boolean | undefined ?? shouldUseColor(),
    pretty: globalOptions.pretty as boolean | undefined ?? false,
    format: "gron"
  };
  return createFormatter(formatOptions);
}

function validateFile(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`File '${filePath}' does not exist`);
  }
  try {
    accessSync(filePath, constants.R_OK);
  } catch {
    throw new Error(`Cannot read file '${filePath}' - permission denied`);
  }
}

async function readInput(file: string | undefined, formatter: OutputFormatter, usage: string): Promise<string> {
  if (file) {
    validateFile(file);
    return readFileSync(file, "utf8");
  }
  if (!hasStdinData()) {
    console.error(formatter.formatError("No input file provided and no data piped to stdin"));
    console.error(usage);
    process.exitCode = 1;
    return "";
  }
  return readStdin();
}

function fail(formatter: OutputFormatter, context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(formatter.formatError(`${context}: ${message}`));
  process.exitCode = 1;
}

program
  .command("flatten")
  .description("Convert JSON to gron format")
  .argument("[file]", "JSON file to flatten (or read from stdin if not provided)")
  .action(async (file: string | undefined, _options: unknown, command: Command) => {
    const formatter = createFormatterFromOptions(command.parent?.opts() ?? {});
    try {
      if (file && ![".json", ".jsonl"].includes(extname(file).toLowerCase())) {
        console.warn(formatter.formatWarning(`File '${file}' doesn't have a .json extension`));
      }
      const input = await readInput(file, formatter, "Usage: gronify flatten <file> OR cat file.json | gronify flatten");
      if (process.exitCode) return;
      console.log(formatter.formatGron(flattenJson(JSON.parse(input))));
    } catch (error) {
      fail(formatter, "flattening JSON", error);
    }
  });

program
  .command("unflatten")
  .description("Convert gron format back to JSON")
  .argument("[file]", "Gron file to unflatten (or read from stdin if not provided)")
  .action(async (file: string | undefined, _options: unknown, command: Command) => {
    const formatter = createFormatterFromOptions(command.parent?.opts() ?? {});
    try {
      const input = await readInput(file, formatter, "Usage: gronify unflatten <file> OR cat file.gron | gronify unflatten");
      if (process.exitCode) return;
      console.log(formatter.formatJson(JSON.stringify(unflattenGron(input))));
    } catch (error) {
      fail(formatter, "unflattening gron", error);
    }
  });

program
  .command("search")
  .description("Search through flattened JSON paths")
  .argument("<file_or_term>", "JSON file to search OR search term (if using stdin)")
  .argument("[term]", "Search term or regex pattern (required if first arg is file)")
  .option("-r, --regex", "Use regex pattern matching")
  .option("-c, --case-sensitive", "Case sensitive search")
  .option("--count", "Show only the count of matches")
  .action(async (fileOrTerm: string, term: string | undefined, options: {
    regex?: boolean;
    caseSensitive?: boolean;
    count?: boolean;
  }, command: Command) => {
    const formatter = createFormatterFromOptions(command.parent?.opts() ?? {});
    const file = term ? fileOrTerm : undefined;
    const searchTerm = term ?? fileOrTerm;

    try {
      const input = await readInput(file, formatter, "Usage: gronify search <file> <term> OR cat file.json | gronify search <term>");
      if (process.exitCode) return;
      const lines = flattenJson(JSON.parse(input)).split("\n");
      const flags = options.caseSensitive ? "" : "i";
      const pattern = options.regex
        ? new RegExp(searchTerm, flags)
        : new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
      const matches = lines.filter((line) => pattern.test(line));

      if (options.count) {
        console.log(formatter.formatSuccess(String(matches.length)));
      } else if (matches.length === 0) {
        console.error(formatter.formatWarning(`No matches found for '${searchTerm}'`));
      } else {
        console.log(formatter.formatSearchResults(matches.join("\n"), searchTerm));
      }
    } catch (error) {
      fail(formatter, options.regex ? "searching JSON (invalid regex or JSON)" : "searching JSON", error);
    }
  });

await program.parseAsync();
