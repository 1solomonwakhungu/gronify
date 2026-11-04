import rawResults from "./native-benchmark-results.json";
import type { BarBlock, BarRow } from "./benchmark-data";

type NativeTool = {
  tool: string;
  seconds: number | null;
  peakRssBytes: number | null;
  status?: string;
  samples: { seconds: number; rssBytes: number }[];
};
type NativeWorkload = {
  id: string;
  inputBytes: number;
  validation: string;
  tools: NativeTool[];
};
type NativeResults = {
  sourceCommit: string;
  generatedAt: string;
  method: string;
  coverageNote: string;
  results: NativeWorkload[];
};
const data = rawResults as NativeResults;
const evidenceUrl =
  "https://github.com/1solomonwakhungu/gronify/blob/main/native/evidence/current-00d9502/native-results.json";
const mib = 1024 ** 2;
const time = (seconds: number) =>
  seconds < 0.1
    ? `${(seconds * 1000).toFixed(1)} ms`
    : `${seconds.toFixed(2)} s`;
const memory = (bytes: number) => `${(bytes / mib).toFixed(2)} MiB`;
const labels: Record<string, string> = {
  native: "Gronify native (experimental)",
  node: "Gronify Node.js (source)",
  fastgron: "fastgron",
};
function measured(
  row: NativeTool,
): row is NativeTool & { seconds: number; peakRssBytes: number } {
  return (
    (row.status === undefined || row.status === "ok") &&
    typeof row.seconds === "number" &&
    Number.isFinite(row.seconds) &&
    row.seconds > 0 &&
    typeof row.peakRssBytes === "number" &&
    Number.isFinite(row.peakRssBytes) &&
    row.peakRssBytes > 0
  );
}
for (const entry of data.results) {
  for (const row of entry.tools) {
    if ((row.status === undefined || row.status === "ok") && !measured(row)) {
      throw new Error(
        `Invalid native timing or RSS for ${entry.id}/${row.tool}`,
      );
    }
  }
}
function workload(id: string): NativeWorkload {
  const row = data.results.find((entry) => entry.id === id);
  if (!row) throw new Error(`Native benchmark is missing ${id}`);
  return row;
}
function metric(id: string, tool: string): string {
  const row = workload(id).tools.find((entry) => entry.tool === tool);
  return row && measured(row)
    ? `${time(row.seconds)} at ${memory(row.peakRssBytes)} peak RSS`
    : "not measured";
}
function block(id: string, title: string, note: string): BarBlock {
  const entry = workload(id);
  const completed = entry.tools.filter(measured);
  const maxTime = Math.max(...completed.map((row) => row.seconds));
  const maxRss = Math.max(...completed.map((row) => row.peakRssBytes));
  return {
    id,
    title,
    subtitle: `${memory(entry.inputBytes)} input. ${note}; median of 3 trials. ${entry.validation}.`,
    rows: entry.tools.map(
      (row): BarRow => ({
        tool: row.tool,
        label: labels[row.tool] ?? row.tool,
        highlight: row.tool === "native",
        statusLabel:
          row.status === "failed"
            ? "Failed validation or execution"
            : "Not measured",
        statusTone: row.status === "failed" ? "danger" : "neutral",
        ...(measured(row)
          ? {
              timeText: time(row.seconds),
              rssText: memory(row.peakRssBytes),
              timePercent: (row.seconds / maxTime) * 100,
              rssPercent: (row.peakRssBytes / maxRss) * 100,
            }
          : {}),
      }),
    ),
  };
}

const large = workload("records-1GiB-flatten");
const largeNative = large.tools.find((row) => row.tool === "native");
const largeNode = large.tools.find((row) => row.tool === "node");
const summary =
  largeNative && largeNode && measured(largeNative) && measured(largeNode)
    ? `On the 1 GiB ASCII records fixture, native took ${((largeNative.seconds / largeNode.seconds) * 100).toFixed(1)}% of Node.js elapsed time and ${((largeNative.peakRssBytes / largeNode.peakRssBytes) * 100).toFixed(1)}% of its peak RSS. These are medians from the same fixture and output contract.`
    : "The charts retain each completed measurement and identify failed validation or execution.";

export const nativeBenchmarkView = {
  summary,
  date: data.generatedAt.slice(0, 10),
  sourceCommit: data.sourceCommit,
  sourceUrl: `https://github.com/1solomonwakhungu/gronify/tree/${data.sourceCommit}`,
  evidenceUrl,
  docsUrl: "https://github.com/1solomonwakhungu/gronify/tree/main/native",
  method: data.method,
  coverageNote: data.coverageNote,
  blocks: [
    block(
      "records-100MiB-flatten",
      "Native and Node.js, same 100 MiB fixture",
      "Same input for all three tools",
    ),
    block(
      "records-1GiB-flatten",
      "Native and Node.js at 1 GiB",
      "fastgron not run at this size to bound host memory",
    ),
  ],
  points: [
    {
      title: "Startup included",
      body: `On the tiny records fixture, native recorded ${metric("tiny-startup-flatten", "native")}; Node.js recorded ${metric("tiny-startup-flatten", "node")}.`,
    },
    {
      title: "Literal search",
      body: `On the 32 MiB records fixture, case-sensitive search recorded ${metric("records-32MiB-search-sensitive", "native")} for native and ${metric("records-32MiB-search-sensitive", "node")} for Node.js.`,
    },
    {
      title: "Ordered unflatten",
      body: `On the gron input generated from 32 MiB of records, native recorded ${metric("records-32MiB-unflatten", "native")}; Node.js recorded ${metric("records-32MiB-unflatten", "node")}.`,
    },
  ],
};
