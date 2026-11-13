import type { Metadata, ResolvingMetadata } from "next";
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

export async function generateMetadata(
  { params }: GuidePageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};

  const url = guideUrl(guide.slug);
  // Setting `openGraph` or `twitter` here replaces the root layout's objects
  // whole, so the site-wide share image is carried over from the parent.
  const inherited = await parent;

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
      images: inherited.openGraph?.images,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: inherited.twitter?.images,
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
