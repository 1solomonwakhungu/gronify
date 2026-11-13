"use client";

import {
  Box,
  Button,
  CTABanner,
  FAQ,
  Grid,
  Heading,
  Section,
  Text,
} from "@primer/react-brand";
import NextLink from "next/link";
import posthog from "posthog-js";
import { Fragment, type ReactNode } from "react";

import styles from "../page.module.css";
import { SiteFooter, SiteHeader } from "../site-chrome";
import { repositoryUrl } from "../site-config";
import { Terminal } from "../terminal";
import {
  guideSlugOf,
  linkTarget,
  parseInline,
  type InlineNode,
} from "./inline";
import type { Guide, GuideBlock, RichText } from "./types";

/** What a page needs to link to another guide. */
export type GuideLink = {
  slug: string;
  title: string;
  description: string;
};

type Crumb = {
  label: string;
  /** Omitted for the current page, which is text rather than a link. */
  href?: string;
};

function renderNodes(
  nodes: InlineNode[],
  linkableSlugs: readonly string[],
): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === "text") {
      return <Fragment key={index}>{node.text}</Fragment>;
    }
    if (node.kind === "code") {
      return (
        <code key={index} className={styles.proseCode}>
          {node.text}
        </code>
      );
    }

    const children = renderNodes(node.children, linkableSlugs);
    const target = linkTarget(node.href);
    if (target === "internal") {
      const slug = guideSlugOf(node.href);
      // The build rejects links to unregistered guides, so this only guards a
      // caller that renders content the validator has not seen.
      if (slug !== null && !linkableSlugs.includes(slug)) {
        return <Fragment key={index}>{children}</Fragment>;
      }
      return (
        <NextLink key={index} className={styles.inlineLink} href={node.href}>
          {children}
        </NextLink>
      );
    }
    return (
      <a key={index} className={styles.inlineLink} href={node.href}>
        {children}
      </a>
    );
  });
}

