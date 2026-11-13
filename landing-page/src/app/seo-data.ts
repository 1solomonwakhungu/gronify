import { benchmarkFaqAnswer, benchmarkView } from "./benchmark-data";
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

/** The home page <title> and meta description, shared with the JSON-LD below. */
export const homeTitle =
  "Gronify: grep, search, and flatten JSON on the command line";
export const homeDescription =
  "Gronify is an open source CLI for developers who search nested JSON. It prints every value with its full path, matches text or regex, and streams large files.";

export type FaqItem = {
  question: string;
  answer: string;
};

const facts = benchmarkView.comparisonFacts;

export const faqs: FaqItem[] = [
  {
    question: "What is Gronify?",
    answer:
      "Gronify is an open source command-line tool that flattens JSON into one line per value, each with its full path, so you can search nested data with plain text or a regex. It is modeled on gron, has search and unflatten built in, and streams its input, so multi-gigabyte files work.",
  },
  {
    question: "How do I grep or search a JSON file from the command line?",
    answer:
      "Run gronify search file.json term. Gronify flattens the file and prints each matching line as path = value, so you see where the match sits. A plain term is a case-insensitive substring match on the whole line. Add --regex for a JavaScript regular expression, -c for exact case, or --count for a total. From a pipe, pass only the term: curl -s URL | gronify search status.",
  },
  {
    question: "Is Gronify a drop-in replacement for gron?",
    answer:
      "No. Gronify uses the same path = value lines, but the commands and the output differ. The commands are gronify flatten and gronify unflatten, where gron uses gron and gron --ungron. Lines have no trailing semicolon. Keys stay in document order unless you pass --sort, while gron sorts by default. --sort compares keys by UTF-16 code unit; gron puts bare keys before bracketed ones and compares UTF-8 bytes. Gronify unflatten reads gron's output, but it needs every parent line, so it rejects grep-filtered lines that gron --ungron accepts. gron --ungron does not read Gronify's output, which lacks the semicolons.",
  },
  {
    question: "Is Gronify an alternative to jq?",
    answer:
      "For finding data, yes. For transforming it, no. jq needs a filter that names the path, and Gronify shows you the path when all you have is a key name or a value. It also prints numbers exactly as written and streams large files without extra flags. Gronify has no query language, so keep jq for reshaping, arithmetic, and building new JSON.",
  },
  {
    question: "Does Gronify work on Windows, macOS, and Linux?",
    answer:
      "Yes. Gronify is a Node.js program, so npm install -g gronify works on all three with Node.js 20 or newer. Search is built in, so PowerShell and cmd users do not need grep. Homebrew, a GitHub release archive, and a source build are also available. CI runs the tests on Linux and macOS, not on Windows.",
  },
  {
    question: "How large a JSON file can Gronify handle?",
    answer: `Gronify has no built-in size limit, because flatten, search, and unflatten read their input in chunks and write output as they go. In the benchmark, ${facts.unflatten} (${facts.measuredOn}). Memory depends on the document and the flags. One string or number must fit in memory. --sort holds each object's lines and spills to a temp file past 64 MiB. Unflatten input that is out of document order is rebuilt in memory only when the problem shows up in the first 16 MiB; after that it fails. Colored unflatten output builds the whole document, so pass --no-color for very large input.`,
  },
  {
    question: "Does Gronify round large numbers like jq or JSON.parse?",
    answer:
      "No. Gronify checks that each number is valid JSON and prints it exactly as written, so 12345678901234567890, 1.10, -0, and 1e-7 come through flatten, search, and unflatten unchanged. JSON.parse rounds integers above 2^53 (9007199254740992) to the nearest double. jq can round them too, depending on its version and the filter you run.",
  },
  {
    question: "How do I compare two JSON files from the command line?",
    answer:
      "Flatten both files with --sort and give the output to your system's diff. In bash or zsh: diff <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json). --sort puts object keys in the same order on both sides and leaves arrays in index order, so reordered keys produce no output. Gronify has no diff command of its own. In PowerShell or cmd, write each side to a file with -o and compare the files.",
  },
  {
    question: "How do AI coding agents use Gronify on large JSON files?",
    answer:
      "They count first, then read a capped sample. gronify --no-color search file.json term --count prints how many lines match. search -m 20 prints the first 20 matches and stops reading the file, and flatten --limit 50 shows the shape of the document. A large file never enters the model's context whole. The gronify-json-flatten-search skill on skills.sh teaches supported agents this routine.",
  },
  {
    question: "Does Gronify send my JSON data anywhere?",
    answer:
      "No. Gronify reads files and stdin on your machine and writes to stdout or a local file. It makes no network requests and has no telemetry.",
  },
  {
    question: "What does Gronify do with invalid JSON?",
    answer:
      "It stops with exit code 1 (2 with search --exit-status) and an error that names the byte offset, line, and column, such as: Unexpected '}' after ',' (trailing commas are not allowed) at byte offset 7 (line 1, column 8). Gronify accepts strict JSON only, so trailing commas, comments, single quotes, invalid UTF-8, and JSON Lines input are errors. Lines before the error may already be printed, so check the exit code in scripts.",
  },
  {
    question: "How fast is Gronify compared with gron, fastgron, and jq?",
    answer: benchmarkFaqAnswer,
  },
];

const websiteId = `${siteUrl}/#website`;
const authorId = `${siteUrl}/#author`;
const softwareId = `${siteUrl}/#software`;
const homePageId = `${siteUrl}/#webpage`;

/** Rendered by the root layout, so every route carries it. */
export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: siteUrl,
      name: "Gronify",
      description:
        "Documentation and benchmarks for Gronify, a command-line tool that flattens and searches JSON.",
      inLanguage: "en",
      publisher: {
        "@id": authorId,
      },
    },
    {
      "@type": "Person",
      "@id": authorId,
      name: "Solomon Wakhungu",
      url: "https://github.com/1solomonwakhungu",
    },
    {
      "@type": ["SoftwareApplication", "SoftwareSourceCode"],
      "@id": softwareId,
      name: "Gronify",
      url: siteUrl,
      image: `${siteUrl}/opengraph-image`,
      description:
        "Gronify is an open source command-line tool that flattens nested JSON into one line per value with its full path, searches those lines with plain text or a regular expression, and rebuilds JSON from them. It reads files and stdin as a stream, so multi-gigabyte files work, and it prints numbers exactly as written.",
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Command Line Interface",
      operatingSystem: "macOS, Linux, Windows",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      softwareVersion: cliVersion,
      softwareRequirements: `Node.js ${nodeRequirement}`,
      featureList: [
        "Flatten nested JSON into one path = value line per value, in document order",
        "Search keys and values with plain text or a regular expression, with no separate grep",
        "Rebuild JSON from gron lines (unflatten, also called ungron)",
        "Stream files and stdin, so multi-gigabyte input works",
        "Print numbers exactly as written, including integers above 2^53",
        "Stop reading the input once a result cap is reached (-m, --limit)",
        "Sort object keys with --sort so two files compare cleanly with system diff",
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
        "@id": authorId,
      },
    },
  ],
};

/** Rendered by the home page only: other routes must not carry the home FAQ. */
export const homeStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": homePageId,
      url: siteUrl,
      name: homeTitle,
      description: homeDescription,
      inLanguage: "en",
      isPartOf: {
        "@id": websiteId,
      },
      about: {
        "@id": softwareId,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: `${siteUrl}/opengraph-image`,
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      name: "Gronify frequently asked questions",
      url: siteUrl,
      inLanguage: "en",
      isPartOf: {
        "@id": homePageId,
      },
      about: {
        "@id": softwareId,
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
