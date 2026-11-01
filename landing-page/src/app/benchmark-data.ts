import rawResults from "./benchmark-results.json";

/*
 * Everything the benchmark section says is derived from benchmark-results.json,
 * which `npm run bench:compare` writes. Nothing here is a typed-in measurement.
 * Claims that the copy depends on are checked by `claim()` at build time, so
 * regenerated results that no longer support a sentence fail the build instead
 * of shipping a stale or false statement.
 */

export type ResultStatus = "ok" | "timeout" | "failed" | "skipped";

export type ReasonCode =
  | "not-installed"
  | "unsupported"
  | "over-budget"
  | "after-failure"
  | "no-input"
  | "timeout"
  | "memory-guard"
  | "os-oom-kill"
  | "exit-nonzero"
  | "wrong-output";

export type BenchResult = {
  tool: string;
  command: string;
  seconds: number | null;
  peakRssBytes: number | null;
  status: ResultStatus;
  reasonCode?: ReasonCode;
  isFastest?: boolean | null;
  isTie?: boolean | null;
  note?: string;
};

export type Workload = {
  id: string;
  operation: string;
  label: string;
  inputBytes: number;
  runs?: number;
  results: BenchResult[];
};

export type Check = {
  check: string;
  results: { tool: string; pass: boolean | null; note: string }[];
};

type BenchmarkResults = {
  generatedAt: string;
  machine: { cpu: string; memGB: number; os: string; node: string };
  tools: Record<string, string>;
  options: { timeoutSeconds: number; tieThreshold: number };
  workloads: Workload[];
  correctness: Check[];
};

const data = rawResults as unknown as BenchmarkResults;

export const benchmarkUrl =
  "https://github.com/1solomonwakhungu/gronify/blob/main/src/packages/cli/BENCHMARKS.md";
export const reproduceCommand = "npm run bench:compare";

const MIB = 1024 * 1024;
const GIB = MIB * 1024;

function claim(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`benchmark-results.json no longer supports the copy: ${message}`);
  }
}

function workload(id: string): Workload {
  const found = data.workloads.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`benchmark-results.json has no workload "${id}"`);
  return found;
}

function result(workloadId: string, tool: string): BenchResult {
  const found = workload(workloadId).results.find(
    (candidate) => candidate.tool === tool,
  );
  if (!found) {
    throw new Error(`benchmark-results.json has no "${tool}" result for "${workloadId}"`);
  }
  return found;
}

function okResult(workloadId: string, tool: string): Measured {
  const found = result(workloadId, tool);
  claim(found.status === "ok", `${tool} did not finish ${workloadId}`);
  return found as Measured;
}

type Measured = BenchResult & { seconds: number; peakRssBytes: number };

function isMeasured(value: BenchResult): value is Measured {
  return (
    value.status === "ok" &&
    value.seconds !== null &&
    value.peakRssBytes !== null
  );
}

export function formatSeconds(seconds: number): string {
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
}

