import rawResults from "./benchmark-results.json";

/*
 * Server-only module: it imports the full results JSON (samples, commands,
 * paths), so it must only be imported from server components. Client code gets
 * the slim values it needs as props.
 *
 * Everything the benchmark section says is derived from benchmark-results.json,
 * which `npm run bench:compare` writes. Nothing here is a typed-in measurement.
 * Every claim the copy depends on is checked by `claim()` at build time, so
 * regenerated results that no longer support a sentence fail the build instead
 * of shipping a false statement.
 */

type ResultStatus = "ok" | "timeout" | "failed" | "skipped";

type ReasonCode =
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

type BenchResult = {
  tool: string;
  seconds: number | null;
  peakRssBytes: number | null;
  status: ResultStatus;
  reasonCode?: ReasonCode;
  isFastest?: boolean | null;
  isTie?: boolean | null;
  note?: string;
};

type Measured = BenchResult & { seconds: number; peakRssBytes: number };

type Workload = {
  id: string;
  label: string;
  inputBytes: number;
  runs?: number;
  results: BenchResult[];
};

type Check = {
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

const benchmarkUrl =
  "https://github.com/1solomonwakhungu/gronify/blob/main/src/packages/cli/BENCHMARKS.md";
export const reproduceCommand = "npm run bench:compare";
const timeoutSeconds = data.options.timeoutSeconds;
const tiePercent = data.options.tieThreshold * 100;

const MIB = 1024 * 1024;
const GIB = MIB * 1024;

function claim(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(
      `benchmark-results.json no longer supports the copy: ${message}`,
    );
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
    throw new Error(
      `benchmark-results.json has no "${tool}" result for "${workloadId}"`,
    );
  }
  return found;
}

function isMeasured(value: BenchResult): value is Measured {
  return (
    value.status === "ok" &&
    value.seconds !== null &&
    value.peakRssBytes !== null
  );
}

function okResult(workloadId: string, tool: string): Measured {
  const found = result(workloadId, tool);
  claim(isMeasured(found), `${tool} should finish ${workloadId}`);
  return found as Measured;
}

/** Under 0.1 s the second fraction hides the difference, so use milliseconds. */
function formatSeconds(seconds: number): string {
  if (seconds < 0.1) return `${Math.round(seconds * 1000)} ms`;
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
}

