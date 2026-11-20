import { ImageResponse } from "next/og";

import { OgCard, ogImageContentType, ogImageSize } from "../og-card";
import { guidesIndexDescription, guidesIndexTitle } from "./index-copy";
import { guides } from "./registry";

export const size = ogImageSize;
export const contentType = ogImageContentType;
export const alt = guidesIndexTitle;

export default function GuidesOpenGraphImage() {
  // The first three guides, as a preview of what the index lists.
  const preview = guides.slice(0, 3).map((guide) => ({
    kind: "output" as const,
    text: `/guides/${guide.slug} · ${guide.h1}`,
  }));

  return new ImageResponse(
    (
      <OgCard
        badge={`Guides · ${guides.length} articles`}
        title={guidesIndexTitle}
        description={guidesIndexDescription}
        terminal={preview}
      />
    ),
    { ...size },
  );
}
