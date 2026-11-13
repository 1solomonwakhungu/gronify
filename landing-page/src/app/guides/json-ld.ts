import { siteUrl } from "../site-config";
import { plainText } from "./inline";
import type { Guide } from "./types";

export const guidesIndexUrl = `${siteUrl}/guides`;

export function guideUrl(slug: string): string {
  return `${guidesIndexUrl}/${slug}`;
}

type Crumb = { name: string; url: string };

function breadcrumbList(id: string, crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

const homeCrumb: Crumb = { name: "Home", url: siteUrl };
const guidesCrumb: Crumb = { name: "Guides", url: guidesIndexUrl };

/**
 * Structured data for one guide: the article, its breadcrumb trail, and its
 * FAQ when it has one. The author, software, and website nodes it points at
 * are defined once in the root layout.
 */
export function guideStructuredData(guide: Guide) {
  const url = guideUrl(guide.slug);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${url}#article`,
        headline: guide.h1,
        description: guide.description,
        url,
        image: `${siteUrl}/opengraph-image`,
        datePublished: guide.published,
        dateModified: guide.updated,
        inLanguage: "en",
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        isPartOf: { "@id": `${siteUrl}/#website` },
        author: { "@id": `${siteUrl}/#author` },
        publisher: { "@id": `${siteUrl}/#author` },
        about: { "@id": `${siteUrl}/#software` },
      },
      breadcrumbList(`${url}#breadcrumb`, [
        homeCrumb,
        guidesCrumb,
        { name: guide.h1, url },
      ]),
      ...(guide.faqs.length > 0
        ? [
            {
              "@type": "FAQPage",
              "@id": `${url}#faq`,
              url,
              inLanguage: "en",
              mainEntity: guide.faqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: plainText(faq.answer),
                },
              })),
            },
          ]
        : []),
    ],
  };
}

/** Structured data for /guides: the collection page and its breadcrumb trail. */
export function guidesIndexStructuredData(
  name: string,
  description: string,
  guides: Guide[],
) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${guidesIndexUrl}#collection`,
        url: guidesIndexUrl,
        name,
        description,
        inLanguage: "en",
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#software` },
        hasPart: guides.map((guide) => ({
          "@type": "TechArticle",
          "@id": `${guideUrl(guide.slug)}#article`,
          headline: guide.h1,
          url: guideUrl(guide.slug),
        })),
      },
      breadcrumbList(`${guidesIndexUrl}#breadcrumb`, [homeCrumb, guidesCrumb]),
    ],
  };
}

/** Serializes JSON-LD for a `<script>` tag, escaping "<" as the root layout does. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