function formatBytes(bytes: number): string {
  return bytes >= GIB
    ? `${(bytes / GIB).toFixed(2)} GB`
    : `${Math.round(bytes / MIB)} MB`;
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}x`;
}

function ratioRange(ratios: number[]): string {
  return `${Math.min(...ratios).toFixed(1)} to ${Math.max(...ratios).toFixed(1)}x`;
}

function timeRange(times: number[]): string {
  return `${formatSeconds(Math.min(...times))} to ${formatSeconds(Math.max(...times))}`;
}

function displayTool(tool: string): string {
  return tool === "jq" ? "jq --stream" : tool;
}

/** "records 100 MB" -> "100 MB" */
function sizeLabel(id: string): string {
  const label = workload(id).label.split(": ")[1] ?? workload(id).label;
  return label.replace(/^records /, "");
}

const sizes = ["1mb", "10mb", "100mb", "1000mb"] as const;
type Size = (typeof sizes)[number];
const operations = ["flatten", "search", "unflatten"] as const;
const gronFormatTools = ["gron", "gron --no-sort", "fastgron", "fastgron -F"];
const recordsId = (operation: string, size: Size) =>
  `${operation}-records-${size}`;
const bigSize: Size = "1000mb";
const bigLabel = sizeLabel(recordsId("flatten", bigSize));

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

const environment = {
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
  statusLabel: string;
  statusTone: "danger" | "neutral";
  statusNote?: string;
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
  "over-budget": { label: "Skipped (time budget)", danger: false },
  "after-failure": { label: "Not run", danger: false },
  "no-input": { label: "Skipped (no input)", danger: false },
  timeout: { label: "Timed out", danger: true },
  "memory-guard": { label: "Stopped at memory limit", danger: true },
  "os-oom-kill": { label: "OS out-of-memory kill", danger: true },
  "exit-nonzero": { label: "Failed", danger: true },
  "wrong-output": { label: "Wrong output", danger: true },
};

const statusFallback: Record<ResultStatus, ReasonCode> = {
  ok: "after-failure",
  timeout: "timeout",
  failed: "exit-nonzero",
  skipped: "after-failure",
};

function statusDisplay(row: BenchResult) {
  return reasonLabels[row.reasonCode ?? statusFallback[row.status]];
}

function statusNote(row: BenchResult): string | undefined {
  // Failed runs carry raw shell output and temp paths. Keep those on GitHub.
  if (!row.note || row.status === "failed") return undefined;
  // The label already says "Timed out", so keep only the peak memory seen.
  return row.note.replace(/^not run: /i, "").replace(/^killed after \d+ s timeout /, "");
}

function buildBlock(id: string, title: string, subtitle: string): BarBlock {
  const rows = workload(id).results;
  const measured = rows.filter(isMeasured);
  const maxSeconds = Math.max(...measured.map((row) => row.seconds));
  const maxRss = Math.max(...measured.map((row) => row.peakRssBytes));
  const minRss = Math.min(...measured.map((row) => row.peakRssBytes));

  return {
    id,
    title,
    subtitle: `${subtitle}, best of ${workload(id).runs ?? 3} runs`,
    rows: rows.map((row): BarRow => {
      const display = statusDisplay(row);
      const base = {
        tool: row.tool,
        label: displayTool(row.tool),
        highlight: row.tool === "gronify",
        statusLabel: display.label,
        statusTone: display.danger ? ("danger" as const) : ("neutral" as const),
        statusNote: statusNote(row),
        fastest: false,
        tie: false,
        lowest: false,
      };
      if (!isMeasured(row)) return base;
      return {
        ...base,
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

const unflattenBigId = recordsId("unflatten", bigSize);
const unflattenBigBytes = workload(unflattenBigId).inputBytes;

const barBlocks: BarBlock[] = [
  buildBlock(recordsId("flatten", bigSize), "Flatten", `${bigLabel} JSON file`),
  buildBlock(
    recordsId("search", bigSize),
    "Search (count matches)",
    `${bigLabel} JSON file, case-sensitive match`,
  ),
  buildBlock(
    unflattenBigId,
    "Unflatten",
    `${formatBytes(unflattenBigBytes)} of gron statements (the ${bigLabel} file, flattened)`,
  ),
];

/* ------------------------------------------------------------------ */
/* Derived numbers, each guarded by a claim()                          */
/* ------------------------------------------------------------------ */

const flattenBigId = recordsId("flatten", bigSize);
const gronifyFlattenBig = okResult(flattenBigId, "gronify");
const fastgronFlattenBig = okResult(flattenBigId, "fastgron");
const gronNoSortFlattenBig = okResult(flattenBigId, "gron --no-sort");
const gronFlattenBig = result(flattenBigId, "gron");
claim(gronFlattenBig.status === "timeout", "gron should time out flattening 1 GB");
const gronPeakObserved = /peak observed ([\d.]+ GB)/.exec(
  gronFlattenBig.note ?? "",
)?.[1];
claim(
  gronPeakObserved !== undefined,
  "gron's timeout result should record the peak memory observed",
);

// Memory. Gronify stays flat; it is the lowest gron-format tool from some size up.
const gronifyRss = sizes.flatMap((size) =>
  operations.map((op) => okResult(recordsId(op, size), "gronify").peakRssBytes),
);
const gronifyRssLow = Math.min(...gronifyRss);
const gronifyRssHigh = Math.max(...gronifyRss);
claim(
  gronifyRssHigh < 2 * gronifyRssLow,
  "Gronify's peak memory should stay within 2x across sizes and operations",
);

function gronifyIsLowest(size: Size): boolean {
  return operations.every((op) => {
    const id = recordsId(op, size);
    const gronify = okResult(id, "gronify").peakRssBytes;
    return workload(id)
      .results.filter(
        (row) => gronFormatTools.includes(row.tool) && isMeasured(row),
      )
      .every((row) => gronify < (row.peakRssBytes as number));
  });
}
const lowestFrom = sizes.find(gronifyIsLowest);
claim(lowestFrom !== undefined, "Gronify should be the lowest-memory gron-format tool at some size");
const lowestFromIndex = sizes.indexOf(lowestFrom as Size);
claim(lowestFromIndex > 0, "the crossover should not be the smallest size");
claim(
  sizes.slice(lowestFromIndex).every(gronifyIsLowest),
  "Gronify should stay the lowest-memory gron-format tool at every larger size",
);
claim(
  sizes.slice(0, lowestFromIndex).every((size) =>
    operations.every(
      (op) =>
        okResult(recordsId(op, size), "fastgron").peakRssBytes <
        okResult(recordsId(op, size), "gronify").peakRssBytes,
    ),
  ),
  "fastgron should use less memory than Gronify for flatten, search, and unflatten below the crossover",
);
claim(
  sizes
    .slice(lowestFromIndex)
    .every(
      (size) =>
        okResult(recordsId("flatten", size), "gronify").peakRssBytes <
        0.5 * okResult(recordsId("flatten", size), "fastgron").peakRssBytes,
    ),
  "Gronify should use under half of fastgron's flatten memory from the crossover up",
);
const lowestFromLabel = sizeLabel(recordsId("flatten", lowestFrom as Size));
const smallLabel = sizeLabel(recordsId("flatten", sizes[0]));
const fastgronSmallRss = okResult(recordsId("flatten", sizes[0]), "fastgron").peakRssBytes;

// Speed against gron, on the sizes where gron finished and the whole-document
// parse dominates.
const gronSizes: Size[] = ["10mb", "100mb"];
const speedupVs = (tool: string) =>
  gronSizes.map((size) => {
    const ratio =
      okResult(recordsId("flatten", size), tool).seconds /
      okResult(recordsId("flatten", size), "gronify").seconds;
    claim(ratio > 1, `Gronify should flatten ${size} faster than ${tool}`);
    return ratio;
  });
const speedupVsGron = speedupVs("gron");
const speedupVsGronNoSort = speedupVs("gron --no-sort");

// fastgron's raw flatten lead.
const fastgronLead = sizes.map((size) => {
  const ratio =
    okResult(recordsId("flatten", size), "gronify").seconds /
    okResult(recordsId("flatten", size), "fastgron").seconds;
  claim(ratio > 1, `fastgron should flatten ${size} faster than Gronify`);
  return ratio;
});

// fastgron -F is the fastest 1 GB search.
const searchBigId = recordsId("search", bigSize);
const gronifySearchBig = okResult(searchBigId, "gronify");
const fastgronFSearchBig = okResult(searchBigId, "fastgron -F");
claim(
  fastgronFSearchBig.isFastest === true,
  "fastgron -F should be marked fastest on the 1 GB search",
);

// Unflatten: the harness marks Gronify and fastgron as tied on large inputs and
// fastgron as clearly faster on small ones.
for (const id of [
  recordsId("unflatten", "100mb"),
  unflattenBigId,
  "unflatten-keyed-100mb",
]) {
  claim(
    okResult(id, "gronify").isTie === true &&
      okResult(id, "fastgron").isTie === true,
    `Gronify and fastgron should be marked as a tie on ${id}`,
  );
}
for (const size of ["1mb", "10mb"] as const) {
  const id = recordsId("unflatten", size);
  claim(
    okResult(id, "fastgron").isFastest === true &&
      okResult(id, "fastgron").seconds < okResult(id, "gronify").seconds,
    `fastgron should unflatten ${size} faster than Gronify`,
  );
}
const gronifyUnflattenBig = okResult(unflattenBigId, "gronify");
const fastgronUnflattenBig = okResult(unflattenBigId, "fastgron");
claim(
  fastgronUnflattenBig.peakRssBytes > 10 * gronifyUnflattenBig.peakRssBytes,
  "fastgron should use over 10x Gronify's memory to unflatten 1 GB",
);

// Early-exit caps.
const cappedFlattenIds = sizes.map((size) => `capped-flatten-records-${size}`);
const cappedIds = sizes.flatMap((size) => [
  `capped-flatten-records-${size}`,
  `capped-search-records-${size}`,
]);
const gronifyCapped = cappedIds.map((id) => okResult(id, "gronify").seconds);
const gronCapped100 = okResult("capped-flatten-records-100mb", "gron");
const cappedFlattenBigId = cappedFlattenIds[cappedFlattenIds.length - 1];
const jqCappedBig = okResult(cappedFlattenBigId, "jq");
const gronifyCappedBig = okResult(cappedFlattenBigId, "gronify");
claim(
  cappedFlattenIds.every((id) => okResult(id, "jq").isFastest === true),
  "jq --stream should be marked fastest on every capped flatten",
);

// jq --stream memory.
const jqRss = sizes.map(
  (size) => okResult(recordsId("flatten", size), "jq").peakRssBytes,
);
claim(
  Math.max(...jqRss) < gronifyRssLow,
  "jq --stream should use less memory than Gronify at every size",
);
const jqFlattenBig = okResult(flattenBigId, "jq");

// Deep nesting.
const deepId = "flatten-deep-50000";
const deepPipedId = "flatten-piped-deep-50000";
const deepGronify = okResult(deepPipedId, "gronify");
const deepGronifyDevNull = okResult(deepId, "gronify");
const deepJq = okResult(deepPipedId, "jq");
claim(deepGronify.isFastest === true, "Gronify should be fastest on the piped 50,000-level flatten");
const deepDepth = workload(deepId).label.match(/(\d+) levels/)?.[1];
claim(deepDepth !== undefined, "the deep workload label should state its depth");
claim(
  ["gron", "gron --no-sort", "fastgron", "jaq"].every(
    (tool) => result(deepId, tool).status === "failed",
  ),
  "gron, fastgron, and jaq should all fail on the deep document",
);
const deepDepthText = Number(deepDepth).toLocaleString("en-US");

/* ------------------------------------------------------------------ */
/* Round-trip checks                                                   */
/* ------------------------------------------------------------------ */

function checkResult(prefix: string, tool: string) {
  const check = data.correctness.find((candidate) =>
    candidate.check.startsWith(prefix),
  );
  const found = check?.results.find((candidate) => candidate.tool === tool);
  if (!found) {
    throw new Error(
      `benchmark-results.json has no "${tool}" result for check "${prefix}"`,
    );
  }
  return found;
}

const bigIntPrefix = "big integers and trailing-zero decimals survive flatten (";
const roundTripPrefix = "round trip equals the input (3.2 MB";
const edgePrefix = "round trip equals the input (edge cases";
const roundTripTools = ["gronify", "gron", "fastgron", "jq"] as const;

function edgeCase(tool: string) {
  const found = checkResult(edgePrefix, tool);
  return {
    keyOrder: /key order (preserved|changed)/.exec(found.note)?.[1],
    numbers: /number spellings (kept verbatim|normalised)/.exec(found.note)?.[1],
    examples: /number spellings [^(]*\(([^)]*)\)/.exec(found.note)?.[1],
    pass: found.pass,
  };
}

const edge = Object.fromEntries(
  roundTripTools.map((tool) => [tool, edgeCase(tool)]),
);
const spellings = edge.gronify.examples;
claim(spellings !== undefined, "the edge-case check should list its number spellings");
claim(
  roundTripTools.every((tool) => edge[tool].pass === true) &&
    edge.gronify.keyOrder === "preserved" &&
    edge.gronify.numbers === "kept verbatim",
  "Gronify should round trip the edge cases with key order and number spellings intact",
);
const reordersKeys = roundTripTools.filter((tool) => edge[tool].keyOrder === "changed");
const normalisesNumbers = roundTripTools.filter((tool) => edge[tool].numbers === "normalised");
claim(
  reordersKeys.join() === "gron,fastgron" && normalisesNumbers.join() === "jq" && edge.jq.keyOrder === "preserved",
  "gron and fastgron should reorder keys, and jq should keep order but normalise number spellings",
);
for (const tool of roundTripTools) {
  claim(
    checkResult(roundTripPrefix, tool).note.includes("key order preserved") ===
      (edge[tool].keyOrder === "preserved"),
    `the 3.2 MB and edge-case round trips should agree on key order for ${tool}`,
  );
}

/* ------------------------------------------------------------------ */
/* Prose                                                               */
/* ------------------------------------------------------------------ */

const fastgronAcknowledgement = `fastgron is faster at raw flatten, ${ratioRange(fastgronLead)} across these sizes. From ${lowestFromLabel} up Gronify uses a fraction of the memory: at ${bigLabel} fastgron peaked at ${formatBytes(fastgronFlattenBig.peakRssBytes)}, ${formatRatio(fastgronFlattenBig.peakRssBytes / gronifyFlattenBig.peakRssBytes)} Gronify's ${formatBytes(gronifyFlattenBig.peakRssBytes)}. fastgron also failed on a ${Number(deepDepth).toLocaleString("en-US")}-level document.`;

