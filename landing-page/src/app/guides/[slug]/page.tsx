import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuideArticle } from "../guide-article";
import { guideStructuredData, guideUrl, serializeJsonLd } from "../json-ld";
import { getGuide, getRelatedGuides, guides } from "../registry";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

// Only registered guides exist; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};

  const url = guideUrl(guide.slug);
  // `images` is left unset on purpose: `opengraph-image.tsx` in this segment
  // supplies the guide's own share image for both Open Graph and Twitter.

  return {
    // `absolute` keeps the title exactly as written if the root layout ever
    // gains a title template.
    title: { absolute: guide.title },
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: guide.title,
      description: guide.description,
      siteName: "Gronify",
      locale: "en_US",
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
    },
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(guideStructuredData(guide)),
        }}
      />
      <GuideArticle
        guide={guide}
        related={getRelatedGuides(guide).map((related) => ({
          slug: related.slug,
          title: related.h1,
          description: related.description,
        }))}
        linkableSlugs={guides.map((registered) => registered.slug)}
      />
    </>
  );
}
