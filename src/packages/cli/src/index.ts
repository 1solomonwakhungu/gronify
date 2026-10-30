#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { accessSync, constants, createReadStream, existsSync } from "node:fs";
import { extname } from "node:path";
import { flattenStream } from "./flatten-stream.js";
import { createFormatter, shouldUseColor, type FormatOptions, type OutputFormatter } from "./formatter.js";
import { createLineMatcher } from "./matcher.js";
import { createOutputSink, GronOutput, type OutputOptions } from "./output.js";

const INPUT_BLOCK_SIZE = 1 << 20;

const program = new Command();

program
  .name("gronify")
  .description("Flatten, search, and unflatten JSON from the command line")
  .version("__GRONIFY_VERSION__")
  .option("--color", "Enable colored output (default: auto-detect)")
  .option("--no-color", "Disable colored output")
  .option("--pretty", "Enable pretty formatting with better readability")
  .option("-o, --output <file>", "Write output to a file instead of stdout")
  .exitOverride((error) => {
    // With --exit-status, 1 means "no match", so usage errors report 2 like every other failure of that command.
    process.exit(error.exitCode !== 0 && process.argv.includes("--exit-status") ? 2 : error.exitCode);
  });

function parseCount(value: string): number {
  const count = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(count)) {
    throw new InvalidArgumentError("Must be a positive integer.");
  }
  return count;
}

const SORT_HELP =
  "Sort object keys at every level (UTF-16 order); arrays keep their order. Default: document order. " +
  "Memory: arrays at the top level stream; an object is held until it closes, up to 64 MiB (set GRONIFY_SORT_MEMORY, e.g. 256MiB) " +
  "before spilling to a temp file";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Tells the reader (on stderr, so stdout stays clean) that a cap ended the run before the input did. Nothing is said when
 * the input turned out to hold no more output. Without `hedge`, the message carries no "there may be more".
 */
function reportStop(formatter: OutputFormatter, output: GronOutput, message: string, hedge = true): void {
  if (output.stopped && !output.exhausted) console.error(formatter.formatInfo(hedge ? `${message}; there may be more` : message));
}

function hasStdinData(): boolean {
  return !process.stdin.isTTY;
}

