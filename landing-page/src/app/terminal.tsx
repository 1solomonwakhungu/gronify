"use client";

import posthog from "posthog-js";

import { CopyButton } from "./copy-button";
import styles from "./page.module.css";

export type TerminalLine = {
  kind: "command" | "output";
  text: string;
};

export function Terminal({
  lines,
  label,
  className,
  prompt = "$",
}: {
  lines: TerminalLine[];
  label: string;
  className?: string;
  /** Shown before each command line. Defaults to a POSIX shell's "$". */
  prompt?: string;
}) {
  // Only what a reader would paste into a shell: the command lines, without
  // the `$ ` prompt (which is rendered separately and never part of `text`).
  const commands = lines
    .filter((line) => line.kind === "command")
    .map((line) => line.text);
  const canCopy = commands.length > 0;

  return (
    <div
      className={`${styles.terminal} ${canCopy ? styles.terminalCopyable : ""} ${className ?? ""}`}
      role="figure"
      aria-label={label}
    >
      <div className={styles.terminalBody}>
        {lines.map((line, index) => (
          <code
            key={`${index}-${line.text}`}
            className={`${styles.terminalLine} ${
              line.kind === "command" ? "" : styles.terminalPath
            }`}
          >
            {line.kind === "command" ? (
              <>
                <span className={styles.terminalPrompt} aria-hidden="true">
                  {prompt}{" "}
                </span>
                {line.text}
              </>
            ) : (
              line.text
            )}
          </code>
        ))}
      </div>
      {canCopy ? (
        <CopyButton
          text={commands.join("\n")}
          label={commands.length === 1 ? "Copy command" : "Copy commands"}
          className={styles.terminalCopy}
          onCopied={() =>
            posthog.capture("command_copied", {
              terminal: label,
              command_count: commands.length,
            })
          }
        />
      ) : null}
    </div>
  );
}