export function formatBytes(bytes: number): string {
  return bytes >= GIB
    ? `${(bytes / GIB).toFixed(2)} GB`
    : `${Math.round(bytes / MIB)} MB`;
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}x`;
}

function formatRange(low: number, high: number, format: (n: number) => string) {
  return `${format(low)} to ${format(high)}`;
}

export function displayTool(tool: string): string {
  return tool === "jq" ? "jq --stream" : tool;
}

/** "records 100 MB" -> "100 MB" */
function sizeLabel(id: string): string {
  const label = workload(id).label.split(": ")[1] ?? workload(id).label;
  return label.replace(/^records /, "");
}

const recordSizes = ["1mb", "10mb", "100mb", "1000mb"] as const;
const gronFormatTools = ["gron", "gron --no-sort", "fastgron", "fastgron -F"];

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

export const environment = {
  date: data.generatedAt.slice(0, 10),
  machine: `${data.machine.cpu}, ${data.machine.memGB} GB RAM`,
  os: data.machine.os,
  node: data.machine.node,
  tools: Object.entries(data.tools).map(([name, version]) => ({
    name,
    version,
  })),
};

/* ------------------------------------------------------------------ */
/* Headline bars                                                       */
/* ------------------------------------------------------------------ */

export type BarRow = {
  tool: string;
  label: string;
  highlight: boolean;
  status: ResultStatus;
  statusLabel: string;
  statusTone: "danger" | "neutral";
  statusNote?: string;
  seconds?: number;
  rss?: number;
  timeText?: string;
  rssText?: string;
  timePercent?: number;
  rssPercent?: number;
  fastest: boolean;
  tie: boolean;
  lowest: boolean;
};

export type BarBlock = {
  id: string;
  title: string;
  subtitle: string;
  rows: BarRow[];
};

const reasonLabels: Record<ReasonCode, { label: string; danger: boolean }> = {
  "not-installed": { label: "Not installed", danger: false },
  unsupported: { label: "Not applicable", danger: false },
  "over-budget": { label: "Not run", danger: false },
  "after-failure": { label: "Not run", danger: false },
  "no-input": { label: "Not run", danger: false },
  timeout: { label: "Timed out", danger: true },
  "memory-guard": { label: "Stopped at memory limit", danger: true },
  "os-oom-kill": { label: "OS out-of-memory kill", danger: true },
  "exit-nonzero": { label: "Failed", danger: true },
  "wrong-output": { label: "Wrong output", danger: true },
};

const statusFallback: Record<ResultStatus, { label: string; danger: boolean }> = {
  ok: { label: "Finished", danger: false },
  timeout: reasonLabels.timeout,
  failed: reasonLabels["exit-nonzero"],
  skipped: reasonLabels["after-failure"],
};

function statusDisplay(row: BenchResult) {
  return (row.reasonCode && reasonLabels[row.reasonCode]) || statusFallback[row.status];
}

function statusNote(row: BenchResult): string | undefined {
  // Failed runs carry raw shell output and temp paths. Keep those on GitHub.
  if (!row.note || row.status === "failed") return undefined;
  return row.note.replace(/^not run: /i, "");
}

function buildBlock(
  id: string,
  title: string,
  subtitle: string,
): BarBlock {
  const rows = workload(id).results;
  const measured = rows.filter(isMeasured);
  const maxSeconds = Math.max(...measured.map((row) => row.seconds));
  const maxRss = Math.max(...measured.map((row) => row.peakRssBytes));
  const minRss = Math.min(...measured.map((row) => row.peakRssBytes));

  return {
    id,
    title,
    subtitle: `${subtitle}, best of ${workload(id).runs ?? 3} runs`,
    rows: rows.map((row) => {
      const base = {
        tool: row.tool,
        label: displayTool(row.tool),
        highlight: row.tool === "gronify",
        status: row.status,
        statusLabel: statusDisplay(row).label,
        statusTone: statusDisplay(row).danger ? ("danger" as const) : ("neutral" as const),
        statusNote: statusNote(row),
        fastest: false,
        tie: false,
        lowest: false,
      };
      if (!isMeasured(row)) return base;
      return {
        ...base,
        seconds: row.seconds,
        rss: row.peakRssBytes,
        timeText: formatSeconds(row.seconds),
        rssText: formatBytes(row.peakRssBytes),
        timePercent: (row.seconds / maxSeconds) * 100,
        rssPercent: (row.peakRssBytes / maxRss) * 100,
        fastest: row.isFastest === true,
        tie: row.isTie === true,
        lowest: row.peakRssBytes === minRss,
      };
    }),
  };
}

const unflattenBig = workload("unflatten-records-1000mb");

export const barBlocks: BarBlock[] = [
  buildBlock(
    "flatten-records-1000mb",
    "Flatten",
    `${sizeLabel("flatten-records-1000mb")} JSON file`,
  ),
  buildBlock(
    "search-records-1000mb",
    "Search (count matches)",
    `${sizeLabel("search-records-1000mb")} JSON file, case-sensitive match`,
  ),
  buildBlock(
    "unflatten-records-1000mb",
    "Unflatten",
    `${formatBytes(unflattenBig.inputBytes)} of gron statements (the ${sizeLabel("unflatten-records-1000mb")} file, flattened)`,
  ),
];

/* ------------------------------------------------------------------ */
/* Derived numbers used in prose                                       */
/* ------------------------------------------------------------------ */

const gronifyFlattenBig = okResult("flatten-records-1000mb", "gronify");
const fastgronFlattenBig = okResult("flatten-records-1000mb", "fastgron");
const gronFlattenBig = result("flatten-records-1000mb", "gron");
claim(gronFlattenBig.status === "timeout", "gron should time out flattening 1 GB");
export const tiePercent = data.options.tieThreshold * 100;
export const timeoutSeconds = data.options.timeoutSeconds;
const gronNoSortFlattenBig = okResult("flatten-records-1000mb", "gron --no-sort");
const gronPeakObserved = /peak observed ([\d.]+ GB)/.exec(gronFlattenBig.note ?? "")?.[1];
claim(
  Number.isFinite(timeoutSeconds) && gronPeakObserved !== undefined,
  "gron's timeout note should state the peak observed and the options the limit",
);

// Gronify memory across every size and operation of the main workloads.
const gronifyRss = recordSizes.flatMap((size) =>
  ["flatten", "search", "unflatten"].map(
    (operation) => okResult(`${operation}-records-${size}`, "gronify").peakRssBytes,
  ),
);
const gronifyRssLow = Math.min(...gronifyRss);
const gronifyRssHigh = Math.max(...gronifyRss);

// Where Gronify's memory drops below every other gron-format tool that finished.
function lowestOfGronFormat(size: (typeof recordSizes)[number]): boolean {
  return ["flatten", "search", "unflatten"].every((operation) => {
    const id = `${operation}-records-${size}`;
    const gronify = okResult(id, "gronify").peakRssBytes;
    return workload(id)
      .results.filter(
        (row) => gronFormatTools.includes(row.tool) && isMeasured(row),
      )
      .every((row) => gronify < (row.peakRssBytes as number));
  });
}
const lowestFrom = recordSizes.find(lowestOfGronFormat);
claim(lowestFrom !== undefined, "Gronify should use the least memory at some size");
const lowestFromIndex = recordSizes.indexOf(lowestFrom as (typeof recordSizes)[number]);
claim(
  recordSizes.slice(lowestFromIndex).every(lowestOfGronFormat),
  "Gronify should stay the lowest-memory gron-format tool at every larger size",
);
claim(
  recordSizes
    .slice(0, lowestFromIndex)
    .every(
      (size) =>
        okResult(`flatten-records-${size}`, "fastgron").peakRssBytes <
        okResult(`flatten-records-${size}`, "gronify").peakRssBytes,
    ),
  "fastgron should use less memory than Gronify on the sizes below the crossover",
);
const lowestFromLabel = sizeLabel(`flatten-records-${lowestFrom}`);

// Speed against gron, on the sizes where gron finished and the input is big
// enough for the whole-document parse to dominate.
const gronSizes = ["10mb", "100mb"] as const;
const speedupVsGron = gronSizes.map(
  (size) =>
    okResult(`flatten-records-${size}`, "gron").seconds /
    okResult(`flatten-records-${size}`, "gronify").seconds,
);
const speedupVsGronNoSort = gronSizes.map(
  (size) =>
    okResult(`flatten-records-${size}`, "gron --no-sort").seconds /
    okResult(`flatten-records-${size}`, "gronify").seconds,
);

// fastgron's raw flatten lead.
const fastgronLead = recordSizes.map(
  (size) =>
    okResult(`flatten-records-${size}`, "gronify").seconds /
    okResult(`flatten-records-${size}`, "fastgron").seconds,
);
claim(
  fastgronLead.every((ratio) => ratio > 1),
  "fastgron should flatten faster than Gronify at every size",
);

// fastgron -F is the fastest search.
const gronifySearchBig = okResult("search-records-1000mb", "gronify");
const fastgronFSearchBig = okResult("search-records-1000mb", "fastgron -F");
claim(
  workload("search-records-1000mb")
    .results.filter(isMeasured)
    .every((row) => row.seconds >= fastgronFSearchBig.seconds),
  "fastgron -F should be the fastest 1 GB search",
);

// Unflatten: the harness marks Gronify and fastgron as a tie on large inputs.
const unflattenTieIds = [
  "unflatten-records-100mb",
  "unflatten-records-1000mb",
  "unflatten-keyed-100mb",
];
for (const id of unflattenTieIds) {
  claim(
    okResult(id, "gronify").isTie === true && okResult(id, "fastgron").isTie === true,
    `Gronify and fastgron should be marked as a tie on ${id}`,
  );
}
const gronifyUnflattenBig = okResult("unflatten-records-1000mb", "gronify");
const fastgronUnflattenBig = okResult("unflatten-records-1000mb", "fastgron");
claim(
  fastgronUnflattenBig.peakRssBytes > gronifyUnflattenBig.peakRssBytes,
  "fastgron should use more memory than Gronify to unflatten 1 GB",
);

// Early-exit caps.
const cappedIds = recordSizes.flatMap((size) => [
  `capped-flatten-records-${size}`,
  `capped-search-records-${size}`,
]);
const gronifyCapped = cappedIds.map((id) => okResult(id, "gronify").seconds);
const cappedLow = Math.min(...gronifyCapped);
const cappedHigh = Math.max(...gronifyCapped);
const gronCapped100 = okResult("capped-flatten-records-100mb", "gron");
const jqCappedBig = okResult("capped-flatten-records-1000mb", "jq");
claim(
  jqCappedBig.seconds < okResult("capped-flatten-records-1000mb", "gronify").seconds,
  "jq --stream should finish capped runs sooner than Gronify",
);

// jq --stream.
const jqFlattenBig = okResult("flatten-records-1000mb", "jq");
const jqRss = recordSizes.map(
  (size) => okResult(`flatten-records-${size}`, "jq").peakRssBytes,
);
claim(
  Math.max(...jqRss) < gronifyRssLow,
  "jq --stream should use less memory than Gronify",
);

// Deep nesting.
const deepId = "flatten-deep-50000";
const deepPipedId = "flatten-piped-deep-50000";
const deepGronify = okResult(deepPipedId, "gronify");
const deepGronifyDevNull = okResult(deepId, "gronify");
const deepJq = okResult(deepPipedId, "jq");
claim(deepGronify.isFastest === true, "Gronify should be the fastest piped 50,000-level flatten");
const deepDepth = workload(deepId).label.match(/(\d+) levels/)?.[1];
claim(deepDepth !== undefined, "the deep workload label should state its depth");
const deepOtherGronFormat = ["gron", "fastgron", "jaq"].map((tool) => result(deepId, tool));
claim(
  deepOtherGronFormat.every((row) => row.status === "failed"),
  "gron, fastgron, and jaq should all fail on the deep document",
);
const deepDepthText = Number(deepDepth).toLocaleString("en-US");

export const headline = {
  description: `On a ${sizeLabel("flatten-records-1000mb")} file Gronify flattens in ${formatSeconds(gronifyFlattenBig.seconds)} using ${formatBytes(gronifyFlattenBig.peakRssBytes)}. gron timed out at ${timeoutSeconds} s, and gron --no-sort took ${formatSeconds(gronNoSortFlattenBig.seconds)} at ${formatBytes(gronNoSortFlattenBig.peakRssBytes)}. fastgron finished in ${formatSeconds(fastgronFlattenBig.seconds)} but peaked at ${formatBytes(fastgronFlattenBig.peakRssBytes)}.`,
  fastgronAcknowledgement: `fastgron is faster at raw flatten, ${formatRange(Math.min(...fastgronLead), Math.max(...fastgronLead), (n) => n.toFixed(1))}x across these sizes. Gronify uses a fraction of the memory and doesn't fall over: at ${sizeLabel("flatten-records-1000mb")} fastgron peaked at ${formatBytes(fastgronFlattenBig.peakRssBytes)}, ${formatRatio(fastgronFlattenBig.peakRssBytes / gronifyFlattenBig.peakRssBytes)} Gronify's ${formatBytes(gronifyFlattenBig.peakRssBytes)}, and on a ${deepDepthText}-level document it failed.`,
};

export type Point = { title: string; body: string };

export const wins: Point[] = [
  {
    title: "Flat memory",
    body: `Peak memory stays between ${formatBytes(gronifyRssLow)} and ${formatBytes(gronifyRssHigh)} for flatten, search, and unflatten from ${sizeLabel("flatten-records-1mb")} to ${sizeLabel("flatten-records-1000mb")}. From ${lowestFromLabel} up it is the lowest of the gron-format tools.`,
  },
  {
    title: "Unflatten",
    body: `Unflatten speed is a tie with fastgron from ${sizeLabel("unflatten-records-100mb")} up (${formatSeconds(gronifyUnflattenBig.seconds)} against ${formatSeconds(fastgronUnflattenBig.seconds)} on ${formatBytes(unflattenBig.inputBytes)} of gron). The difference is memory: ${formatBytes(gronifyUnflattenBig.peakRssBytes)} against fastgron's ${formatBytes(fastgronUnflattenBig.peakRssBytes)}, ${formatRatio(fastgronUnflattenBig.peakRssBytes / gronifyUnflattenBig.peakRssBytes)} as much.`,
  },
  {
    title: "Against gron",
    body: `${formatRange(Math.min(...speedupVsGron), Math.max(...speedupVsGron), (n) => n.toFixed(1))}x faster to flatten ${sizeLabel("flatten-records-10mb")} and ${sizeLabel("flatten-records-100mb")} files (${formatRange(Math.min(...speedupVsGronNoSort), Math.max(...speedupVsGronNoSort), (n) => n.toFixed(1))}x against gron --no-sort). At ${sizeLabel("flatten-records-1000mb")} gron timed out after ${timeoutSeconds} s, having reached ${gronPeakObserved}. gron --no-sort finished in ${formatSeconds(gronNoSortFlattenBig.seconds)} using ${formatBytes(gronNoSortFlattenBig.peakRssBytes)}.`,
  },
  {
    title: "Early exit",
    body: `With --limit or --max-count, Gronify returns in ${formatRange(cappedLow, cappedHigh, (n) => n.toFixed(2))} s on every size up to ${sizeLabel("flatten-records-1000mb")}. gron needs ${formatSeconds(gronCapped100.seconds)} for the same ten lines of a ${sizeLabel("flatten-records-100mb")} file because it parses the whole document first.`,
  },
  {
    title: "Deep documents",
    body: `It is the only gron-format tool that flattens a ${deepDepthText}-level document: ${formatSeconds(deepGronify.seconds)} with the output piped (${formatSeconds(deepGronifyDevNull.seconds)} to /dev/null), against ${formatSeconds(deepJq.seconds)} for jq --stream. gron, fastgron, and jaq fail.`,
  },
  {
    title: "Key order",
    body: "A flatten and unflatten round trip gives back the original key order. gron and fastgron reorder keys. Numbers stay exact, as they do in the other tools in these checks.",
  },
];

