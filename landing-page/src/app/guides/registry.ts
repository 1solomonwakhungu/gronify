import { grepJson } from "./content/grep-json";
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
