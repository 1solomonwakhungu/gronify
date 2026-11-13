import { Benchmarks } from "./benchmarks";
import { benchmarkView, reproduceCommand } from "./benchmark-data";
import { Home } from "./home";
import { faqs, homeStructuredData } from "./seo-data";
import { Terminal, type TerminalLine } from "./terminal";

const reproduceLines: TerminalLine[] = [
  { kind: "command", text: "cd gronify/src/packages/cli" },
  { kind: "command", text: "npm ci && npm run build" },
  { kind: "command", text: reproduceCommand },
];

export default function Page() {
  return (
    <>
      {/* Home-only JSON-LD (WebPage and FAQPage). The site-wide graph is in the root layout. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homeStructuredData).replace(/</g, "\\u003c"),
        }}
      />
      <Home
        faqs={faqs}
        facts={benchmarkView.comparisonFacts}
        benchmarks={
          <Benchmarks
            view={benchmarkView}
            reproduce={
              <Terminal
                label="Reproduce the cross-tool benchmark"
                lines={reproduceLines}
              />
            }
          />
        }
      />
    </>
  );
}