export const losses: Point[] = [
  {
    title: "fastgron flattens faster",
    body: headline.fastgronAcknowledgement,
  },
  {
    title: "fastgron -F searches faster",
    body: `Its fixed-string filter counted the same matches in ${formatSeconds(fastgronFSearchBig.seconds)} against Gronify's ${formatSeconds(gronifySearchBig.seconds)} on ${sizeLabel("search-records-1000mb")}, at ${formatBytes(fastgronFSearchBig.peakRssBytes)}.`,
  },
  {
    title: "jq --stream is smaller",
    body: `jq --stream holds about ${formatBytes(Math.max(...jqRss))} at any size and is the fastest on capped runs (${formatSeconds(jqCappedBig.seconds)} against ${formatSeconds(okResult("capped-flatten-records-1000mb", "gronify").seconds)} on ${sizeLabel("capped-flatten-records-1000mb")}). It emits [path, leaf] events instead of gron lines, and flattening ${sizeLabel("flatten-records-1000mb")} took ${formatSeconds(jqFlattenBig.seconds)}.`,
  },
  {
    title: "Small inputs",
    body: `Below ${lowestFromLabel}, fastgron also uses less memory. A small file still costs Gronify about ${formatBytes(gronifyRssLow)}. fastgron also unflattens ${sizeLabel("unflatten-records-1mb")} and ${sizeLabel("unflatten-records-10mb")} files faster.`,
  },
];

