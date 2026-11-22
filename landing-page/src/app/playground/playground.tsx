"use client";

import { Grid, Heading, Section, Text } from "@primer/react-brand";
import NextLink from "next/link";
import posthog from "posthog-js";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";

import { Breadcrumb, GuideShell } from "../guides/guide-article";
import pageStyles from "../page.module.css";
import { cliVersion } from "../site-config";
import { buildCommand, type PlaygroundMode, type Runner } from "./cli-command";
import { flatten, MAX_INPUT_BYTES, search, stdoutOf, utf8ByteLength } from "./gron-engine";
import styles from "./playground.module.css";
import { samples, type SampleId } from "./samples";
import { unflatten } from "./ungron-engine";

/** Output lines rendered at once. Copy output always takes all of them. */
const MAX_RENDERED_LINES = 5000;

const modes: { id: PlaygroundMode; label: string }[] = [
  { id: "flatten", label: "flatten" },
  { id: "search", label: "search" },
  { id: "unflatten", label: "unflatten" },
];

type Outcome = {
  /** Full stdout, for copying. */
  text: string;
  lines: string[];
  /** stderr lines other than the error itself. */
  notes: string[];
  error: string | null;
  /** Heading for the error panel. */
  errorTitle: string;
  /** Shown instead of output when there is nothing to run yet. */
  idle: string | null;
  matched: number | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** Parses a positive integer field; null when empty or invalid. */
function positiveInteger(value: string): number | null {
  return /^[1-9][0-9]{0,8}$/.test(value) ? Number(value) : null;
}

/** The settings the engine runs on: the editor state, deferred while typing. */
type EngineSettings = {
  input: string;
  mode: PlaygroundMode;
  term: string;
  regex: boolean;
  caseSensitive: boolean;
  invert: boolean;
  count: boolean;
  maxCountOn: boolean;
  maxCount: string;
  limitOn: boolean;
  limit: string;
  sort: boolean;
  stream: boolean;
  pretty: boolean;
  tooLarge: boolean;
};

function runEngine(d: EngineSettings): Outcome {
  const empty: Outcome = { text: "", lines: [], notes: [], error: null, errorTitle: "", idle: null, matched: null };
  if (d.tooLarge) {
    return {
      ...empty,
      idle: `The playground runs up to ${formatBytes(MAX_INPUT_BYTES)} in your browser. Install the CLI for bigger files: it streams multi-gigabyte JSON.`,
    };
  }
  if (d.mode === "unflatten") {
    const result = unflatten(d.input, { pretty: d.pretty });
    return {
      ...empty,
      text: result.output,
      lines: result.output === "" ? [] : result.output.replace(/\n$/, "").split("\n"),
      notes: result.messages.slice(1),
      error: result.error,
      errorTitle: result.limitExceeded ? "Too large for the browser" : "Invalid gron",
    };
  }
  if (d.mode === "search" && d.term === "") {
    return { ...empty, idle: "Type a search term to filter the flattened lines." };
  }
  const result =
    d.mode === "flatten"
      ? flatten(d.input, { sort: d.sort, limit: d.limitOn ? positiveInteger(d.limit) : null, stream: d.stream })
      : search(d.input, {
          term: d.term,
          regex: d.regex,
          caseSensitive: d.caseSensitive,
          invert: d.invert,
          count: d.count,
          maxCount: d.maxCountOn ? positiveInteger(d.maxCount) : null,
          sort: d.sort,
          stream: d.stream,
        });
  return {
    ...empty,
    text: stdoutOf(result),
    lines: result.lines,
    notes: result.error === null ? result.messages : result.messages.slice(1),
    error: result.error,
    errorTitle: result.limitExceeded
      ? "Too large for the browser"
      : d.mode === "search" && d.regex
        ? "Invalid JSON or regex"
        : d.stream
          ? "Invalid JSON Lines"
          : "Invalid JSON",
    matched: d.mode === "search" ? result.matched : null,
  };
}

/**
 * Converts the editor text when the mode switches between JSON and gron: JSON to gron for `unflatten`, gron back to
 * JSON otherwise. Returns null, leaving the other editor as it was, when the text is invalid, when it or the result is
 * over the input limit (2 MB of JSON can flatten to far more gron), or when the engine throws, so a mode switch never
 * hangs the tab or takes the page down.
 */
function convertForMode(text: string, target: PlaygroundMode, stream = false): string | null {
  if (utf8ByteLength(text) > MAX_INPUT_BYTES) return null;
  try {
    let converted: string;
    if (target === "unflatten") {
      const flattened = flatten(text, { stream });
      if (flattened.error !== null) return null;
      converted = stdoutOf(flattened);
    } else {
      const rebuilt = unflatten(text, { pretty: true });
      if (rebuilt.error !== null) return null;
      converted = rebuilt.output;
    }
    return utf8ByteLength(converted) > MAX_INPUT_BYTES ? null : converted;
  } catch {
    return null;
  }
}

/** A button that copies text and reports the result in a live region next to it. */
function CopyButton({
  label,
  text,
  onCopied,
}: {
  label: string;
  text: string | null;
  onCopied?: () => void;
}) {
  const [status, setStatus] = useState<"" | "Copied" | "Copy failed">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    if (text === null) return;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus("");
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
    setStatus(ok ? "Copied" : "Copy failed");
    if (ok) onCopied?.();
    timer.current = setTimeout(() => setStatus(""), 2000);
  }

  return (
    <span className={styles.copy}>
      <button
        type="button"
        className={styles.copyButton}
        onClick={copy}
        aria-disabled={text === null}
        data-state={status === "Copied" ? "copied" : status === "Copy failed" ? "failed" : undefined}
      >
        {label}
      </button>
      <span className={styles.copyStatus} role="status">
        {status}
      </span>
    </span>
  );
}