const headline = {
  description: `On a ${bigLabel} file Gronify flattens in ${formatSeconds(gronifyFlattenBig.seconds)} using ${formatBytes(gronifyFlattenBig.peakRssBytes)}. gron timed out at ${timeoutSeconds} s, and gron --no-sort took ${formatSeconds(gronNoSortFlattenBig.seconds)} at ${formatBytes(gronNoSortFlattenBig.peakRssBytes)}. fastgron finished in ${formatSeconds(fastgronFlattenBig.seconds)} but peaked at ${formatBytes(fastgronFlattenBig.peakRssBytes)}.`,
};

export type Point = { title: string; body: string };

const keyOrderBody = `A flatten and unflatten round trip gives back the original key order and keeps number spellings (${spellings}) as written. ${reordersKeys.join(" and ")} reorder keys. ${normalisesNumbers.map(displayTool).join(" and ")} keeps key order but normalises those number spellings.`;

const wins: Point[] = [
  {
    title: "Flat memory",
    body: `Peak memory stays between ${formatBytes(gronifyRssLow)} and ${formatBytes(gronifyRssHigh)} for flatten, search, and unflatten from ${smallLabel} to ${bigLabel}. From ${lowestFromLabel} up it is the lowest of the gron-format tools.`,
  },
  {
    title: "Unflatten memory",
    body: `Unflatten speed is a tie with fastgron from ${sizeLabel(recordsId("unflatten", "100mb"))} up (${formatSeconds(gronifyUnflattenBig.seconds)} against ${formatSeconds(fastgronUnflattenBig.seconds)} on the ${bigLabel} file's ${formatBytes(unflattenBigBytes)} of gron). The difference is memory: ${formatBytes(gronifyUnflattenBig.peakRssBytes)} against fastgron's ${formatBytes(fastgronUnflattenBig.peakRssBytes)}, ${formatRatio(fastgronUnflattenBig.peakRssBytes / gronifyUnflattenBig.peakRssBytes)} as much.`,
  },
  {
    title: "Against gron",
    body: `${ratioRange(speedupVsGron)} faster to flatten ${sizeLabel(recordsId("flatten", "10mb"))} and ${sizeLabel(recordsId("flatten", "100mb"))} files (${ratioRange(speedupVsGronNoSort)} against gron --no-sort). At ${bigLabel} gron timed out after ${timeoutSeconds} s, having reached ${gronPeakObserved}. gron --no-sort finished in ${formatSeconds(gronNoSortFlattenBig.seconds)} using ${formatBytes(gronNoSortFlattenBig.peakRssBytes)}.`,
  },
  {
    title: "Early exit",
    body: `With --limit or --max-count, Gronify returns in ${timeRange(gronifyCapped)} on every size up to ${bigLabel}. gron needs ${formatSeconds(gronCapped100.seconds)} for the same ten lines of a ${sizeLabel("flatten-records-100mb")} file because it parses the whole document first.`,
  },
  {
    title: "Deep documents",
    body: `It is the only gron-format tool that flattens a ${deepDepthText}-level document: ${formatSeconds(deepGronify.seconds)} with the output piped (${formatSeconds(deepGronifyDevNull.seconds)} to /dev/null), against ${formatSeconds(deepJq.seconds)} for jq --stream. gron, fastgron, and jaq fail.`,
  },
  {
    title: "Key order",
    body: keyOrderBody,
  },
];