function Inline({
  text,
  linkableSlugs,
}: {
  text: RichText;
  linkableSlugs: readonly string[];
}) {
  return <>{renderNodes(parseInline(text), linkableSlugs)}</>;
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={styles.breadcrumb}>
        {crumbs.map((crumb) => (
          <li key={crumb.label} className={styles.breadcrumbItem}>
            {crumb.href ? (
              <NextLink className={styles.breadcrumbLink} href={crumb.href}>
                {crumb.label}
              </NextLink>
            ) : (
              <span aria-current="page">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function GuideBlockView({
  block,
  blockId,
  linkableSlugs,
}: {
  block: GuideBlock;
  blockId: string;
  linkableSlugs: readonly string[];
}) {
  switch (block.kind) {
    case "paragraph":
      return (
        <Text as="p" size="200">
          <Inline text={block.text} linkableSlugs={linkableSlugs} />
        </Text>
      );
    case "subheading":
      return (
        <Heading as="h3" size="6" className={styles.guideSubheading}>
          {block.text}
        </Heading>
      );
    case "terminal":
      return <Terminal label={block.label} lines={block.lines} />;
    case "list": {
      const List = block.style === "numbered" ? "ol" : "ul";
      return (
        <List className={styles.proseList}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <Text as="span" size="200">
                <Inline text={item} linkableSlugs={linkableSlugs} />
              </Text>
            </li>
          ))}
        </List>
      );
    }
    case "table": {
      const captionId = `${blockId}-caption`;
      const [firstColumn, ...otherColumns] = block.columns;
      return (
        <figure className={styles.guideFigure}>
          <div
            className={styles.tableScroll}
            role="region"
            aria-labelledby={captionId}
            tabIndex={0}
          >
            <table
              className={`${styles.matrix} ${styles.guideTable}`}
              role="table"
              aria-labelledby={captionId}
            >
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    {firstColumn}
                  </th>
                  {otherColumns.map((column) => (
                    <th key={column} scope="col" role="columnheader">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {block.rows.map(([rowHeader, ...cells], rowIndex) => (
                  <tr key={rowIndex} role="row">
                    <th scope="row" role="rowheader">
                      <Inline text={rowHeader} linkableSlugs={linkableSlugs} />
                    </th>
                    {cells.map((cell, cellIndex) => (
                      <td
                        key={otherColumns[cellIndex]}
                        role="cell"
                        className={styles.matrixCell}
                        data-label={otherColumns[cellIndex]}
                      >
                        <Text as="span" size="200">
                          <Inline text={cell} linkableSlugs={linkableSlugs} />
                        </Text>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <figcaption id={captionId} className={styles.guideCaption}>
            {block.caption}
          </figcaption>
        </figure>
      );
    }
  }
}

/** Header, `<main>`, the closing call to action, and footer for a guides page. */
function GuideShell({
  placement,
  children,
}: {
  /** Reported with the repository click so guides can be told apart. */
  placement: string;
  children: ReactNode;
}) {
  return (
    <>
      <a href="#top" className={styles.skipLink}>
        Skip to main content
      </a>

      <SiteHeader />

      <main id="top">
        <Box paddingBlockStart={64} />

        {children}

        <CTABanner align="center" hasGridLines className={styles.ctaBanner}>
          <CTABanner.Heading as="h2" size="3">
            Try it on your own JSON.
          </CTABanner.Heading>
          <CTABanner.Description>
            Gronify is open source and MIT licensed. Install it with npm or
            Homebrew, or read the source first.
          </CTABanner.Description>
          <CTABanner.ButtonGroup>
            <Button as="a" href="/#install" variant="primary">
              Install Gronify
            </Button>
            <Button
              as="a"
              href={repositoryUrl}
              variant="secondary"
              onClick={() =>
                posthog.capture("repository_link_clicked", { placement })
              }
            >
              View the repository
            </Button>
          </CTABanner.ButtonGroup>
        </CTABanner>
      </main>

      <SiteFooter />
    </>
  );
}

function GuideLinkList({
  links,
  headingLevel,
}: {
  links: GuideLink[];
  /** One level below the heading the list sits under. */
  headingLevel: "h2" | "h3";
}) {
  return (
    <ul className={`${styles.gridFrame} ${styles.guideLinkList}`}>
      {links.map((link) => (
        <li key={link.slug} className={styles.gridCell}>
          <Heading as={headingLevel} size="6">
            <NextLink
              className={styles.inlineLink}
              href={`/guides/${link.slug}`}
            >
              {link.title}
            </NextLink>
          </Heading>
          <Text as="p" variant="muted" size="200">
            {link.description}
          </Text>
        </li>
      ))}
    </ul>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

function formatIsoDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function GuideArticle({
  guide,
  related,
  linkableSlugs,
}: {
  guide: Guide;
  /** The guide's `related` slugs that are registered, already resolved. */
  related: GuideLink[];
  /** Slugs of every registered guide, so inline links never point at a 404. */
  linkableSlugs: readonly string[];
}) {
  return (
    <GuideShell placement={`guide:${guide.slug}`}>
      <Section paddingBlockStart="condensed" paddingBlockEnd="none">
        <Grid>
          <Grid.Column span={12}>
            <div className={styles.guideLayout}>
              <article className={styles.guideMain}>
                <header className={styles.guideHeader}>
                  <Breadcrumb
                    crumbs={[
                      { label: "Home", href: "/" },
                      { label: "Guides", href: "/guides" },
                      { label: guide.h1 },
                    ]}
                  />
                  <Heading as="h1" size="2">
                    {guide.h1}
                  </Heading>
                  <Text as="p" size="300" variant="muted">
                    <Inline text={guide.lede} linkableSlugs={linkableSlugs} />
                  </Text>
                  <Text as="p" size="100" font="monospace" variant="muted">
                    Updated{" "}
                    <time dateTime={guide.updated}>
                      {formatIsoDate(guide.updated)}
                    </time>
                  </Text>
                </header>

                {guide.sections.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    aria-labelledby={`${section.id}-heading`}
                    className={styles.guideSection}
                  >
                    <Heading as="h2" size="5" id={`${section.id}-heading`}>
                      {section.heading}
                    </Heading>
                    {section.blocks.map((block, index) => (
                      <GuideBlockView
                        key={index}
                        block={block}
                        blockId={`${section.id}-${index}`}
                        linkableSlugs={linkableSlugs}
                      />
                    ))}
                  </section>
                ))}
              </article>

              <nav className={styles.guideToc} aria-label="On this page">
                <Text as="p" size="100" font="monospace" variant="muted">
                  On this page
                </Text>
                <ol className={styles.guideTocList}>
                  {guide.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        className={styles.breadcrumbLink}
                        href={`#${section.id}`}
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                  {guide.faqs.length > 0 ? (
                    <li>
                      <a className={styles.breadcrumbLink} href="#faq">
                        Frequently asked questions
                      </a>
                    </li>
                  ) : null}
                </ol>
              </nav>
            </div>
          </Grid.Column>
        </Grid>
      </Section>

      {guide.faqs.length > 0 ? (
        <Box paddingBlockStart={64} paddingBlockEnd={64} id="faq">
          <FAQ variant="gridline">
            <FAQ.Heading
              as="h2"
              size="4"
              align="center"
              className={styles.faqHeading}
            >
              Frequently asked questions
            </FAQ.Heading>
            {guide.faqs.map((faq, index) => (
              <FAQ.Item key={faq.question} open={index === 0} disableAnimation>
                <FAQ.Question as="h3">{faq.question}</FAQ.Question>
                <FAQ.Answer>
                  <Text as="p" variant="muted">
                    <Inline text={faq.answer} linkableSlugs={linkableSlugs} />
                  </Text>
                </FAQ.Answer>
              </FAQ.Item>
            ))}
          </FAQ>
        </Box>
      ) : (
        <Box paddingBlockStart={64} />
      )}

      {related.length > 0 ? (
        <Section
          id="related"
          paddingBlockStart="none"
          paddingBlockEnd="spacious"
        >
          <Grid>
            <Grid.Column span={12}>
              <div className={styles.guideSection}>
                <Heading as="h2" size="5">
                  Related guides
                </Heading>
                <GuideLinkList links={related} headingLevel="h3" />
              </div>
            </Grid.Column>
          </Grid>
        </Section>
      ) : null}
    </GuideShell>
  );
}

export function GuidesIndex({ links }: { links: GuideLink[] }) {
  return (
    <GuideShell placement="guides-index">
      <Section paddingBlockStart="condensed" paddingBlockEnd="spacious">
        <Grid>
          <Grid.Column span={12}>
            <div className={styles.guideMain}>
              <header className={`${styles.guideHeader} ${styles.guideIntro}`}>
                <Breadcrumb
                  crumbs={[{ label: "Home", href: "/" }, { label: "Guides" }]}
                />
                <Heading as="h1" size="2">
                  Guides for working with JSON in the terminal
                </Heading>
                <Text as="p" size="300" variant="muted">
                  Each guide starts from one question, answers it, and shows the
                  commands with their real output.
                </Text>
              </header>
              <GuideLinkList links={links} headingLevel="h2" />
            </div>
          </Grid.Column>
        </Grid>
      </Section>
    </GuideShell>
  );
}
