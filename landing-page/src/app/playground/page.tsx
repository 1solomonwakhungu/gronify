import type { Metadata, ResolvingMetadata } from "next";

import { serializeJsonLd } from "../guides/json-ld";
import { cliVersion, siteUrl } from "../site-config";
import { PlaygroundPage } from "./playground";
import { playgroundDescription, playgroundTitle } from "./seo";

const url = `${siteUrl}/playground`;

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  // Setting `openGraph` or `twitter` here replaces the root layout's objects
  // whole, so the site-wide share image is carried over from the parent.
  const inherited = await parent;

  return {
    title: { absolute: playgroundTitle },
    description: playgroundDescription,
    keywords: ["flatten JSON online", "grep JSON online", "gron online", "search JSON online", "ungron online", "JSON to gron", "JSON Lines online", "NDJSON online"],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: playgroundTitle,
      description: playgroundDescription,
      siteName: "Gronify",
      locale: "en_US",
      images: inherited.openGraph?.images,
    },
    twitter: {
      card: "summary_large_image",
      title: playgroundTitle,
      description: playgroundDescription,
      images: inherited.twitter?.images,
    },
  };
}

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${url}#app`,
      name: "Gronify JSON playground",
      alternateName: ["Flatten JSON online", "Grep JSON online", "gron online"],
      url,
      description: playgroundDescription,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any (runs in the browser)",
      browserRequirements: "Requires JavaScript",
      softwareVersion: cliVersion,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Flatten JSON into json.path = value lines",
        "Read JSON Lines / NDJSON with --stream",
        "Search flattened JSON by substring or JavaScript regex",
        "Unflatten full or filtered gron lines back into JSON",
        "Sort keys by UTF-16 code unit",
        "Keep big integers and decimals exactly as written",
      ],
      inLanguage: "en",
      isPartOf: { "@id": `${siteUrl}/#website` },
      author: { "@id": `${siteUrl}/#author` },
      about: { "@id": `${siteUrl}/#software` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Playground", item: url },
      ],
    },
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <PlaygroundPage />
    </>
  );
}