function createFormatterFromOptions(globalOptions: Record<string, unknown>): OutputFormatter {
  // Auto-detected color follows stdout, so don't write ANSI codes into an output file unless --color was explicit.
  const autoColor = globalOptions.output ? false : shouldUseColor();
  const formatOptions: FormatOptions = {
    color: globalOptions.color as boolean | undefined ?? autoColor,
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

/** Streams a file or stdin as raw bytes. Returns undefined (after printing usage) when there is nothing to read. */
function openInput(file: string | undefined, formatter: OutputFormatter, usage: string): AsyncIterable<Buffer> | undefined {
  if (file) {
    validateFile(file);
    return createReadStream(file, { highWaterMark: INPUT_BLOCK_SIZE });
  }
  if (!hasStdinData()) {
    console.error(formatter.formatError("No input file provided and no data piped to stdin"));
    console.error(usage);
    process.exitCode = 1;
    return undefined;
  }
  return process.stdin;
}

function createOutput(outputFile: string | undefined, options: Omit<OutputOptions, "sink"> = {}): GronOutput {
  return new GronOutput({ ...options, sink: createOutputSink(outputFile) });
}

/** A closed downstream pipe (for example `| head`) is a normal way to stop, not a failure. */
function isBrokenPipe(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "EPIPE";
}

async function emit(output: string, formatter: OutputFormatter, outputFile: string | undefined): Promise<void> {
  if (!outputFile) {
    console.log(output);
    return;
  }
  const sink = createOutputSink(outputFile);
  try {
    sink.open().write(output + "\n", "utf8");
    await sink.commit();
  } catch (error) {
    await sink.abort();
    throw error;
  }
  console.error(formatter.formatSuccess(`Output written to ${outputFile}`));
}

function fail(formatter: OutputFormatter, context: string, error: unknown, exitCode = 1): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(formatter.formatError(`${context}: ${message}`));
  process.exitCode = exitCode;
}

program
  .command("flatten")
  .description("Convert JSON to gron format")
  .argument("[file]", "JSON file to flatten (or read from stdin if not provided)")
  .option("--limit <n>", "Stop after n lines of output and stop reading the input", parseCount)
  .option("--sort", SORT_HELP)
  .action(async (file: string | undefined, options: { limit?: number; sort?: boolean }, command: Command) => {
    const globalOptions = command.parent?.opts() ?? {};
    const formatter = createFormatterFromOptions(globalOptions);
    try {
      if (file && ![".json", ".jsonl"].includes(extname(file).toLowerCase())) {
        console.warn(formatter.formatWarning(`File '${file}' doesn't have a .json extension`));
      }
      const input = openInput(file, formatter, "Usage: gronify flatten <file> OR cat file.json | gronify flatten");
      if (!input) return;
      const output = createOutput(globalOptions.output, { format: formatter.createGronLineFormatter(), limit: options.limit });
      await flattenStream(input, output, { sort: options.sort });
      reportStop(formatter, output, `Stopped after ${plural(options.limit!, "line", "lines")} (--limit)`);
      if (globalOptions.output) {
        console.error(formatter.formatSuccess(`Output written to ${globalOptions.output}`));
      }
    } catch (error) {
      if (isBrokenPipe(error)) return;
      fail(formatter, "flattening JSON", error);
      if (error instanceof SyntaxError) {
        console.error(formatter.formatInfo("Tip: Validate your JSON with a linter like https://jsonlint.com"));
      }
    }
  });

program
  .command("unflatten")
  .description("Convert gron format back to JSON")
  .argument("[file]", "Gron file to unflatten (or read from stdin if not provided)")
  .action(async (file: string | undefined, _options: unknown, command: Command) => {
    const globalOptions = command.parent?.opts() ?? {};
    const formatter = createFormatterFromOptions(globalOptions);
    try {
      const input = openInput(file, formatter, "Usage: gronify unflatten <file> OR cat file.gron | gronify unflatten");
      if (!input) return;
      const { createMemoryOutput, unflattenStream } = await import("./unflatten-stream.js");
      const pretty = Boolean(globalOptions.pretty);
      // Colour is applied to the finished text, so it is only used when the formatter would actually colour JSON.
      const colorizer = createFormatterFromOptions({ ...globalOptions, pretty: false });
      if (colorizer.formatJson("{}") !== "{}") {
        const memory = createMemoryOutput();
        await unflattenStream(input, memory.sink, { pretty });
        await emit(colorizer.formatJson(memory.text().replace(/\n$/, "")), formatter, globalOptions.output);
        return;
      }
      await unflattenStream(input, createOutputSink(globalOptions.output), { pretty });
      if (globalOptions.output) {
        console.error(formatter.formatSuccess(`Output written to ${globalOptions.output}`));
      }
    } catch (error) {
      if (isBrokenPipe(error)) return;
      fail(formatter, "unflattening gron", error);
      if (error instanceof Error && /^line \d+:/.test(error.message)) {
        console.error(formatter.formatInfo("Tip: Gron lines should look like: json.path = value"));
      }
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
  .option("-v, --invert-match", "Invert match: show lines that do NOT match")
  .option("-m, --max-count <n>", "Stop after n matching lines (n non-matching lines with -v) and stop reading the input", parseCount)
  .option("--sort", SORT_HELP)
  .option("--exit-status", "Exit 1 when nothing matches (like grep); errors then exit 2 instead of 1")
  .action(async (fileOrTerm: string, term: string | undefined, options: {
    regex?: boolean;
    caseSensitive?: boolean;
    count?: boolean;
    invertMatch?: boolean;
    maxCount?: number;
    sort?: boolean;
    exitStatus?: boolean;
  }, command: Command) => {
    const globalOptions = command.parent?.opts() ?? {};
    const formatter = createFormatterFromOptions(globalOptions);
    const file = term ? fileOrTerm : undefined;
    const searchTerm = term ?? fileOrTerm;

    try {
      const matcher = createLineMatcher(searchTerm, {
        regex: Boolean(options.regex),
        caseSensitive: Boolean(options.caseSensitive)
      });
      const input = openInput(file, formatter, "Usage: gronify search <file> <term> OR cat file.json | gronify search <term>");
      if (!input) {
        if (options.exitStatus) process.exitCode = 2;
        return;
      }
      const output = createOutput(globalOptions.output, {
        matcher,
        invert: Boolean(options.invertMatch),
        countOnly: Boolean(options.count),
        format: options.invertMatch ? formatter.createGronLineFormatter() : formatter.createSearchLineFormatter(searchTerm),
        limit: options.maxCount
      });
      // Counting needs no order, so --sort is skipped with --count.
      await flattenStream(input, output, { sort: options.sort && !options.count });
      if (options.count) {
        reportStop(formatter, output, `Stopped counting at ${plural(options.maxCount!, "match", "matches")} (--max-count)`, false);
      } else {
        reportStop(formatter, output, `Stopped after ${options.invertMatch ? plural(options.maxCount!, "line", "lines") : plural(options.maxCount!, "match", "matches")} (--max-count)`);
      }
      if (options.exitStatus && output.matched === 0) process.exitCode = 1;

      if (options.count) {
        await emit(formatter.formatSuccess(String(output.matched)), formatter, globalOptions.output);
      } else if (output.matched === 0) {
        if (options.invertMatch) {
          console.error(formatter.formatWarning(`All lines matched '${searchTerm}' (nothing to invert)`));
        } else {
          console.error(formatter.formatWarning(`No matches found for '${searchTerm}'`));
          console.error(formatter.formatInfo("Tip: Search is a case-insensitive substring match; use --regex for patterns"));
        }
      } else if (globalOptions.output) {
        console.error(formatter.formatSuccess(`Output written to ${globalOptions.output}`));
      }
    } catch (error) {
      if (isBrokenPipe(error)) return;
      fail(formatter, options.regex ? "searching JSON (invalid regex or JSON)" : "searching JSON", error, options.exitStatus ? 2 : 1);
    }
  });

await program.parseAsync();
