import { compareJsonFiles } from "./content/compare-json-files";
import { findJsonPath } from "./content/find-json-path";
import { flattenJson } from "./content/flatten-json";
import { grepJson } from "./content/grep-json";
import { gronAlternative } from "./content/gron-alternative";
import { jqAlternative } from "./content/jq-alternative";
import { jsonForAiAgents } from "./content/json-for-ai-agents";
import { jsonNumberPrecision } from "./content/json-number-precision";
import { unflattenJson } from "./content/unflatten-json";
import type { Guide } from "./types";
import { validateGuides } from "./validate";

/**
 * Every published guide, in the order /guides lists them. To publish a guide,
 * add its import above and one line to this array. Nothing else needs editing:
 * routes, the sitemap, and the index read this list.
 */
export const guides: Guide[] = validateGuides([
  // One guide per line, in index order.
  grepJson,
  flattenJson,
  findJsonPath,
  unflattenJson,
  compareJsonFiles,
  gronAlternative,
  jqAlternative,
  jsonNumberPrecision,
  jsonForAiAgents,
]);

const guidesBySlug = new Map(guides.map((guide) => [guide.slug, guide]));

/** The guide with this slug, or undefined when it is not registered. */
export function getGuide(slug: string): Guide | undefined {
  return guidesBySlug.get(slug);
}

/**
 * The registered guides for a `related` list, in the order given. Slugs with
 * no registered guide are skipped, so a guide may name ones that land later.
 */
export function getRelatedGuides(guide: Guide): Guide[] {
  return guide.related.flatMap((slug) => guidesBySlug.get(slug) ?? []);
}
