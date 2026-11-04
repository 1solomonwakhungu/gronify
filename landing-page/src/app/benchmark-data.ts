import rawResults from "./benchmark-results.json";

/*
 * Server-only module: it imports the full results JSON (samples, commands,
 * paths), so it must only be imported from server components. Client code gets
 * the slim values it needs as props.
 *
 * Every figure derives from benchmark-results.json, which `npm run bench:compare`
 * writes. Nothing here is a typed-in measurement.
 * Copy describes the recorded outcomes rather than requiring a particular winner.
 * Missing or invalid measurements are never turned into performance claims.
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
  options: { timeoutSeconds: number; tieThreshold: number; statistic?: string };
  provenance?: { sourceCommit?: string; dirtyState?: string };
  workloads: Workload[];
  correctness: Check[];
};

const data = rawResults as unknown as BenchmarkResults;

const benchmarkUrl =
  "https://github.com/1solomonwakhungu/gronify/blob/main/src/packages/cli/BENCHMARKS.md";
export const reproduceCommand =
  "npm run bench:compare -- --runs 3 --timeout 60 --max-rss-gb 8 --budget 45";
const timeoutSeconds = data.options.timeoutSeconds;
const tiePercent = data.options.tieThreshold * 100;

const MIB = 1024 * 1024;
const GIB = MIB * 1024;

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
    typeof value.seconds === "number" &&
    Number.isFinite(value.seconds) &&
    value.seconds > 0 &&
    typeof value.peakRssBytes === "number" &&
    Number.isFinite(value.peakRssBytes) &&
    value.peakRssBytes > 0
  );
}

// Reject corrupt successful records, without prescribing which tool should win.
for (const entry of data.workloads) {
  for (const row of entry.results) {
    if (row.status === "ok" && !isMeasured(row)) {
      throw new Error(`Invalid timing or RSS for ${entry.id}/${row.tool}`);
    }
  }
}

/** Under 0.1 s the second fraction hides the difference, so use milliseconds. */
function formatSeconds(seconds: number): string {
  if (seconds < 0.1) return `${Math.round(seconds * 1000)} ms`;
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
}

function formatBytes(bytes: number): string {
  return bytes >= GIB
    ? `${(bytes / GIB).toFixed(2)} GiB`
    : `${Math.round(bytes / MIB)} MiB`;
}

function displayTool(tool: string): string {
  return tool === "jq"
    ? "jq --stream (parser events)"
    : tool === "gronify"
      ? "Gronify"
      : tool;
}

type Size = "1mb" | "10mb" | "100mb" | "1000mb";

const recordsId = (operation: string, size: Size) =>
  `${operation}-records-${size}`;
const bigSize: Size = "1000mb";
const bigLabel = formatBytes(
  workload(recordsId("flatten", bigSize)).inputBytes,
);

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

const environment = {
  date: data.generatedAt.slice(0, 10),
  sourceCommit: data.provenance?.sourceCommit ?? "",
  statistic: data.options.statistic ?? "best",
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
  "memory-guard": { label: "Exceeded memory limit", danger: true },
  "os-oom-kill": { label: "SIGKILL (cause unverified)", danger: true },
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
  return row.note
    .replace(/^not run: /i, "")
    .replace(/^killed after \d+ s timeout /, "");
}

function buildBlock(id: string, title: string, subtitle: string): BarBlock {
  const rows = workload(id).results;
  const measured = rows.filter(isMeasured);
  const maxSeconds = Math.max(...measured.map((row) => row.seconds));
  const maxRss = Math.max(...measured.map((row) => row.peakRssBytes));

  return {
    id,
    title,
    subtitle: `${subtitle}; ${environment.statistic} of ${workload(id).runs ?? 3} runs`,
    rows: rows.map((row): BarRow => {
      const display = statusDisplay(row);
      const base = {
        tool: row.tool,
        label: displayTool(row.tool),
        highlight: row.tool === "gronify",
        statusLabel: display.label,
        statusTone: display.danger ? ("danger" as const) : ("neutral" as const),
        statusNote: statusNote(row),
      };
      if (!isMeasured(row)) return base;
      return {
        ...base,
        timeText: formatSeconds(row.seconds),
        rssText: formatBytes(row.peakRssBytes),
        timePercent: (row.seconds / maxSeconds) * 100,
        rssPercent: (row.peakRssBytes / maxRss) * 100,
      };
    }),
  };
}

