import type { MetadataRoute } from "next";
import { lastReleaseIsoDate, siteUrl } from "./seo-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(lastReleaseIsoDate);

  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/llms.txt`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/llms-full.txt`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
