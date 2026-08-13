import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