const losses: Point[] = [
  {
    title: "fastgron flattens faster",
    body: fastgronAcknowledgement,
  },
  {
    title: "fastgron -F searches faster",
    body: `Its fixed-string filter counted the same matches in ${formatSeconds(fastgronFSearchBig.seconds)} against Gronify's ${formatSeconds(gronifySearchBig.seconds)} on ${bigLabel}, at ${formatBytes(fastgronFSearchBig.peakRssBytes)}.`,
  },
  {
    title: "jq --stream is smaller",
    body: `jq --stream holds about ${formatBytes(Math.max(...jqRss))} at any size and is the fastest on every capped flatten (${formatSeconds(jqCappedBig.seconds)} against ${formatSeconds(gronifyCappedBig.seconds)} on ${bigLabel}). It emits [path, leaf] events instead of gron lines, and flattening ${bigLabel} took ${formatSeconds(jqFlattenBig.seconds)}.`,
  },
  {
    title: "Small inputs",
    body: `Below ${lowestFromLabel}, fastgron uses less memory for flatten, search, and unflatten (${formatBytes(fastgronSmallRss)} against Gronify's ${formatBytes(okResult(recordsId("flatten", sizes[0]), "gronify").peakRssBytes)} to flatten ${smallLabel}). fastgron also unflattens ${sizeLabel(recordsId("unflatten", "1mb"))} and ${sizeLabel(recordsId("unflatten", "10mb"))} files faster.`,
  },
];