// The "small inputs" sentence about unflatten must hold.
for (const size of ["1mb", "10mb"]) {
  claim(
    okResult(`unflatten-records-${size}`, "fastgron").seconds <
      okResult(`unflatten-records-${size}`, "gronify").seconds,
    `fastgron should unflatten ${size} faster than Gronify`,
  );
}

/* ------------------------------------------------------------------ */
/* Capability matrix                                                   */
/* ------------------------------------------------------------------ */

export const matrixTools = ["gronify", "gron", "fastgron", "jq", "jaq"] as const;

export type MatrixCell = {
  kind: "pass" | "fail" | "na";
  text: string;
  detail?: string;
};

export type MatrixRow = {
  label: string;
  description: string;
  cells: MatrixCell[];
};

function checkResult(prefix: string, tool: string) {
  const check = data.correctness.find((candidate) =>
    candidate.check.startsWith(prefix),
  );
  const found = check?.results.find((candidate) => candidate.tool === tool);
  if (!found) {
    throw new Error(`benchmark-results.json has no "${tool}" result for check "${prefix}"`);
  }
  return found;
}

function checkCell(
  prefix: string,
  tool: string,
  text: { pass: string; fail: string },
  isPass: (note: string) => boolean = () => true,
): MatrixCell {
  const found = checkResult(prefix, tool);
  if (found.pass === null) return { kind: "na", text: "Not applicable" };
  return found.pass && isPass(found.note)
    ? { kind: "pass", text: text.pass }
    : { kind: "fail", text: text.fail };
}

