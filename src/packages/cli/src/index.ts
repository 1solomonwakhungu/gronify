#!/usr/bin/env node
import type { Command } from "commander";
import { accessSync, closeSync, constants, createReadStream, existsSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { extname } from "node:path";
import { flattenStream } from "./flatten-stream.js";
import { createFormatter, loadColors, shouldUseColor, type FormatOptions, type OutputFormatter } from "./formatter.js";
import { createLineMatcher } from "./matcher.js";
import { createOutputSink, GronOutput, type OutputOptions } from "./output.js";

const INPUT_BLOCK_SIZE = 1 << 20;
/** Flatten and search read regular files through one reused block of this size (see `readRegularFile`). */
const REUSED_BLOCK_SIZE = 1 << 18;

/** The program-level options, as commander sets them. */
interface GlobalOptions {
  color?: boolean;
  pretty?: boolean;
  output?: string;
}

interface FlattenOptions {
  limit?: number;
  sort?: boolean;
}

interface SearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  count?: boolean;
  invertMatch?: boolean;
  maxCount?: number;
  sort?: boolean;
  exitStatus?: boolean;
}

const SORT_HELP =
  "Sort object keys at every level (UTF-16 order); arrays keep their order. Default: document order. " +
  "Memory: arrays at the top level stream; an object is held until it closes, up to 64 MiB (set GRONIFY_SORT_MEMORY, e.g. 256MiB) " +
  "before spilling to a temp file";

function isCount(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));
}

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