/** Plain-text summary for the FAQ and its JSON-LD. Every figure comes from the results. */
export const benchmarkFaqAnswer = [
  `Gronify's peak memory stays between ${formatBytes(gronifyRssLow)} and ${formatBytes(gronifyRssHigh)} from ${smallLabel} to ${bigLabel}, and from ${lowestFromLabel} up it is the lowest of the gron-format tools. Below that, fastgron uses less.`,
  `It flattens ${ratioRange(speedupVsGron)} faster than gron at ${sizeLabel(recordsId("flatten", "10mb"))} and ${sizeLabel(recordsId("flatten", "100mb"))}, and gron timed out after ${timeoutSeconds} s at ${bigLabel}.`,
  `Unflatten speed is a tie with fastgron from ${sizeLabel(recordsId("unflatten", "100mb"))} up: ${formatSeconds(gronifyUnflattenBig.seconds)} against ${formatSeconds(fastgronUnflattenBig.seconds)} on the ${bigLabel} file's ${formatBytes(unflattenBigBytes)} of gron. Gronify uses ${formatBytes(gronifyUnflattenBig.peakRssBytes)} and fastgron uses ${formatBytes(fastgronUnflattenBig.peakRssBytes)}.`,
  `fastgron flattens faster, ${ratioRange(fastgronLead)} across these sizes, and fastgron -F is the fastest ${bigLabel} search. jq --stream uses about ${formatBytes(Math.max(...jqRss))} at any size.`,
  `Measured ${environment.date} on ${environment.machine}; jq was ${data.tools.jq}. Methodology and every result: ${benchmarkUrl}`,
].join(" ");

