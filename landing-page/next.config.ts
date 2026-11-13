import type { NextConfig } from "next";

// The llms files stay fetchable for agents but should not compete with the
// real pages in search results.
const noindexHeaders = [{ key: "X-Robots-Tag", value: "noindex" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/llms.txt", headers: noindexHeaders },
      { source: "/llms-full.txt", headers: noindexHeaders },
    ];
  },
};

export default nextConfig;
