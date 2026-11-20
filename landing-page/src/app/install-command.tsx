"use client";

import posthog from "posthog-js";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { CopyButton } from "./copy-button";
import styles from "./page.module.css";

const installMethods = [
  { id: "npm", label: "npm", command: "npm install -g gronify" },
  { id: "npx", label: "npx", command: "npx gronify --help" },
  {
    id: "brew",
    label: "Homebrew",
    command: "brew install 1solomonwakhungu/tap/gronify",
  },
] as const;

type InstallMethod = (typeof installMethods)[number]["id"];

/**
 * One-line install command with an npm / npx / Homebrew switch and a copy
 * button. The switch follows the WAI-ARIA tabs pattern: one tab stop, arrow
 * keys move between methods, and the command below is the tab panel.
 */
export function HeroInstallCommand() {
  const [selected, setSelected] = useState<InstallMethod>("npm");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const tabId = (method: InstallMethod) => `${baseId}-tab-${method}`;

  const active =
    installMethods.find((method) => method.id === selected) ??
    installMethods[0];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = installMethods.findIndex((m) => m.id === selected);
    const last = installMethods.length - 1;
    const next =
      event.key === "ArrowRight"
        ? current === last
          ? 0
          : current + 1
        : event.key === "ArrowLeft"
          ? current === 0
            ? last
            : current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next === -1) {
      return;
    }
    event.preventDefault();
    setSelected(installMethods[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={styles.installBar}>
      <div
        className={styles.installTabs}
        role="tablist"
        aria-label="Install method"
        onKeyDown={handleKeyDown}
      >
        {installMethods.map((method, index) => {
          const isActive = method.id === selected;
          return (
            <button
              key={method.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={tabId(method.id)}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              className={styles.installTab}
              onClick={() => setSelected(method.id)}
            >
              {method.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(active.id)}
        className={styles.installCommand}
      >
        <code className={styles.installCommandText}>
          <span className={styles.terminalPrompt} aria-hidden="true">
            ${" "}
          </span>
          {active.command}
        </code>
        <CopyButton
          text={active.command}
          label={`Copy ${active.label} install command`}
          onCopied={() =>
            posthog.capture("install_command_copied", {
              method: active.id,
              placement: "hero",
            })
          }
        />
      </div>
    </div>
  );
}
