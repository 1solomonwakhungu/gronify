import { inlineProblems, linkHrefs, plainTextProblems } from "./inline";
import type { Guide, GuideBlock, RichText } from "./types";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const reservedSectionIds = new Set(["top", "faq", "related"]);

export const titleMaxLength = 60;
export const descriptionMinLength = 140;
export const descriptionMaxLength = 160;

function isIsoDate(value: string): boolean {
  return (
    isoDatePattern.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function guideProblems(guide: Guide, registered: Set<string>): string[] {
  const problems: string[] = [];
  const report = (field: string, message: string) =>
    problems.push(`${field} ${message}`);
  const requireText = (field: string, value: string) => {
    if (value.trim() === "") report(field, "is empty");
    if (value !== value.trim()) report(field, "has leading or trailing space");
  };
  const requirePlainText = (field: string, value: string) => {
    requireText(field, value);
    for (const problem of plainTextProblems(value)) report(field, problem);
  };
  const anchorLinks: { field: string; id: string }[] = [];
  const checkRichText = (field: string, value: RichText) => {
    requireText(field, value);
    for (const problem of inlineProblems(value)) report(field, problem);
    for (const href of linkHrefs(value)) {
      if (href.startsWith("#")) anchorLinks.push({ field, id: href.slice(1) });
      if (href.startsWith("/")) {
        // The site has three kinds of page: the home page, /guides, and a guide.
        const page = /^\/(?:guides(?:\/([^/#?]+))?)?(?:#[a-z0-9-]+)?$/.exec(
          href,
        );
        if (page === null) {
          report(field, `links to "${href}", which is not a page on this site`);
        } else if (page[1] !== undefined && !registered.has(page[1])) {
          report(field, `links to "${href}", which is not a registered guide`);
        }
      }
    }
  };

  if (!slugPattern.test(guide.slug)) {
    report("slug", `"${guide.slug}" must be lowercase kebab-case`);
  }

  requirePlainText("title", guide.title);
  if (guide.title.length > titleMaxLength) {
    report(
      "title",
      `is ${guide.title.length} characters; the limit is ${titleMaxLength}`,
    );
  }

  requirePlainText("description", guide.description);
  if (
    guide.description.length < descriptionMinLength ||
    guide.description.length > descriptionMaxLength
  ) {
    report(
      "description",
      `is ${guide.description.length} characters; it must be ${descriptionMinLength} to ${descriptionMaxLength}`,
    );
  }

  requirePlainText("h1", guide.h1);
  checkRichText("lede", guide.lede);

  for (const field of ["published", "updated"] as const) {
    if (!isIsoDate(guide[field])) {
      report(field, `"${guide[field]}" is not a YYYY-MM-DD date`);
    }
  }
  if (
    isIsoDate(guide.published) &&
    isIsoDate(guide.updated) &&
    guide.updated < guide.published
  ) {
    report("updated", "is earlier than published");
  }

  if (guide.sections.length === 0) report("sections", "is empty");
  const sectionIds = new Set<string>();
  guide.sections.forEach((section, sectionIndex) => {
    const at = `sections[${sectionIndex}]`;
    if (!slugPattern.test(section.id)) {
      report(`${at}.id`, `"${section.id}" must be lowercase kebab-case`);
    }
    if (reservedSectionIds.has(section.id)) {
      report(`${at}.id`, `"${section.id}" is reserved by the template`);
    }
    if (sectionIds.has(section.id)) {
      report(`${at}.id`, `"${section.id}" is used twice`);
    }
    sectionIds.add(section.id);
    requirePlainText(`${at}.heading`, section.heading);
    if (section.blocks.length === 0) report(`${at}.blocks`, "is empty");

    section.blocks.forEach((block: GuideBlock, blockIndex) => {
      const field = `${at}.blocks[${blockIndex}]`;
      switch (block.kind) {
        case "paragraph":
          checkRichText(`${field}.text`, block.text);
          break;
        case "subheading":
          requirePlainText(`${field}.text`, block.text);
          break;
        case "terminal":
          requirePlainText(`${field}.label`, block.label);
          if (block.lines.length === 0) report(`${field}.lines`, "is empty");
          block.lines.forEach((line, lineIndex) => {
            if (line.text.trim() === "") {
              report(`${field}.lines[${lineIndex}]`, "is empty");
            }
          });
          break;
        case "list":
          if (block.items.length === 0) report(`${field}.items`, "is empty");
          block.items.forEach((item, itemIndex) =>
            checkRichText(`${field}.items[${itemIndex}]`, item),
          );
          break;
        case "table":
          requirePlainText(`${field}.caption`, block.caption);
          if (block.columns.length < 2) {
            report(`${field}.columns`, "needs at least two columns");
          }
          block.columns.forEach((column, columnIndex) =>
            requirePlainText(`${field}.columns[${columnIndex}]`, column),
          );
          if (new Set(block.columns).size !== block.columns.length) {
            report(`${field}.columns`, "names a column twice");
          }
          if (block.rows.length === 0) report(`${field}.rows`, "is empty");
          block.rows.forEach((row, rowIndex) => {
            if (row.length !== block.columns.length) {
              report(
                `${field}.rows[${rowIndex}]`,
                `has ${row.length} cells for ${block.columns.length} columns`,
              );
            }
            row.forEach((cell, cellIndex) =>
              checkRichText(`${field}.rows[${rowIndex}][${cellIndex}]`, cell),
            );
          });
          break;
        default: {
          const unknown: never = block;
          report(field, `has an unknown kind: ${JSON.stringify(unknown)}`);
        }
      }
    });
  });

  const questions = new Set<string>();
  guide.faqs.forEach((faq, faqIndex) => {
    requirePlainText(`faqs[${faqIndex}].question`, faq.question);
    checkRichText(`faqs[${faqIndex}].answer`, faq.answer);
    if (questions.has(faq.question)) {
      report(`faqs[${faqIndex}].question`, "is used twice");
    }
    questions.add(faq.question);
  });

  const related = new Set<string>();
  guide.related.forEach((slug, relatedIndex) => {
    const field = `related[${relatedIndex}]`;
    if (!slugPattern.test(slug)) {
      report(field, `"${slug}" must be lowercase kebab-case`);
    }
    if (slug === guide.slug) report(field, "points at the guide itself");
    if (!registered.has(slug)) {
      report(field, `"${slug}" is not a registered guide`);
    }
    if (related.has(slug)) report(field, `"${slug}" is listed twice`);
    related.add(slug);
  });

  // A same-page link must land on a section of this guide or a template anchor.
  for (const { field, id } of anchorLinks) {
    if (!sectionIds.has(id) && !reservedSectionIds.has(id)) {
      report(
        field,
        `links to "#${id}", which is not a section id of this guide`,
      );
    }
  }

  return problems;
}

/**
 * Checks every guide against the rules documented in `types.ts` and returns the
 * list unchanged. Throws one error that lists every problem, so a bad guide
 * stops `npm run build` instead of shipping a broken page.
 */
export function validateGuides(guides: Guide[]): Guide[] {
  const problems: string[] = [];
  const slugs = new Set<string>();
  const registered = new Set(guides.map((guide) => guide.slug));
  const uniqueFields = {
    title: new Map<string, string>(),
    h1: new Map<string, string>(),
    description: new Map<string, string>(),
  };

  for (const guide of guides) {
    const file = `guides/content/${guide.slug}.ts`;
    if (slugs.has(guide.slug)) {
      problems.push(`${file}: slug "${guide.slug}" is registered twice`);
    }
    slugs.add(guide.slug);
    for (const problem of guideProblems(guide, registered)) {
      problems.push(`${file}: ${problem}`);
    }
    // Two pages with the same title, h1, or description compete for one query.
    for (const field of ["title", "h1", "description"] as const) {
      const seenIn = uniqueFields[field].get(guide[field]);
      if (seenIn !== undefined) {
        problems.push(`${file}: ${field} is the same as in ${seenIn}`);
      }
      uniqueFields[field].set(guide[field], file);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid guide content:\n- ${problems.join("\n- ")}`);
  }
  return guides;
}
