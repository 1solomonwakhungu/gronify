import { benchmarkFaqAnswer } from "./benchmark-data";
import {
  cliVersion,
  homebrewTapUrl,
  lastReleaseIsoDate,
  nodeRequirement,
  npmPackageUrl,
  repositoryUrl,
  siteUrl,
  skillsUrl,
} from "./site-config";

export {
  cliVersion,
  lastReleaseIsoDate,
  npmPackageUrl,
  repositoryUrl,
  siteUrl,
};

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
      "Flatten, search, and document-order unflatten stream files or stdin. Memory depends on document shape, nesting, token size, flags, and output. --sort spills buffered object lines past 64 MiB to a temp file, while out-of-order unflatten can rebuild in memory only when detected within the first 16 MiB. Use --no-color or -o for large unflatten output. The benchmark section reports measured source-build time and memory with the exact revision and test conditions.",
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
    question: "How does Gronify compare to jq, gron, and fastgron?",
    answer: `Use jq when you already know the exact schema and need data transformations. Compared to gron and fastgron, Gronify is a zero-native-binary TypeScript alternative that installs via npm on macOS, Linux, and Windows with built-in regex search—no separate grep required. It prints numbers exactly as written, keeps document order by default, and streams single-document flatten, search, and unflatten (ungron) with streaming input on the default path. Measured results: ${benchmarkFaqAnswer}`,
  },
  {
    question: "How do I compare two JSON files using Gronify and system diff?",
    answer:
      "Run diff <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json) in bash or zsh, or write two sorted files with -o on Windows and compare them with diff. Gronify has no diff subcommand; instead, --sort normalizes object key order at every nesting level while keeping each object's subtree intact and array elements in numeric index order, so system diff highlights only real data changes.",
  },
  {
    question:
      "How can AI coding agents explore large JSON files without flooding LLM context?",
    answer:
      "Pass --no-color and narrow progressively: run gronify --no-color search file.json term --count to check match volume first, sample matches with search -m 20, or inspect top-level schema shape with flatten --limit 50. Gronify closes the input stream immediately when -m or --limit is hit, avoiding the rest of a large file when enough matches occur near the start. Agents can also install the gronify-json-flatten-search skill from skills.sh.",
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
        "Gronify streams JSON from files and pipes: local-first CLI to flatten greppable paths, search with regex, and unflatten (ungron) JSON.",
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
      image: `${siteUrl}/opengraph-image`,
      description:
        "Local-first, standalone TypeScript CLI that stream-parses multi-gigabyte JSON into greppable path assignments, filters keys and values with plain text or extended regex, preserves exact source numbers (including 64-bit integers and trailing decimals), and unflattens (ungron) path assignments back into valid JSON.",
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Command Line Interface",
      operatingSystem: "macOS, Linux, Windows",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      softwareVersion: cliVersion,
      softwareRequirements: `Node.js ${nodeRequirement}`,
      featureList: [
        "Stream-parse large JSON from files or stdin",
        "Flatten nested JSON into greppable path assignments in document order",
        "Built-in plain-text and extended regex search with result caps and exit codes",
        "Preserve exact 64-bit integers above 2^53 and trailing decimals verbatim",
        "Stream-unflatten (ungron) document-order gron assignments back to valid JSON",
        "Deterministic UTF-16 object key sorting (--sort) for system diff",
      ],
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
      name: "Gronify — Frequently Asked Questions",
      url: siteUrl,
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
