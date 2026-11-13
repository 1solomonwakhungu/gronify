import type { RichText } from "./types";

/** One piece of parsed `RichText`. See `RichText` in `types.ts` for the syntax. */
export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: InlineNode[] };

const codePattern = "`([^`\\n]+)`";
const linkPattern = "\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)";

function parse(text: string, allowLinks: boolean): InlineNode[] {
  const pattern = new RegExp(
    allowLinks ? `${codePattern}|${linkPattern}` : codePattern,
    "g",
  );
  const nodes: InlineNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) {
      nodes.push({ kind: "text", text: text.slice(cursor, match.index) });
    }
    if (match[1] !== undefined) {
      nodes.push({ kind: "code", text: match[1] });
    } else {
      nodes.push({
        kind: "link",
        href: match[3],
        children: parse(match[2], false),
      });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push({ kind: "text", text: text.slice(cursor) });
  }
  return nodes;
}

/** Splits `RichText` into text, code, and link nodes. */
export function parseInline(text: RichText): InlineNode[] {
  return parse(text, true);
}

function nodesToText(nodes: InlineNode[]): string {
  return nodes
    .map((node) =>
      node.kind === "link" ? nodesToText(node.children) : node.text,
    )
    .join("");
}

/** `RichText` without its marks: code keeps its text, a link keeps its label. */
export function plainText(text: RichText): string {
  return nodesToText(parseInline(text));
}

/** Where a link points: this site, a section of the same page, or elsewhere. */
export function linkTarget(href: string): "internal" | "anchor" | "external" {
  if (href.startsWith("#")) return "anchor";
  return href.startsWith("/") ? "internal" : "external";
}

/** The guide slug an internal href points at, or null for any other href. */
export function guideSlugOf(href: string): string | null {
  return /^\/guides\/([^/#?]+)/.exec(href)?.[1] ?? null;
}

/** Markdown bold or an HTML tag: neither is parsed, so both would render literally. */
const unsupportedMarkupPattern = /\*\*|<\/?[a-z][a-z0-9]*[\s>/]/i;

/** Marks that must not appear in a plain-text field such as a heading. */
export function plainTextProblems(text: string): string[] {
  return /`|\]\(/.test(text) || unsupportedMarkupPattern.test(text)
    ? ["is plain text; no backticks, [label](href), **bold**, or HTML tags"]
    : [];
}

/** Every href linked from a `RichText` string, in order. */
export function linkHrefs(text: RichText): string[] {
  return parseInline(text).flatMap((node) =>
    node.kind === "link" ? [node.href] : [],
  );
}

function textProblems(nodes: InlineNode[]): string[] {
  const problems: string[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      if (node.text.includes("`")) {
        problems.push("has an unpaired backtick");
      }
      if (node.text.includes("](")) {
        problems.push(
          'has a malformed link; use [label](href) with no "]" in the label and no space in the href',
        );
      }
      if (unsupportedMarkupPattern.test(node.text)) {
        problems.push(
          "has Markdown bold or an HTML tag; only `code` and [label](href) are parsed",
        );
      }
    } else if (node.kind === "link") {
      if (/[()]/.test(node.href)) {
        problems.push(
          `links to "${node.href}", which contains a parenthesis; write %28 or %29`,
        );
      }
      if (!/^(?:\/(?!\/)|#[a-z0-9]|https:\/\/)/.test(node.href)) {
        problems.push(
          `links to "${node.href}"; an href must start with "/", "#", or "https://" (put bracketed paths in backticks)`,
        );
      }
      problems.push(...textProblems(node.children));
    }
  }
  return problems;
}

/** Markup mistakes in a `RichText` string, as messages. Empty when it is valid. */
export function inlineProblems(text: RichText): string[] {
  return textProblems(parseInline(text));
}
