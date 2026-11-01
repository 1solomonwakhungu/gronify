import type { Metadata, Viewport } from "next";
import "@primer/react-brand/fonts/fonts.css";
import "@primer/react-brand/lib/css/main.css";
import "./globals.css";
import { Providers } from "./providers";
import { siteUrl, structuredData } from "./seo-data";

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Gronify — Streaming JSON Parsing CLI: Flatten & Search",
  description:
    "Gronify is a local-first JSON parsing CLI: stream multi-GB files (~100 MB default), flatten greppable paths, search with regex, and round-trip gron.",
  applicationName: "Gronify",
  category: "developer tools",
  authors: [
    { name: "Solomon Wakhungu", url: "https://github.com/1solomonwakhungu" },
  ],
  creator: "Solomon Wakhungu",
  keywords: [
    "gronify",
    "JSON parsing",
    "JSON parsing CLI",
    "parse JSON command line",
    "streaming gron CLI",
    "streaming ungron",
    "gron alternative",
    "fastgron alternative",
    "gron typescript",
    "gron windows",
    "grep nested JSON",
    "JSON CLI for AI coding agents",
    "preserve exact numbers JSON CLI",
    "sort JSON keys for diff CLI",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Gronify — Streaming JSON Parsing CLI: Flatten & Search",
    description:
      "Stream-parse multi-gigabyte JSON (~100 MB default-path memory), flatten nested payloads into greppable paths, search with regex, and round-trip gron.",
    url: "/",
    siteName: "Gronify",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gronify — Streaming JSON Parsing CLI: Flatten & Search",
    description:
      "Stream-parse multi-gigabyte JSON (~100 MB default-path memory), flatten nested payloads into greppable paths, search with regex, and round-trip gron.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-color-mode="dark">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