/** Colour support is loaded only for a formatter that will use it. */
async function createFormatterFromOptions(globalOptions: GlobalOptions): Promise<OutputFormatter> {
  // Auto-detected color follows stdout, so don't write ANSI codes into an output file unless --color was explicit.
  const autoColor = globalOptions.output ? false : shouldUseColor();
  const formatOptions: FormatOptions = {
    color: globalOptions.color ?? autoColor,
    pretty: globalOptions.pretty ?? false,
    format: "gron"
  };
  const formatter = createFormatter(formatOptions);
  if (formatter.colored) await loadColors();
  return formatter;
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

/**
 * Reads a regular file through one reused block. Every consumer copies what it keeps before asking for the next
 * chunk, so reusing the block is safe, and it saves allocating (and later collecting) a fresh block per read.
 * Regular files never block for long, so a synchronous read costs the event loop nothing that matters.
 */
async function* readRegularFile(open: () => number, close: boolean): AsyncGenerator<Buffer> {
  const fd = open();
  try {
    const block = Buffer.allocUnsafe(REUSED_BLOCK_SIZE);
    for (;;) {
      const length = readSync(fd, block, 0, block.length, null);
      if (length === 0) return;
      yield length === block.length ? block : block.subarray(0, length);
    }
  } finally {
    if (close) closeSync(fd);
  }
}

/**
 * Streams a file or stdin as raw bytes. Returns undefined (after printing usage) when there is nothing to read.
 * `reuse` allows one reused block for regular files; only pass it for consumers that never keep a chunk.
 */
function openInput(file: string | undefined, formatter: OutputFormatter, usage: string, reuse = false): AsyncIterable<Buffer> | undefined {
  if (file) {
    validateFile(file);
    // Pipes, devices and FIFOs keep the asynchronous stream, which never blocks while waiting for a writer.
    if (reuse && statSync(file, { throwIfNoEntry: false })?.isFile()) return readRegularFile(() => openSync(file, "r"), true);
    return createReadStream(file, { highWaterMark: INPUT_BLOCK_SIZE });
  }
  if (!hasStdinData()) {
    console.error(formatter.formatError("No input file provided and no data piped to stdin"));
    console.error(usage);
    process.exitCode = 1;
    return undefined;
  }
  // `< file.json` redirects a regular file, which reads faster directly than through process.stdin.
  if (reuse && fstatSync(0).isFile()) return readRegularFile(() => 0, false);
  return process.stdin;
}

function createOutput(outputFile: string | undefined, options: Omit<OutputOptions, "sink"> = {}): GronOutput {
  return new GronOutput({ ...options, sink: createOutputSink(outputFile) });
}

/** A closed downstream pipe (for example `| head`) is a normal way to stop, not a failure. */
async function isBrokenPipe(error: unknown, outputFile: string | undefined): Promise<boolean> {
  if (!(error instanceof Error)) return false;
  const { code, syscall } = error as NodeJS.ErrnoException;
  if (code === "EPIPE") return true;
  // Node child-process pipes use sockets. On macOS a downstream close can race with a write and return
  // ENOTCONN instead of EPIPE. Only a write to socket-backed stdout is a normal downstream disconnect;
  // the same error from an input or an explicitly selected output file must still fail.
  if (code !== "ENOTCONN" || syscall !== "write" || outputFile || process.stdout.isTTY) return false;
  const { Socket } = await import("node:net");
  return process.stdout instanceof Socket;
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

async function flattenCommand(file: string | undefined, options: FlattenOptions, globalOptions: GlobalOptions): Promise<void> {
  const formatter = await createFormatterFromOptions(globalOptions);
  try {
    if (file && ![".json", ".jsonl"].includes(extname(file).toLowerCase())) {
      console.warn(formatter.formatWarning(`File '${file}' doesn't have a .json extension`));
    }
    const input = openInput(file, formatter, "Usage: gronify flatten <file> OR cat file.json | gronify flatten", true);
    if (!input) return;
    const output = createOutput(globalOptions.output, { format: formatter.createGronLineFormatter(), limit: options.limit });
    await flattenStream(input, output, { sort: options.sort });
    reportStop(formatter, output, `Stopped after ${plural(options.limit!, "line", "lines")} (--limit)`);
    if (globalOptions.output) {
      console.error(formatter.formatSuccess(`Output written to ${globalOptions.output}`));
    }
  } catch (error) {
    if (await isBrokenPipe(error, globalOptions.output)) return;
    fail(formatter, "flattening JSON", error);
    if (error instanceof SyntaxError) {
      console.error(formatter.formatInfo("Tip: Validate your JSON with a linter like https://jsonlint.com"));
    }
  }
}

async function unflattenCommand(file: string | undefined, globalOptions: GlobalOptions): Promise<void> {
  const formatter = await createFormatterFromOptions(globalOptions);
  try {
    const input = openInput(file, formatter, "Usage: gronify unflatten <file> OR cat file.gron | gronify unflatten");
    if (!input) return;
    const { createMemoryOutput, unflattenStream } = await import("./unflatten-stream.js");
    const pretty = Boolean(globalOptions.pretty);
    // Colour is applied to the finished text, so it is only used when the formatter would actually colour JSON.
    const colorizer = await createFormatterFromOptions({ ...globalOptions, pretty: false });
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
    if (await isBrokenPipe(error, globalOptions.output)) return;
    fail(formatter, "unflattening gron", error);
    if (error instanceof Error && /^line \d+:/.test(error.message)) {
      console.error(formatter.formatInfo("Tip: Gron lines should look like: json.path = value"));
    }
  }
}

async function searchCommand(fileOrTerm: string, term: string | undefined, options: SearchOptions, globalOptions: GlobalOptions): Promise<void> {
  const formatter = await createFormatterFromOptions(globalOptions);
  const file = term ? fileOrTerm : undefined;
  const searchTerm = term ?? fileOrTerm;

  try {
    const matcher = createLineMatcher(searchTerm, {
      regex: Boolean(options.regex),
      caseSensitive: Boolean(options.caseSensitive)
    });
    const input = openInput(file, formatter, "Usage: gronify search <file> <term> OR cat file.json | gronify search <term>", true);
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
    if (await isBrokenPipe(error, globalOptions.output)) return;
    fail(formatter, options.regex ? "searching JSON (invalid regex or JSON)" : "searching JSON", error, options.exitStatus ? 2 : 1);
  }
}

/** Parses the full command line with commander, which also covers help, version and every usage error. */
async function runProgram(): Promise<void> {
  const { Command: Program, InvalidArgumentError } = await import("commander");

  function parseCount(value: string): number {
    if (!isCount(value)) throw new InvalidArgumentError("Must be a positive integer.");
    return Number(value);
  }

  const program = new Program();
  const globals = (command: Command): GlobalOptions => command.parent?.opts() ?? {};

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

  program
    .command("flatten")
    .description("Convert JSON to gron format")
    .argument("[file]", "JSON file to flatten (or read from stdin if not provided)")
    .option("--limit <n>", "Stop after n lines of output and stop reading the input", parseCount)
    .option("--sort", SORT_HELP)
    .action((file: string | undefined, options: FlattenOptions, command: Command) => flattenCommand(file, options, globals(command)));

  program
    .command("unflatten")
    .description("Convert gron format back to JSON")
    .argument("[file]", "Gron file to unflatten (or read from stdin if not provided)")
    .action((file: string | undefined, _options: unknown, command: Command) => unflattenCommand(file, globals(command)));

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
    .action((fileOrTerm: string, term: string | undefined, options: SearchOptions, command: Command) =>
      searchCommand(fileOrTerm, term, options, globals(command)));

  await program.parseAsync();
}

interface QuickCommand {
  /** Boolean options and the option key commander gives each. */
  flags: Record<string, string>;
  /** Options that take a positive integer as the next argument. */
  counts: Record<string, string>;
  /** How many positional arguments the command accepts. */
  min: number;
  max: number;
  run(positionals: string[], options: Record<string, unknown>, globals: GlobalOptions): Promise<void>;
}

const QUICK_COMMANDS: Record<string, QuickCommand> = {
  flatten: {
    flags: { "--sort": "sort" },
    counts: { "--limit": "limit" },
    min: 0,
    max: 1,
    run: (positionals, options, globals) => flattenCommand(positionals[0], options, globals),
  },
  unflatten: {
    flags: {},
    counts: {},
    min: 0,
    max: 1,
    run: (positionals, _options, globals) => unflattenCommand(positionals[0], globals),
  },
  search: {
    flags: {
      "-r": "regex",
      "--regex": "regex",
      "-c": "caseSensitive",
      "--case-sensitive": "caseSensitive",
      "--count": "count",
      "-v": "invertMatch",
      "--invert-match": "invertMatch",
      "--sort": "sort",
      "--exit-status": "exitStatus",
    },
    counts: { "-m": "maxCount", "--max-count": "maxCount" },
    min: 1,
    max: 2,
    run: (positionals, options, globals) => searchCommand(positionals[0]!, positionals[1], options, globals),
  },
};

/**
 * Recognizes the everyday command lines and parses them the way commander does, so most runs never load it: one
 * command, its known options with values as separate arguments, program options before or after it (the last of a
 * repeated option wins), and plain positionals. Returns null for anything else, including every usage error and help
 * or version request, so that commander handles those in full.
 */
function parseQuick(args: string[]): (() => Promise<void>) | null {
  let command: QuickCommand | null = null;
  const positionals: string[] = [];
  const options: Record<string, unknown> = {};
  const globals: GlobalOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--color" || arg === "--no-color") {
      globals.color = arg === "--color";
    } else if (arg === "--pretty") {
      globals.pretty = true;
    } else if (arg === "-o" || arg === "--output") {
      const value = args[(i += 1)];
      if (value === undefined || value === "" || value.startsWith("-")) return null;
      globals.output = value;
    } else if (command === null) {
      if (!Object.hasOwn(QUICK_COMMANDS, arg)) return null;
      command = QUICK_COMMANDS[arg]!;
    } else if (Object.hasOwn(command.flags, arg)) {
      options[command.flags[arg]!] = true;
    } else if (Object.hasOwn(command.counts, arg)) {
      const value = args[(i += 1)];
      if (value === undefined || !isCount(value)) return null;
      options[command.counts[arg]!] = Number(value);
    } else if (arg === "" || arg.startsWith("-")) {
      return null;
    } else {
      positionals.push(arg);
    }
  }
  if (command === null || positionals.length < command.min || positionals.length > command.max) return null;
  const quick = command;
  return () => quick.run(positionals, options, globals);
}

await (parseQuick(process.argv.slice(2)) ?? runProgram)();
