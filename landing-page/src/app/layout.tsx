import type { Metadata, Viewport } from "next";
import "@primer/react-brand/fonts/fonts.css";
import "@primer/react-brand/lib/css/main.css";
import "./globals.css";
import { Providers } from "./providers";
import {
  homeDescription,
  homeTitle,
  siteStructuredData,
  siteUrl,
} from "./seo-data";

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: homeTitle,
  description: homeDescription,
  applicationName: "Gronify",
  category: "developer tools",
  authors: [
    { name: "Solomon Wakhungu", url: "https://github.com/1solomonwakhungu" },
  ],
  creator: "Solomon Wakhungu",
  keywords: [
    "gronify",
    "grep JSON",
    "search JSON command line",
    "flatten JSON",
    "gron alternative",
    "jq alternative",
    "ungron",
    "JSON CLI",
  ],
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    google: "xyVGHAcB_FRi2uCmXvTCCamJ9joip8AgsBtQp9dMrXs",
    other: {
      "msvalidate.01": "1631CA4303F0822BAA029D7DBDACFD1D",
    },
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
    title: homeTitle,
    description: homeDescription,
    url: siteUrl,
    siteName: "Gronify",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: homeDescription,
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
            __html: JSON.stringify(siteStructuredData).replace(/</g, "\\u003c"),
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