/* ------------------------------------------------------------------ */
/* Capability matrix                                                   */
/* ------------------------------------------------------------------ */

const matrixTools = ["gronify", "gron", "fastgron", "jq", "jaq"] as const;

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
  return {
    kind: found.status === "skipped" ? "na" : "fail",
    text: statusDisplay(found).label,
  };
}

/** Piped timing where it exists; otherwise the /dev/null run that explains the failure. */
function deepCell(tool: string): MatrixCell {
  const piped = result(deepPipedId, tool);
  return workloadCell(piped.status === "skipped" ? deepId : deepPipedId, tool);
}

/**
 * A tool exits early when it returns without holding much of the file. A tool
 * that is quick only because it maps the whole file gets a neutral mark.
 */
const earlyExitMaxShare = 0.1;
function cappedCell(tool: string): MatrixCell {
  const found = result(cappedFlattenBigId, tool);
  if (!isMeasured(found)) {
    return { kind: "na", text: statusDisplay(found).label };
  }
  const inputBytes = workload(cappedFlattenBigId).inputBytes;
  return found.peakRssBytes < earlyExitMaxShare * inputBytes
    ? { kind: "pass", text: formatSeconds(found.seconds) }
    : {
        kind: "na",
        text: formatSeconds(found.seconds),
        detail: `peak memory ${formatBytes(found.peakRssBytes)}`,
      };
}

const cappedKinds = Object.fromEntries(
  matrixTools.map((tool) => [tool, cappedCell(tool).kind]),
);
claim(
  cappedKinds.gronify === "pass" &&
    cappedKinds.jq === "pass" &&
    cappedKinds.fastgron === "na",
  "Gronify and jq should stop early on the 1 GB capped flatten and fastgron should hold the file in memory",
);

