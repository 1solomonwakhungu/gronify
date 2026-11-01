import { Benchmarks } from "./benchmarks";
import { benchmarkView, reproduceCommand } from "./benchmark-data";
import { Home } from "./home";
import { faqs } from "./seo-data";
import { Terminal, type TerminalLine } from "./terminal";

const reproduceLines: TerminalLine[] = [
  { kind: "command", text: "cd gronify/src/packages/cli" },
  { kind: "command", text: "npm ci && npm run build" },
  { kind: "command", text: reproduceCommand },
];

export default function Page() {
  return (
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
  );
}
