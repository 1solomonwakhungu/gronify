import type { Metadata, ResolvingMetadata } from "next";

import { GuidesIndex } from "./guide-article";
import {
  guidesIndexStructuredData,
  guidesIndexUrl,
  serializeJsonLd,
} from "./json-ld";
import { guides } from "./registry";

const title = "Gronify guides: work with JSON on the command line";
const description =
  "Guides for searching, flattening, and rebuilding JSON from the command line with Gronify. Each one answers a single question with commands and real output.";

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  // Setting `openGraph` or `twitter` here replaces the root layout's objects
  // whole, so the site-wide share image is carried over from the parent.
  const inherited = await parent;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: guidesIndexUrl },
    openGraph: {
      type: "website",
      url: guidesIndexUrl,
      title,
      description,
      siteName: "Gronify",
      locale: "en_US",
      images: inherited.openGraph?.images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: inherited.twitter?.images,
    },
  };
}

export default function GuidesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            guidesIndexStructuredData(title, description, guides),
          ),
        }}
      />
      <GuidesIndex
        links={guides.map((guide) => ({
          slug: guide.slug,
          title: guide.h1,
          description: guide.description,
        }))}
      />
    </>
  );
}