const unflattenBigId = recordsId("unflatten", bigSize);
const flattenBigId = recordsId("flatten", bigSize);
const searchBigId = recordsId("search", bigSize);

function measuredText(id: string, tool = "gronify"): string {
  const row = result(id, tool);
  return isMeasured(row)
    ? `${formatSeconds(row.seconds)} at ${formatBytes(row.peakRssBytes)} peak RSS`
    : statusDisplay(row).label.toLowerCase();
}

const headlineDescription = `On the ${bigLabel} records flatten fixture, Gronify recorded ${measuredText(flattenBigId)}.`;

const barBlocks: BarBlock[] = [
  buildBlock(
    flattenBigId,
    "Flatten",
    `${formatBytes(workload(flattenBigId).inputBytes)} JSON`,
  ),
  buildBlock(
    searchBigId,
    "Search (count matches)",
    `${formatBytes(workload(searchBigId).inputBytes)} JSON, case-sensitive match`,
  ),
  buildBlock(
    unflattenBigId,
    "Unflatten",
    `${formatBytes(workload(unflattenBigId).inputBytes)} gron statements from the same JSON`,
  ),
  buildBlock(
    "capped-search-records-1000mb",
    "Stop after 10 matches",
    `${bigLabel} records fixture, matches near the start`,
  ),
];

export type Point = { title: string; body: string };
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

const records = data.workloads.filter((w) =>
  /^(flatten|search|unflatten)-records-/.test(w.id),
);
const gronifyMeasurements = records.flatMap((w) =>
  w.results.filter((r) => r.tool === "gronify" && isMeasured(r)),
) as Measured[];
const memoryRange = gronifyMeasurements.length
  ? `${formatBytes(Math.min(...gronifyMeasurements.map((r) => r.peakRssBytes)))} to ${formatBytes(Math.max(...gronifyMeasurements.map((r) => r.peakRssBytes)))}`
  : "not measured";

const gronifyLargeFlatten = result(flattenBigId, "gronify");
const fastLargeFlatten = result(flattenBigId, "fastgron");
const memoryComparison =
  isMeasured(gronifyLargeFlatten) && isMeasured(fastLargeFlatten)
    ? ` On the ${bigLabel} flatten fixture, Gronify used ${((gronifyLargeFlatten.peakRssBytes / fastLargeFlatten.peakRssBytes) * 100).toFixed(1)}% of fastgron's peak RSS; elapsed times are shown above.`
    : "";

const wins: Point[] = [
  {
    title: "Memory across the measured sizes",
    body: `Completed Gronify flatten, search, and unflatten workloads used ${memoryRange} peak RSS across ${formatBytes(workload("flatten-records-1mb").inputBytes)} to ${bigLabel} records fixtures.${memoryComparison} Memory depends on document shape, depth, token size, flags, and output handling; this is not a fixed memory guarantee.`,
  },
  {
    title: "Read only as far as the cap",
    body: `On the ${bigLabel} fixture, search -m 10 recorded ${measuredText("capped-search-records-1000mb")}. A cap stops reading once enough matches are found. A late or absent match still requires scanning more input.`,
  },
  {
    title: "Reconstruct JSON in document order",
    body: `Gronify unflatten recorded ${measuredText(unflattenBigId)} for ${formatBytes(workload(unflattenBigId).inputBytes)} of gron statements. Out-of-order input and sorting use different buffering paths.`,
  },
];

const losses: Point[] = [
  {
    title: "Compare the alternatives",
    body: `On the same ${bigLabel} flatten workload, fastgron recorded ${measuredText(flattenBigId, "fastgron")}; gron recorded ${measuredText(flattenBigId, "gron")}; gron --no-sort recorded ${measuredText(flattenBigId, "gron --no-sort")}. Their ordering and formatting contracts differ.`,
  },
  {
    title: "jq produces a different output",
    body: `jq --stream recorded ${measuredText(flattenBigId, "jq")}. It emits parser events rather than gron assignments. These timings compare end-to-end workflows, not identical output bytes or interchangeable features.`,
  },
  {
    title: "Startup and shared-host variation",
    body: `Process startup is included. Small-input results can be dominated by runtime startup, and shared-host load can move close timings. A ${tiePercent}% tie band is a display rule, not a statistical significance test.`,
  },
];

