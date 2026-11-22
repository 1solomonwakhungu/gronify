"use client";

import { Button, Link, Stack, Text } from "@primer/react-brand";
import NextLink from "next/link";
import posthog from "posthog-js";

import { GronifyLogo } from "./logo";
import styles from "./page.module.css";
import { npmPackageUrl, repositoryUrl, skillsUrl } from "./site-config";

const navSections = [
  { id: "workflow", label: "Workflow" },
  { id: "compare", label: "Compare" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "agents", label: "Agents" },
  { id: "commands", label: "Commands" },
  { id: "install", label: "Install" },
];

type ChromeProps = {
  /**
   * Set only by the home page, where section links are same-page anchors
   * (`#workflow`). Every other page links back to the home page (`/#workflow`).
   */
  onHome?: boolean;
};

type HeaderProps = ChromeProps & {
  /**
   * `aria-current` for the Guides link: "page" on the `/guides` index, "true"
   * on a single guide, which sits inside that section.
   */
  guidesCurrent?: "page" | "true";
  /** Set on /playground, so its link carries `aria-current="page"`. */
  playgroundCurrent?: boolean;
};

export function SiteHeader({
  onHome = false,
  guidesCurrent,
  playgroundCurrent = false,
}: HeaderProps) {
  return (
    <header className={styles.navBar}>
      <div className={styles.navBarInner}>
        {onHome ? (
          <a className={styles.wordmark} href="#top" aria-label="Gronify, home">
            <GronifyLogo height={18} decorative />
            <span className={styles.wordmarkText}>Gronify</span>
          </a>
        ) : (
          <NextLink
            className={styles.wordmark}
            href="/"
            aria-label="Gronify, home"
          >
            <GronifyLogo height={18} decorative />
            <span className={styles.wordmarkText}>Gronify</span>
          </NextLink>
        )}
        <nav className={styles.navLinks} aria-label="Main">
          {/* Section links need room, so they appear from 48rem up. Guides and
              Playground are pages of their own and stay visible at every width. */}
          {navSections.map((section) =>
            onHome ? (
              <a
                key={section.id}
                className={`${styles.navLink} ${styles.navSectionLink}`}
                href={`#${section.id}`}
              >
                {section.label}
              </a>
            ) : (
              <NextLink
                key={section.id}
                className={`${styles.navLink} ${styles.navSectionLink}`}
                href={`/#${section.id}`}
              >
                {section.label}
              </NextLink>
            ),
          )}
          <NextLink
            className={styles.navLink}
            href="/guides"
            aria-current={guidesCurrent}
            onClick={() =>
              posthog.capture("guides_link_clicked", { placement: "header" })
            }
          >
            Guides
          </NextLink>
          <NextLink
            className={styles.navLink}
            href="/playground"
            aria-current={playgroundCurrent ? "page" : undefined}
            onClick={() =>
              posthog.capture("playground_link_clicked", {
                placement: "header",
              })
            }
          >
            Playground
          </NextLink>
        </nav>
        <Button
          as="a"
          href={repositoryUrl}
          variant="secondary"
          size="small"
          onClick={() =>
            posthog.capture("repository_link_clicked", { placement: "header" })
          }
        >
          <span className={styles.navButtonLong}>View on </span>GitHub
        </Button>
      </div>
    </header>
  );
}

export function SiteFooter({ onHome = false }: ChromeProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <GronifyLogo height={18} decorative />
          <Text as="p" size="200" variant="muted">
            Gronify flattens, searches, and unflattens JSON from the command
            line. MIT licensed.
          </Text>
        </div>
        <Stack
          direction="horizontal"
          gap="normal"
          padding="none"
          flexWrap="wrap"
        >
          <Link
            href={onHome ? "#faq" : "/#faq"}
            size="small"
            arrowDirection="none"
          >
            FAQ
          </Link>
          <Link href="/playground" size="small" arrowDirection="none">
            Playground
          </Link>
          <Link href="/guides" size="small" arrowDirection="none">
            Guides
          </Link>
          <Link
            href={repositoryUrl}
            size="small"
            arrowDirection="none"
            onClick={() =>
              posthog.capture("repository_link_clicked", {
                placement: "footer",
              })
            }
          >
            Repository
          </Link>
          <Link href={npmPackageUrl} size="small" arrowDirection="none">
            npm
          </Link>
          <Link
            href={skillsUrl}
            size="small"
            arrowDirection="none"
            onClick={() =>
              posthog.capture("skill_link_clicked", { placement: "footer" })
            }
          >
            Agent Skills
          </Link>
          <Link
            href={`${repositoryUrl}/issues`}
            size="small"
            arrowDirection="none"
          >
            Issues
          </Link>
          <Link
            href={`${repositoryUrl}/security`}
            size="small"
            arrowDirection="none"
          >
            Security
          </Link>
          <Link
            href={`${repositoryUrl}/blob/main/LICENSE`}
            size="small"
            arrowDirection="none"
          >
            MIT License
          </Link>
          <Link href="/llms.txt" size="small" arrowDirection="none">
            llms.txt
          </Link>
          <Link href="/llms-full.txt" size="small" arrowDirection="none">
            llms-full.txt
          </Link>
        </Stack>
      </div>
    </footer>
  );
}
