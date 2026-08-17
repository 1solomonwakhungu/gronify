import type { Metadata } from "next";
import "@primer/react-brand/fonts/fonts.css";
import "@primer/react-brand/lib/css/main.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Gronify | Standalone JSON inspection for the terminal",
  description:
    "Flatten nested JSON into searchable paths, filter with text or regex, and round-trip gron output locally from a focused CLI.",
  keywords: [
    "JSON CLI",
    "standalone JSON CLI",
    "terminal JSON",
    "grep JSON",
    "developer tools",
  ],
  openGraph: {
    title: "Gronify | Search JSON. Find answers.",
    description:
      "A local-first CLI for flattening, searching, and reconstructing JSON in terminal workflows.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
