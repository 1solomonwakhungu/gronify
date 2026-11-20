import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { OgCard, ogImageContentType, ogImageSize } from "../../og-card";
import { getGuide, guides } from "../registry";
import { guideShareSnippet } from "../share-snippet";

export const size = ogImageSize;
export const contentType = ogImageContentType;
// `alt` must be static for the images to prerender per slug
// (`generateImageMetadata` would make them render on demand), so it names the
// card rather than the guide. The headline in the image is the guide's h1.
export const alt = "Gronify guide: a command-line JSON how-to";

// One image per registered guide, rendered at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export default async function GuideOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return new ImageResponse(
    (
      <OgCard
        badge="Gronify guide"
        title={guide.h1}
        description={guide.description}
        terminal={guideShareSnippet(guide)}
      />
    ),
    { ...size },
  );
}
