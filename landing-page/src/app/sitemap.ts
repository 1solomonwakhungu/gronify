import type { MetadataRoute } from "next";
import { guides } from "./guides/registry";
import { lastReleaseIsoDate, siteUrl } from "./site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  // The index changes whenever a guide does, so it takes the newest guide date.
  const guidesLastModified = guides
    .map((guide) => guide.updated)
    .reduce((latest, updated) => (updated > latest ? updated : latest), "");

  return [
    {
      url: siteUrl,
      lastModified: new Date(lastReleaseIsoDate),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/guides`,
      lastModified: new Date(guidesLastModified || lastReleaseIsoDate),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...guides.map((guide) => ({
      url: `${siteUrl}/guides/${guide.slug}`,
      lastModified: new Date(guide.updated),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
