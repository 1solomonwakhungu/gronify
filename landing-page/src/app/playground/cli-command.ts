/** Builds the `gronify` command line that matches the playground's settings. No imports, so it can be tested in Node. */

export type PlaygroundMode = "flatten" | "search" | "unflatten";
export type Runner = "gronify" | "npx";

export interface CommandSettings {
  runner: Runner;
  mode: PlaygroundMode;
  /** Input file name, for example `deployment.json`. */
  file: string;
  term: string;
  regex: boolean;
  caseSensitive: boolean;
  invert: boolean;
  count: boolean;
  /** `-m` for search; null when off. */
  maxCount: number | null;
  sort: boolean;
  /** `--limit` for flatten; null when off. */
  limit: number | null;
  /** `--pretty` for unflatten. */
  pretty: boolean;
}

const SAFE_WORD = /^[A-Za-z0-9_./:=@%+,^-]+$/;

/** Quotes one argument for a POSIX shell (bash, zsh). Plain words stay bare. */
export function shellQuote(argument: string): string {
  if (argument !== "" && SAFE_WORD.test(argument)) return argument;
  return `'${argument.replace(/'/g, `'\\''`)}'`;
}

/**
 * The arguments after `gronify`, as a shell would pass them. Options come after the arguments, as in the README
 * examples, except that a search term starting with `-` would read as an option, so then the options go first and
 * `--` ends them.
 */
export function commandArguments(settings: CommandSettings): string[] {
  if (settings.mode === "flatten") {
    const args = ["flatten", settings.file];
    if (settings.sort) args.push("--sort");
    if (settings.limit !== null) args.push("--limit", String(settings.limit));
    return args;
  }
  if (settings.mode === "unflatten") {
    return settings.pretty ? ["--pretty", "unflatten", settings.file] : ["unflatten", settings.file];
  }
  const options: string[] = [];
  if (settings.regex) options.push("--regex");
  if (settings.caseSensitive) options.push("-c");
  if (settings.invert) options.push("-v");
  if (settings.count) options.push("--count");
  if (settings.maxCount !== null) options.push("-m", String(settings.maxCount));
  if (settings.sort) options.push("--sort");
  if (settings.term.startsWith("-")) return ["search", ...options, "--", settings.file, settings.term];
  return ["search", settings.file, settings.term, ...options];
}

/** The full command line, quoted for a POSIX shell. */
export function buildCommand(settings: CommandSettings): string {
  const program = settings.runner === "npx" ? "npx gronify" : "gronify";
  return [program, ...commandArguments(settings).map(shellQuote)].join(" ");
}