function workloadCell(id: string, tool: string): MatrixCell {
  const found = result(id, tool);
  if (isMeasured(found)) {
    return { kind: "pass", text: "Yes", detail: formatSeconds(found.seconds) };
  }
  if (found.status === "skipped") {
    return { kind: "na", text: statusDisplay(found).label };
  }
  return { kind: "fail", text: statusDisplay(found).label };
}

/** Piped timing where it exists; otherwise the /dev/null run that explains the failure. */
function deepCell(tool: string): MatrixCell {
  const piped = result(deepPipedId, tool);
  return workloadCell(piped.status === "skipped" ? deepId : deepPipedId, tool);
}

function cappedCell(id: string, tool: string): MatrixCell {
  const found = result(id, tool);
  if (isMeasured(found)) {
    return { kind: "pass", text: formatSeconds(found.seconds) };
  }
  return { kind: "na", text: statusDisplay(found).label };
}

const bigIntPrefix = "big integers and trailing-zero decimals survive flatten (";
const roundTripPrefix = "round trip equals the input (3.2 MB";

export const matrix: MatrixRow[] = [
  {
    label: "Big integers kept exact",
    description:
      "12345678901234567890 and 1.10 come out of flatten unchanged",
    cells: matrixTools.map((tool) =>
      checkCell(bigIntPrefix, tool, { pass: "Yes", fail: "No" }),
    ),
  },
  {
    label: "Round trip equals the input",
    description: "flatten, then unflatten, gives back the same JSON",
    cells: matrixTools.map((tool) =>
      checkCell(roundTripPrefix, tool, { pass: "Yes", fail: "No" }),
    ),
  },
  {
    label: "Key order preserved",
    description: "the round trip keeps keys in their original order",
    cells: matrixTools.map((tool) =>
      checkCell(
        roundTripPrefix,
        tool,
        { pass: "Yes", fail: "Reordered" },
        (note) => note.includes("key order preserved"),
      ),
    ),
  },
  {
    label: `Flattens ${deepDepthText} levels deep`,
    description: `one document nested ${deepDepthText} levels, output piped`,
    cells: matrixTools.map((tool) => deepCell(tool)),
  },
  {
    label: "Early exit on caps",
    description: `time to return the first 10 lines of a ${sizeLabel("capped-flatten-records-1000mb")} file`,
    cells: matrixTools.map((tool) =>
      cappedCell("capped-flatten-records-1000mb", tool),
    ),
  },
];