function FlagToggle({
  flag,
  description,
  checked,
  onChange,
}: {
  flag: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.flag} title={description}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <code className={styles.flagName}>{flag}</code>
      <span className={styles.flagDescription}>{description}</span>
    </label>
  );
}

function CountOption({
  flag,
  description,
  enabled,
  value,
  onEnabled,
  onValue,
}: {
  flag: string;
  description: string;
  enabled: boolean;
  value: string;
  onEnabled: (enabled: boolean) => void;
  onValue: (value: string) => void;
}) {
  const id = useId();
  const invalid = enabled && positiveInteger(value) === null;
  return (
    <div className={styles.flag} data-invalid={invalid || undefined}>
      <input
        id={`${id}-on`}
        type="checkbox"
        checked={enabled}
        onChange={(event) => onEnabled(event.target.checked)}
        aria-label={`${flag}: ${description}`}
      />
      <label htmlFor={`${id}-on`}>
        <code className={styles.flagName}>{flag}</code>
      </label>
      <input
        className={styles.countInput}
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={value}
        disabled={!enabled}
        aria-label={`${flag} value`}
        aria-invalid={invalid || undefined}
        onChange={(event) => onValue(event.target.value)}
      />
      <span className={styles.flagDescription}>{description}</span>
    </div>
  );
}

