"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

type CopyState = "idle" | "copied" | "failed";

/** How long the check mark and the "Copied" announcement stay up. */
const FEEDBACK_MS = 2000;

/**
 * Writes text to the clipboard. The async Clipboard API needs a secure context
 * and a focused document; when it is missing or refuses, fall back to a hidden
 * textarea and `execCommand("copy")`, which older and embedded browsers still
 * honour inside a click handler.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: try the fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width="16"
      height="16"
    >
      <path
        fill="currentColor"
        d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
      />
      <path
        fill="currentColor"
        d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width="16"
      height="16"
    >
      <path
        fill="currentColor"
        d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
      />
    </svg>
  );
}

/**
 * Icon button that copies `text` and confirms with a check mark plus a polite
 * screen-reader announcement. `onCopied` runs only after a successful write,
 * so analytics count real copies, not clicks.
 */
export function CopyButton({
  text,
  label,
  onCopied,
  className,
}: {
  text: string;
  /** Accessible name, e.g. "Copy commands". */
  label: string;
  onCopied?: () => void;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleClick = async () => {
    const copied = await writeClipboard(text);
    setState(copied ? "copied" : "failed");
    if (copied) {
      onCopied?.();
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
  };

  const announcement =
    state === "copied"
      ? "Copied to clipboard"
      : state === "failed"
        ? "Copy failed. Select the text and copy it manually."
        : "";

  return (
    <>
      <button
        type="button"
        className={`${styles.copyButton} ${className ?? ""}`}
        data-state={state}
        aria-label={label}
        title={state === "copied" ? "Copied" : label}
        onClick={handleClick}
      >
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
