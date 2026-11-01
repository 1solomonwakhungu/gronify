export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://gronify.vercel.app"
).replace(/\/+$/, "");

export const repositoryUrl = "https://github.com/1solomonwakhungu/gronify";
export const npmPackageUrl = "https://www.npmjs.com/package/gronify";
export const homebrewTapUrl =
  "https://github.com/1solomonwakhungu/homebrew-tap";
export const skillsUrl =
  "https://skills.sh/1solomonwakhungu/gronify/gronify-json-flatten-search";

export const cliVersion = "1.2.0";
export const nodeRequirement = "20 or newer";
export const npmBuildRequirement = "10 or newer";
export const lastReleaseIsoDate = "2026-10-31";

export type FaqItem = {
  question: string;
  answer: string;
};

export const faqs: FaqItem[] = [
  {
    question: "Does Gronify require fastgron or grep?",
    answer:
      "No. Streaming JSON parsing, path flattening, regex search, and unflattening gron output back to JSON are all built into the standalone Gronify CLI with zero external binaries required.",
  },
  {
    question: "Can I use Gronify on Windows, macOS, and Linux?",
    answer:
      "Yes. Install globally with npm install -g gronify (or run npx gronify) on Windows, macOS, or Linux, install via Homebrew where supported, download a GitHub release archive, or build the TypeScript CLI from source with Node.js 20 or newer. Because gronify search is built in, Windows PowerShell and CMD users get consistent text and regex filtering without installing grep or rewriting pipelines around Select-String.",
  },
  {
    question: "How large a JSON file can Gronify parse and search?",
    answer:
      "All three commands (flatten, search, and unflatten) stream raw JSON in 1 MB chunks, keeping peak memory around 100 MB on the default path whether the input is 20 MB or multiple gigabytes. --sort on a large top-level object and out-of-order unflatten input use more. On an Apple M5 Pro (Node.js 22), Gronify flattens a 3.50 GB JSON file in 22.1 seconds at 98 MB RSS and unflattens a 3 GB gron file in 7.31 seconds at 100 MB RSS. With -m or --limit, Gronify stops reading once the cap is reached, returning early matches in milliseconds.",
  },
  {
    question: "Does --sort produce the same key order as gron?",
    answer:
      "No. Gronify's --sort compares object keys by UTF-16 code unit at each level, keeps each key's subtree contiguous, and leaves array index order unchanged ([2] before [10]); upstream gron puts bare keys before bracketed ones and compares UTF-8 bytes, so the two can differ. Gronify's sorted output is stable across key reorderings, makes flattened paths cleanly diffable with the system diff tool, and streams straight back through unflatten.",
  },
  {
    question:
      "Does Gronify preserve exact 64-bit integers and decimal precision?",
    answer:
      "Yes. Gronify validates JSON numbers without converting them to 64-bit IEEE-754 floats, printing every number verbatim as written in the source so 12345678901234567890 (above 2^53), 1.10, and -0 survive flatten, search, and unflatten unchanged.",
  },
  {
    question: "How does Gronify report invalid JSON syntax errors?",
    answer:
      "Gronify enforces strict JSON parsing—rejecting trailing commas, comments, single quotes, invalid UTF-8, and truncated inputs—and exits non-zero while reporting the exact byte offset, line, and column of the syntax error.",
  },
  {
    question: "Does Gronify send JSON payloads to an external service?",
    answer:
      "No. Gronify is 100% local-first. Every file and stdin stream is parsed, searched, and reconstructed directly on your own machine.",
  },
];

export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Gronify",
      description:
        "Gronify is a local-first JSON parsing CLI: stream multi-GB files in ~100 MB memory, flatten to greppable paths, search with regex, and round-trip JSON.",
      inLanguage: "en",
      publisher: {
        "@id": `${siteUrl}/#author`,
      },
    },
    {
      "@type": "Person",
      "@id": `${siteUrl}/#author`,
      name: "Solomon Wakhungu",
      url: "https://github.com/1solomonwakhungu",
    },
    {
      "@type": ["SoftwareApplication", "SoftwareSourceCode"],
      "@id": `${siteUrl}/#software`,
      name: "Gronify",
      url: siteUrl,
      description:
        "Local-first, standalone TypeScript CLI that stream-parses multi-gigabyte JSON into greppable path assignments, filters keys and values with plain text or extended regex, preserves exact source numbers (including 64-bit integers and trailing decimals), and unflattens gron output back into valid JSON.",
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Command Line Interface",
      operatingSystem: "macOS, Linux, Windows",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      softwareVersion: cliVersion,
      softwareRequirements: `Node.js ${nodeRequirement}`,
      dateModified: lastReleaseIsoDate,
      license: `${repositoryUrl}/blob/main/LICENSE`,
      codeRepository: repositoryUrl,
      downloadUrl: npmPackageUrl,
      releaseNotes: `${repositoryUrl}/releases/tag/v${cliVersion}`,
      sameAs: [repositoryUrl, npmPackageUrl, homebrewTapUrl, skillsUrl],
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      author: {
        "@id": `${siteUrl}/#author`,
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      url: `${siteUrl}/#faq`,
      inLanguage: "en",
      isPartOf: {
        "@id": `${siteUrl}/#website`,
      },
      about: {
        "@id": `${siteUrl}/#software`,
      },
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ],
};