export function Playground() {
  const [sampleId, setSampleId] = useState<SampleId | "custom">("deployment");
  const [jsonInput, setJsonInput] = useState(samples[0].json);
  const [gronInput, setGronInput] = useState("");
  const [mode, setMode] = useState<PlaygroundMode>("flatten");
  const [term, setTerm] = useState(samples[0].term);
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [invert, setInvert] = useState(false);
  const [count, setCount] = useState(false);
  const [maxCountOn, setMaxCountOn] = useState(false);
  const [maxCount, setMaxCount] = useState("3");
  const [limitOn, setLimitOn] = useState(false);
  const [limit, setLimit] = useState("10");
  const [sort, setSort] = useState(false);
  const [stream, setStream] = useState(false);
  const [pretty, setPretty] = useState(false);
  const [runner, setRunner] = useState<Runner>("gronify");

  const sample = samples.find((candidate) => candidate.id === sampleId) ?? null;
  const input = mode === "unflatten" ? gronInput : jsonInput;
  const inputBytes = utf8ByteLength(input);
  const tooLarge = inputBytes > MAX_INPUT_BYTES;

  // Typing stays responsive on large inputs: the engine runs on the deferred values.
  const settings = useMemo(
    () => ({ input, mode, term, regex, caseSensitive, invert, count, maxCountOn, maxCount, limitOn, limit, sort, stream, pretty, tooLarge }),
    [input, mode, term, regex, caseSensitive, invert, count, maxCountOn, maxCount, limitOn, limit, sort, stream, pretty, tooLarge],
  );
  const deferred = useDeferredValue(settings);
  const stale = deferred !== settings;

  const outcome: Outcome = useMemo(() => {
    try {
      return runEngine(deferred);
    } catch (error) {
      // The engines report bad input as results, so this is a bug or a browser limit. Show it in the output panel
      // instead of letting it take the whole page down to the error boundary.
      const message = error instanceof Error ? error.message : String(error);
      return {
        text: "",
        lines: [],
        notes: [],
        error: `The playground could not run this input (${message}). Run the command above with the CLI instead.`,
        errorTitle: "Could not run in the browser",
        idle: null,
        matched: null,
      };
    }
  }, [deferred]);

  const baseFile = sample?.file ?? (stream ? "input.jsonl" : "input.json");
  const file = mode === "unflatten" ? baseFile.replace(/\.(?:json|jsonl|ndjson)$/, ".gron") : baseFile;
  const numbersValid =
    (mode !== "search" || !maxCountOn || positiveInteger(maxCount) !== null) &&
    (mode !== "flatten" || !limitOn || positiveInteger(limit) !== null);
  const commandReady = numbersValid && !(mode === "search" && term === "");
  const command = buildCommand({
    runner,
    mode,
    file,
    term: term === "" ? "<term>" : term,
    regex,
    caseSensitive,
    invert,
    count,
    maxCount: maxCountOn ? positiveInteger(maxCount) ?? 0 : null,
    sort,
    limit: limitOn ? positiveInteger(limit) ?? 0 : null,
    stream,
    pretty,
  });

  function activeFlags(): string[] {
    if (mode === "flatten") return [stream && "--stream", sort && "--sort", limitOn && "--limit"].filter(Boolean) as string[];
    if (mode === "unflatten") return pretty ? ["--pretty"] : [];
    return [
      stream && "--stream",
      regex && "--regex",
      caseSensitive && "-c",
      invert && "-v",
      count && "--count",
      maxCountOn && "-m",
      sort && "--sort",
    ].filter(Boolean) as string[];
  }

  function selectSample(id: string) {
    const next = samples.find((candidate) => candidate.id === id);
    if (!next) return;
    const nextStream = Boolean(next.stream);
    setSampleId(next.id);
    setJsonInput(next.json);
    setTerm(next.term);
    setStream(nextStream);
    // Unflatten mode works on gron, so give it this sample's gron.
    if (mode === "unflatten") {
      const gron = convertForMode(next.json, "unflatten", nextStream);
      if (gron !== null) setGronInput(gron);
    }
    posthog.capture("playground_sample_selected", { sample: next.id, mode });
  }

  function selectMode(next: PlaygroundMode) {
    if (next === mode) return;
    if (next === "unflatten") {
      // Carry the current JSON over as gron, so the round trip is one click.
      const gron = convertForMode(jsonInput, "unflatten", stream);
      if (gron !== null) setGronInput(gron);
    } else if (mode === "unflatten") {
      const json = convertForMode(gronInput, next);
      if (json !== null && json !== jsonInput) {
        setJsonInput(json);
        if (stream) setStream(false);
      }
    }
    setMode(next);
    posthog.capture("playground_mode_changed", { mode: next });
  }

  function editInput(value: string) {
    if (mode === "unflatten") {
      setGronInput(value);
    } else {
      setJsonInput(value);
      if (sampleId !== "custom") setSampleId("custom");
    }
  }

  const outputLabel = mode === "unflatten" ? "JSON output" : mode === "search" && count ? "Match count" : "Gron output";
  const shownLines = outcome.lines.length > MAX_RENDERED_LINES ? outcome.lines.slice(0, MAX_RENDERED_LINES) : outcome.lines;
  const inputId = useId();
  const termId = useId();
  const sampleSelectId = useId();
  const outputHeadingId = useId();

  return (
    <div className={styles.workbench}>
      <div className={styles.toolbar}>
        <fieldset className={styles.modes}>
          <legend className={pageStyles.srOnly}>Command</legend>
          {modes.map((option) => (
            <label key={option.id} className={styles.mode}>
              <input
                type="radio"
                name="playground-mode"
                value={option.id}
                checked={mode === option.id}
                onChange={() => selectMode(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.sampleField}>
          <label htmlFor={sampleSelectId} className={styles.fieldLabel}>
            Sample
          </label>
          <select
            id={sampleSelectId}
            className={styles.select}
            value={sampleId}
            onChange={(event) => selectSample(event.target.value)}
          >
            {sampleId === "custom" && <option value="custom">Your JSON</option>}
            {samples.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.options}>
        {mode === "search" && (
          <>
            <div className={styles.termField}>
              <label htmlFor={termId} className={styles.fieldLabel}>
                Search term {regex ? "(JavaScript regex)" : "(substring)"}
              </label>
              <input
                id={termId}
                className={styles.termInput}
                type="search"
                value={term}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                placeholder={regex ? "e.g. \\d{4}" : "e.g. image"}
                onChange={(event) => setTerm(event.target.value)}
              />
            </div>
            <div className={styles.flags}>
              <FlagToggle flag="--stream" description="JSON Lines (NDJSON)" checked={stream} onChange={setStream} />
              <FlagToggle flag="--regex" description="regex" checked={regex} onChange={setRegex} />
              <FlagToggle flag="-c" description="case-sensitive" checked={caseSensitive} onChange={setCaseSensitive} />
              <FlagToggle flag="-v" description="invert" checked={invert} onChange={setInvert} />
              <FlagToggle flag="--count" description="count only" checked={count} onChange={setCount} />
              <FlagToggle flag="--sort" description="sort keys" checked={sort} onChange={setSort} />
              <CountOption
                flag="-m"
                description="max matches"
                enabled={maxCountOn}
                value={maxCount}
                onEnabled={setMaxCountOn}
                onValue={setMaxCount}
              />
            </div>
          </>
        )}
        {mode === "flatten" && (
          <div className={styles.flags}>
            <FlagToggle flag="--stream" description="JSON Lines (NDJSON)" checked={stream} onChange={setStream} />
            <FlagToggle flag="--sort" description="sort keys (UTF-16 order)" checked={sort} onChange={setSort} />
            <CountOption
              flag="--limit"
              description="max lines"
              enabled={limitOn}
              value={limit}
              onEnabled={setLimitOn}
              onValue={setLimit}
            />
          </div>
        )}
        {mode === "unflatten" && (
          <div className={styles.flags}>
            <FlagToggle flag="--pretty" description="indent the JSON" checked={pretty} onChange={setPretty} />
          </div>
        )}
      </div>

      <div className={styles.commandBar}>
        <div className={styles.commandRunner} role="group" aria-label="Command style">
          {(["gronify", "npx"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={styles.runnerButton}
              aria-pressed={runner === option}
              onClick={() => setRunner(option)}
            >
              {option === "npx" ? "npx" : "installed"}
            </button>
          ))}
        </div>
        <code className={styles.command} aria-label="Equivalent command">
          <span className={styles.prompt} aria-hidden="true">
            ${" "}
          </span>
          {command}
        </code>
        <CopyButton
          label="Copy command"
          text={commandReady ? command : null}
          onCopied={() =>
            posthog.capture("playground_command_copied", {
              mode,
              runner,
              flags: activeFlags(),
              sample: sampleId,
            })
          }
        />
      </div>

      <div className={styles.panes}>
        <section className={styles.pane} aria-labelledby={`${inputId}-label`}>
          <div className={styles.paneHeader}>
            <label id={`${inputId}-label`} htmlFor={inputId} className={styles.paneTitle}>
              {mode === "unflatten" ? "Input gron" : stream ? "Input JSON Lines" : "Input JSON"}
            </label>
            <span className={styles.stat} data-warning={tooLarge || undefined}>
              {formatBytes(inputBytes)} / {formatBytes(MAX_INPUT_BYTES)}
            </span>
          </div>
          <textarea
            id={inputId}
            className={styles.editor}
            value={input}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            wrap="off"
            onChange={(event) => editInput(event.target.value)}
          />
          {sample !== null && mode !== "unflatten" && <p className={styles.paneNote}>{sample.note}</p>}
          {mode === "unflatten" && (
            <p className={styles.paneNote}>
              Lines in document order (what flatten writes) convert in one pass; other orders are rebuilt in memory.
              Filtered lines work too: missing parents are filled in, as they are in the CLI.
            </p>
          )}
        </section>

        <section className={styles.pane} aria-labelledby={outputHeadingId} aria-busy={stale}>
          <div className={styles.paneHeader}>
            <h2 id={outputHeadingId} className={styles.paneTitle}>
              {outputLabel}
            </h2>
            <span className={styles.stats}>
              {outcome.matched !== null && outcome.error === null && outcome.idle === null && (
                <span className={styles.stat}>
                  {plural(outcome.matched, deferred.invert ? "line kept" : "match", deferred.invert ? "lines kept" : "matches")}
                </span>
              )}
              {outcome.error === null && outcome.idle === null && !(deferred.mode === "search" && deferred.count) && (
                <span className={styles.stat}>{plural(outcome.lines.length, "line", "lines")}</span>
              )}
              <CopyButton label="Copy output" text={outcome.text === "" ? null : outcome.text} />
            </span>
          </div>
          <div className={styles.output} data-stale={stale || undefined}>
            {outcome.error !== null ? (
              <div className={styles.error} role="alert">
                <p className={styles.errorTitle}>
                  {outcome.errorTitle}
                </p>
                <code className={styles.errorMessage}>{outcome.error}</code>
              </div>
            ) : outcome.idle !== null ? (
              <p className={styles.idle}>{outcome.idle}</p>
            ) : (
              <pre className={styles.outputText} tabIndex={0} aria-label={outputLabel}>
                <code>{shownLines.join("\n")}</code>
              </pre>
            )}
            {outcome.lines.length > MAX_RENDERED_LINES && outcome.error === null && (
              <p className={styles.paneNote}>
                Showing the first {MAX_RENDERED_LINES.toLocaleString("en-US")} of {outcome.lines.length.toLocaleString("en-US")} lines. Copy output takes them all.
              </p>
            )}
          </div>
          {outcome.notes.length > 0 && (
            <div className={styles.notes} aria-label="Messages the CLI prints to stderr">
              {outcome.notes.map((note) => (
                <code key={note} className={styles.note}>
                  {note}
                </code>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const guideLinks = [
  { href: "/guides/grep-json", label: "How to grep nested JSON from the command line" },
  { href: "/guides/flatten-json", label: "Flatten nested JSON to one line per value" },
  { href: "/guides/unflatten-json", label: "Unflatten gron lines back into JSON" },
  { href: "/guides/large-json-files", label: "Search a multi-gigabyte JSON file" },
];

export function PlaygroundPage() {
  return (
    <GuideShell placement="playground" playgroundCurrent>
      <Section paddingBlockStart="condensed" paddingBlockEnd="spacious">
        <Grid>
          <Grid.Column span={12}>
            <div className={styles.page}>
              <header className={`${pageStyles.guideHeader} ${pageStyles.guideIntro}`}>
                <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Playground" }]} />
                <Heading as="h1" size="2">
                  Flatten and grep JSON online
                </Heading>
                <Text as="p" size="300" variant="muted">
                  Paste JSON to flatten it into <code>json.path = value</code> lines, search those lines with text or a
                  regex, or turn gron back into JSON. It runs the same logic as the Gronify CLI, in your browser: the
                  JSON you paste is never uploaded.
                </Text>
              </header>

              <Playground />

              <div className={styles.about}>
                <section className={pageStyles.guideSection} aria-labelledby="playground-cli">
                  <Heading as="h2" size="5" id="playground-cli">
                    Same output as the CLI
                  </Heading>
                  <Text as="p" size="200" variant="muted">
                    The playground is a browser port of <code>gronify</code> {cliVersion}. The output panel shows what
                    the CLI prints to stdout for the command above, and the notes under it are what it prints to stderr.
                    Numbers stay as written (<code>12345678901234567890</code>, <code>1.10</code>), <code>--sort</code>{" "}
                    orders keys by UTF-16 code unit, <code>--stream</code> reads JSON Lines (NDJSON), and invalid JSON
                    is reported with its byte offset, line, and column.
                  </Text>
                </section>
                <section className={pageStyles.guideSection} aria-labelledby="playground-limits">
                  <Heading as="h2" size="5" id="playground-limits">
                    When to install it instead
                  </Heading>
                  <Text as="p" size="200" variant="muted">
                    The playground takes up to 2 MB. The CLI streams files of any size from disk or a pipe, stops reading
                    early with <code>-m</code> and <code>--limit</code>, and fits in a shell pipeline. Install it with{" "}
                    <code>npm install -g gronify</code>, or run it once with <code>npx gronify</code>.
                  </Text>
                </section>
                <nav className={pageStyles.guideSection} aria-labelledby="playground-guides">
                  <Heading as="h2" size="5" id="playground-guides">
                    Guides
                  </Heading>
                  <ul className={styles.guideList}>
                    {guideLinks.map((link) => (
                      <li key={link.href}>
                        <NextLink className={pageStyles.inlineLink} href={link.href}>
                          {link.label}
                        </NextLink>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
          </Grid.Column>
        </Grid>
      </Section>
    </GuideShell>
  );
}
