import type { Metadata } from "next";

import { GuidesIndex } from "./guide-article";
import {
  guidesIndexStructuredData,
  guidesIndexUrl,
  serializeJsonLd,
} from "./json-ld";
import { guidesIndexDescription, guidesIndexTitle } from "./index-copy";
import { guides } from "./registry";

const title = guidesIndexTitle;
const description = guidesIndexDescription;

// `images` is left unset on purpose: `opengraph-image.tsx` in this segment
// supplies the index's own share image for both Open Graph and Twitter.
export const metadata: Metadata = {
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
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

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