const matrix: MatrixRow[] = [
  {
    label: "Big integers kept exact",
    description: "12345678901234567890 and 1.10 come out of flatten unchanged",
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
        edgePrefix,
        tool,
        { pass: "Yes", fail: "Reordered" },
        (note) => note.includes("key order preserved"),
      ),
    ),
  },
  {
    label: "Number spellings kept",
    description: `${spellings} come out of the round trip as written`,
    cells: matrixTools.map((tool) =>
      checkCell(
        edgePrefix,
        tool,
        { pass: "Yes", fail: "Normalised" },
        (note) => note.includes("number spellings kept verbatim"),
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
    description: `time to return the first 10 lines of a ${bigLabel} file. A check mark means peak memory stayed under ${earlyExitMaxShare * 100}% of the file`,
    cells: matrixTools.map((tool) => cappedCell(tool)),
  },
];

const cellKind = (row: number, tool: (typeof matrixTools)[number]) =>
  matrix[row].cells[matrixTools.indexOf(tool)].kind;
claim(
  [0, 1, 2, 3, 4, 5].every((row) => cellKind(row, "gronify") === "pass"),
  "Gronify should pass every capability check",
);
claim(
  cellKind(2, "gron") === "fail" &&
    cellKind(2, "fastgron") === "fail" &&
    cellKind(2, "jq") === "pass" &&
    cellKind(3, "jq") === "fail",
  "the key-order and number-spelling rows should match the copy",
);
claim(
  matrixTools.every(
    (tool) => tool === "jaq" || cellKind(1, tool) === "pass",
  ) && cellKind(1, "jaq") === "na",
  "every tool except jaq should round trip, and jaq should be not applicable",
);

const bigIntFailures = matrixTools.filter((tool) => cellKind(0, tool) === "fail");

const jaqNote = checkResult(roundTripPrefix, "jaq").note.replace(/^n\/a: /, "");
claim(jaqNote.startsWith("jaq "), "jaq's not-applicable note should explain jaq's limit");

const notRunNotes = data.workloads.flatMap((w) =>
  w.results
    .filter((row) => row.reasonCode === "after-failure")
    .map((row) => row.note ?? ""),
);
claim(
  notRunNotes.length > 0 &&
    notRunNotes.every((note) => /timed out|timeout|failed/.test(note)),
  'every "Not run" result should follow a timeout or failure',
);

const matrixNote = `Correctness checks ran on small documents before timing. ${
  bigIntFailures.length === 0
    ? "Every tool kept big integers exact, so that row is parity, not a Gronify advantage."
    : `${bigIntFailures.map(displayTool).join(", ")} did not keep big integers exact.`
} ${jaqNote}. "Not run" means the tool timed out or failed on the same input or a smaller one in an earlier workload.`;

const jqBigInt = checkResult(bigIntPrefix, "jq");
claim(
  jqBigInt.pass === true && edge.jq.numbers === "normalised",
  "jq should keep big integers verbatim and normalise number spellings",
);
const cappedSearchBig = okResult("capped-search-records-1000mb", "gronify");
const deepGronifyRss = deepGronify.peakRssBytes;

/**
 * Figures the ecosystem-comparison copy quotes, so the two sections cannot
 * disagree. Derived, never typed in.
 */
const comparisonFacts = {
  jqVersion: data.tools.jq,
  measuredOn: `${data.machine.cpu}, Node.js ${data.machine.node.replace(/^v(\d+).*/, "$1")}`,
  numberSpellings: spellings,
  unflatten: `unflattening the ${bigLabel} file's ${formatBytes(unflattenBigBytes)} of gron takes ${formatSeconds(gronifyUnflattenBig.seconds)} at ${formatBytes(gronifyUnflattenBig.peakRssBytes)} RSS, a tie with fastgron, which needs ${formatBytes(fastgronUnflattenBig.peakRssBytes)} of memory`,
  deep: `flattens a ${deepDepthText}-level document in ${formatSeconds(deepGronify.seconds)} at ${formatBytes(deepGronifyRss)} RSS`,
  capped: `search -m 10 on a ${bigLabel} file returns in ${formatSeconds(cappedSearchBig.seconds)} at ${formatBytes(cappedSearchBig.peakRssBytes)} RSS`,
};

/** The only thing client code receives: plain, already-derived values. */
export const benchmarkView = {
  comparisonFacts,
  headlineDescription: headline.description,
  benchmarkUrl,
  timeoutSeconds,
  tiePercent,
  environment,
  barBlocks,
  wins,
  losses,
  matrixNote,
  matrixTools: matrixTools.map((tool) => ({ key: tool, label: displayTool(tool) })),
  matrix,
};

export type BenchmarkView = typeof benchmarkView;