const matrixTools = ["gronify", "gron", "fastgron", "jq", "jaq"] as const;
const matrix: MatrixRow[] = data.correctness.map((check) => ({
  label: check.check,
  description: "",
  cells: matrixTools.map((tool): MatrixCell => {
    const entry = check.results.find((r) => r.tool === tool);
    if (!entry || entry.pass === null)
      return {
        kind: "na",
        text: "Not applicable",
        detail: entry ? "Unsupported by this workflow" : undefined,
      };
    return {
      kind: entry.pass ? "pass" : "fail",
      text: entry.pass ? "Passed" : "Failed",
      detail: entry.pass ? undefined : "See raw correctness result",
    };
  }),
}));

const deep = data.workloads.find((w) => w.id === "flatten-piped-deep-50000");
const deepGronify = deep?.results.find((r) => r.tool === "gronify");
if (deep) {
  matrix.push({
    label: "50,000 levels deep, output piped",
    description: "Timing includes writing the expanded paths to a consumer.",
    cells: matrixTools.map((tool): MatrixCell => {
      const row = deep.results.find((r) => r.tool === tool);
      if (!row) return { kind: "na", text: "Not run" };
      return isMeasured(row)
        ? {
            kind: "pass",
            text: formatSeconds(row.seconds),
            detail: `${formatBytes(row.peakRssBytes)} peak RSS`,
          }
        : {
            kind: row.status === "skipped" ? "na" : "fail",
            text: statusDisplay(row).label,
          };
    }),
  });
}
const edgeCheck = data.correctness.find((c) =>
  c.check.startsWith("round trip equals the input (edge cases"),
);
const gronifyNumberCheck = edgeCheck?.results.find((r) => r.tool === "gronify");
const jqNumberCheck = edgeCheck?.results.find((r) => r.tool === "jq");
const numberSpellings =
  /number spellings [^(]*\(([^)]*)\)/.exec(
    gronifyNumberCheck?.note ?? "",
  )?.[1] ?? "the tested number spellings";
const numericCheck =
  gronifyNumberCheck?.pass &&
  gronifyNumberCheck.note.includes("kept verbatim") &&
  jqNumberCheck?.pass &&
  jqNumberCheck.note.includes("normalised")
    ? `In the edge-case round trip, Gronify kept ${numberSpellings} as written; jq ${data.tools.jq} normalised those spellings.`
    : "The correctness table below records the exact-number and round-trip checks for each tool.";
const comparisonFacts = {
  jqVersion: data.tools.jq,
  measuredOn: `${data.machine.cpu}, Node.js ${data.machine.node}; measured ${environment.date}`,
  numericCheck,
  unflatten: `unflatten recorded ${measuredText(unflattenBigId)} on ${formatBytes(workload(unflattenBigId).inputBytes)} of gron`,
  deep:
    deepGronify && isMeasured(deepGronify)
      ? `flattens the 50,000-level fixture with piped output in ${formatSeconds(deepGronify.seconds)} at ${formatBytes(deepGronify.peakRssBytes)} RSS`
      : "supports iterative parsing for deeply nested documents; see the recorded depth workload outcomes below",
  capped: `search -m 10 on the ${bigLabel} fixture recorded ${measuredText("capped-search-records-1000mb")}`,
};

export const benchmarkFaqAnswer = `${headlineDescription} ${wins.map((p) => p.body).join(" ")} ${losses[0].body} Measured ${environment.date} on ${environment.machine}${environment.sourceCommit ? ` at source commit ${environment.sourceCommit.slice(0, 12)}` : ""}. Methodology and raw results: ${benchmarkUrl}`;

export const benchmarkView = {
  comparisonFacts,
  headlineDescription,
  benchmarkUrl,
  rawResultsUrl:
    "https://github.com/1solomonwakhungu/gronify/blob/main/landing-page/src/app/benchmark-results.json",
  sourceUrl: environment.sourceCommit
    ? `https://github.com/1solomonwakhungu/gronify/tree/${environment.sourceCommit}`
    : null,
  timeoutSeconds,
  tiePercent,
  environment,
  barBlocks,
  wins,
  losses,
  matrixNote:
    "These checks use small fixtures before timing. Passing them establishes only the tested cases. A skipped or unsupported check is not a failure. Full commands, raw samples, and failures are retained with the benchmark data.",
  matrixTools: matrixTools.map((tool) => ({
    key: tool,
    label: displayTool(tool),
  })),
  matrix,
};

export type BenchmarkView = typeof benchmarkView;