claim(
  matrix[0].cells[0].kind === "pass" &&
    matrix[1].cells[0].kind === "pass" &&
    matrix[2].cells[0].kind === "pass" &&
    matrix[3].cells[0].kind === "pass",
  "Gronify should pass every capability check",
);

claim(
  matrix[2].cells[1].kind === "fail" && matrix[2].cells[2].kind === "fail",
  "gron and fastgron should both reorder keys",
);
claim(
  matrix.every((row) => row.cells[4].kind !== "pass" || row.label !== matrix[1].label),
  "jaq should not be able to round trip",
);

const bigIntFailures = matrixTools.filter(
  (_, index) => matrix[0].cells[index].kind === "fail",
);
export const matrixNote = `Correctness checks ran on small documents before timing. ${
  bigIntFailures.length === 0
    ? "Every tool that supports the check kept big integers exact, so that row is parity, not a Gronify advantage."
    : `${bigIntFailures.join(", ")} did not keep big integers exact.`
} jaq has no inverse of a path and value listing, so it cannot round trip. Cells marked "Not run" were skipped after the tool had already timed out on a smaller step.`;

/** Plain-text summary for the FAQ and its JSON-LD. Every figure comes from the results. */
export const benchmarkFaqAnswer = [
  `Gronify's peak memory stays between ${formatBytes(gronifyRssLow)} and ${formatBytes(gronifyRssHigh)} from ${sizeLabel("flatten-records-1mb")} to ${sizeLabel("flatten-records-1000mb")}, and from ${lowestFromLabel} up it is the lowest of the gron-format tools.`,
  `It flattens ${formatRange(Math.min(...speedupVsGron), Math.max(...speedupVsGron), (n) => n.toFixed(1))}x faster than gron at ${sizeLabel("flatten-records-10mb")} and ${sizeLabel("flatten-records-100mb")}, and gron timed out after ${timeoutSeconds} s at ${sizeLabel("flatten-records-1000mb")}.`,
  `Unflatten speed is a tie with fastgron from ${sizeLabel("unflatten-records-100mb")} up (${formatSeconds(gronifyUnflattenBig.seconds)} against ${formatSeconds(fastgronUnflattenBig.seconds)} at ${sizeLabel("unflatten-records-1000mb")}), but Gronify uses ${formatBytes(gronifyUnflattenBig.peakRssBytes)} where fastgron uses ${formatBytes(fastgronUnflattenBig.peakRssBytes)}.`,
  `fastgron flattens faster, ${formatRange(Math.min(...fastgronLead), Math.max(...fastgronLead), (n) => n.toFixed(1))}x across these sizes, and fastgron -F is the fastest search. jq --stream uses about ${formatBytes(Math.max(...jqRss))} at any size.`,
  `Measured ${environment.date} on ${environment.machine}. Methodology and every result: ${benchmarkUrl}`,
].join(" ");
