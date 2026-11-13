/**
 * The content model for one page under /guides/<slug>.
 *
 * A guide is data, not JSX. The template in `guide-article.tsx` decides every
 * tag, class, and heading level, so a guide cannot drift from the design
 * system. To add a guide: create `content/<slug>.ts` exporting a `Guide`, then
 * add one import line and one array line to `registry.ts`. `content/grep-json.ts`
 * is the reference example.
 *
 * `validate.ts` checks every guide when the site builds. A broken rule (title
 * too long, duplicate section id, malformed inline markup, ...) fails
 * `npm run build` with a message that names the guide and the field.
 */
import type { TerminalLine } from "../terminal";

export type { TerminalLine };

/**
 * Prose with two inline marks, written as an ordinary string:
 *
 *   `code`          inline code. The text between the backticks is literal. It
 *                   cannot contain a backtick or a line break.
 *   [label](href)   a link. `href` must start with "/" (a page on this site,
 *                   such as "/guides/flatten-json" or "/#install"), "#" (a
 *                   section id on the same page), or "https://" (external).
 *                   The label may contain `code` but not "]".
 *
 * Nothing else is parsed: no bold, italics, headings, images, or HTML. Write a
 * path with brackets, such as `json.orders[2]`, inside backticks so it is not
 * read as a link.
 *
 * A link to "/guides/<slug>" whose guide is not in the registry yet renders as
 * plain text and becomes a link once that guide lands, so guides may link to
 * each other before both exist.
 *
 * `plainText()` in `inline.ts` strips the marks. JSON-LD uses that form.
 */
export type RichText = string;

/** A paragraph of body copy. */
export type ParagraphBlock = {
  kind: "paragraph";
  text: RichText;
};

/** An `<h3>` inside a section. Plain text, sentence case, no trailing period. */
export type SubheadingBlock = {
  kind: "subheading";
  text: string;
};

/**
 * A terminal transcript, rendered with the shared `Terminal` component.
 *
 * Every command and every output line must be copied from a real run of the
 * built CLI. Build `lines` with the `transcript` tag below, or write the
 * `TerminalLine` objects by hand.
 */
export type TerminalBlock = {
  kind: "terminal";
  /** Accessible name of the figure: one phrase saying what the transcript shows. */
  label: string;
  lines: TerminalLine[];
};

/** A bulleted or numbered list. Use "numbered" only when the order matters. */
export type ListBlock = {
  kind: "list";
  style: "bullet" | "numbered";
  items: RichText[];
};

/**
 * A comparison table. `columns` is the header row. Every row needs exactly one
 * cell per column, and the first cell of a row is its row header. Below 768px
 * each row stacks into a labelled record, so keep cells to a phrase or one
 * short sentence.
 */
export type TableBlock = {
  kind: "table";
  /** Shown under the table and used as its accessible name. */
  caption: string;
  columns: string[];
  rows: RichText[][];
};

export type GuideBlock =
  | ParagraphBlock
  | SubheadingBlock
  | TerminalBlock
  | ListBlock
  | TableBlock;

export type GuideSection = {
  /**
   * Anchor id: lowercase kebab-case, unique within the guide. "top", "faq",
   * and "related" are taken by the template.
   */
  id: string;
  /** The section's `<h2>`. Plain text, sentence case. */
  heading: string;
  /** At least one block, in reading order. */
  blocks: GuideBlock[];
};

export type GuideFaq = {
  /** Plain text, phrased the way someone would type it into a search box. */
  question: string;
  /** One short paragraph. Inline code and links are allowed. */
  answer: RichText;
};

export type Guide = {
  /**
   * URL segment under /guides/. Lowercase kebab-case, and the same as the
   * content file name: `content/grep-json.ts` has slug "grep-json".
   */
  slug: string;
  /**
   * The full `<title>` text, at most 60 characters. Nothing is appended, so
   * include "Gronify" here only if you want it in the title.
   */
  title: string;
  /**
   * Meta description, 140 to 160 characters, plain text. It is also the
   * one-line summary on /guides and in "Related guides" lists.
   */
  description: string;
  /** The page's only `<h1>`. Plain text. It may differ from `title`. */
  h1: string;
  /** The opening paragraph. Answer the search query in its first two sentences. */
  lede: RichText;
  /** First publication date, ISO `YYYY-MM-DD`. */
  published: string;
  /**
   * Date of the last meaningful change, ISO `YYYY-MM-DD`, never earlier than
   * `published`. Feeds the visible date, the sitemap, and `dateModified`.
   */
  updated: string;
  /** The body, in reading order. At least one section. */
  sections: GuideSection[];
  /** Rendered after the sections and emitted as FAQPage JSON-LD. May be empty. */
  faqs: GuideFaq[];
  /**
   * Slugs of other guides to list under "Related guides", most relevant first.
   * A slug that is not in the registry yet is skipped without an error.
   */
  related: string[];
};

/**
 * Builds the `lines` of a terminal block from a pasted terminal session:
 *
 *   lines: transcript`
 *   $ gronify search orders.json --regex "orders\[[0-9]+\]\.id"
 *   json.orders[0].id = 1001
 *   `
 *
 * A line that starts with "$ " is a command; every other line is output. Blank
 * lines are dropped. The text is taken raw, so backslashes and quotes need no
 * escaping. Two things cannot appear inside the template: a backtick and
 * "${". For a transcript that needs either, write the `TerminalLine` objects
 * by hand.
 */
export function transcript(
  strings: TemplateStringsArray,
  ...values: unknown[]
): TerminalLine[] {
  if (values.length > 0) {
    throw new Error(
      "transcript`...` does not take ${} interpolation; write the TerminalLine objects by hand instead",
    );
  }

  return strings.raw[0]
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .map((line) =>
      line.startsWith("$ ")
        ? { kind: "command" as const, text: line.slice(2) }
        : { kind: "output" as const, text: line },
    );
}
