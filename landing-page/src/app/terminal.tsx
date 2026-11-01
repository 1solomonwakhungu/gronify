import styles from "./page.module.css";

export type TerminalLine = {
  kind: "command" | "output";
  text: string;
};

export function Terminal({
  lines,
  label,
  className,
}: {
  lines: TerminalLine[];
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`${styles.terminal} ${className ?? ""}`}
      role="figure"
      aria-label={label}
    >
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
                ${" "}
              </span>
              {line.text}
            </>
          ) : (
            line.text
          )}
        </code>
      ))}
    </div>
  );
}
