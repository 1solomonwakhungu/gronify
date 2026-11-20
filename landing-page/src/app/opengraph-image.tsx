import { ImageResponse } from "next/og";
import { OgCard, ogImageContentType, ogImageSize } from "./og-card";
import { cliVersion, homeTitle } from "./seo-data";

export const alt = homeTitle;
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <OgCard
        badge={`Open source JSON CLI · MIT · v${cliVersion}`}
        title="A gron-style CLI to search and flatten nested JSON."
        description="Print every value with its full path, search by text or regex, keep numbers exact, and stream multi-gigabyte files."
        terminal={[
          { kind: "command", text: "npm install -g gronify" },
          {
            kind: "command",
            text: 'gronify search payload.json --regex "status|version"',
          },
          { kind: "output", text: 'json.service.status = "degraded"' },
          { kind: "output", text: 'json.deployments[0].version = "2026.05.22"' },
        ]}
      />
    ),
    { ...size },
  );
}
