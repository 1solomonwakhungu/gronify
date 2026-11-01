#!/usr/bin/env node
// Cross-tool benchmark: gronify vs gron, fastgron, jq and jaq on the same generated inputs.
//
//   npm run build && npm run bench:compare
//   npm run bench:compare -- --sizes 10,100 --deep 2000 --runs 3
//   npm run bench:compare -- --out-json /tmp/r.json --out-md /tmp/r.md     (do not touch the committed results)
//
// Inputs are generated into a temp directory and deleted afterwards. Every timed command writes to /dev/null (the
// search workloads print one count, the capped workloads ten lines; those are captured so they can be validated).
// Wall time and peak RSS come from /usr/bin/time (-l on macOS, -v on Linux) wrapped around `bash -c '<command>'`, so
// pipelines such as `gron f | grep -c x` are timed as a whole and the RSS is that of the largest process in them.
// Tools that are not installed, or that fail, time out or exceed the memory guard, are recorded as results, not hidden.
// Methodology and exact commands are written to BENCHMARKS.md together with the numbers. Before every single run the
// input is read once to warm the page cache, and the tool order rotates from round to round, so no tool always runs first.
import { execFile, spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import os, { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const usage = `Usage: node scripts/bench-compare.mjs [options]

  --sizes <mb,mb,...>   Record-file sizes in MB (default: 1,10,100,1000)
  --keyed <mb,mb,...>   Sizes of the same records stored as one object keyed by id, for unflatten only (default: 10,100)
  --deep <levels,...>   Nesting depths of the deeply nested documents (default: 5000,50000)
  --bigint <mb>         Size of the big-integer document in MB, 0 to skip (default: 10)
  --runs <n>            Runs per measurement, best kept. Default: 5 for inputs up to 16 MB (3 if the first run takes over
                        10 s), otherwise 3. The size is that of the JSON input, also for unflatten
  --timeout <seconds>   Kill a run after this long (default: 120)
  --max-rss-gb <gb>     Kill a run whose process tree exceeds this much memory (default: 24)
  --project-skip <x>    Skip a run when the previous size, scaled linearly, would take more than x times the timeout
                        (default: 2, 0 disables the projection and always runs)
  --term <text>         Search term (default: timeout)
  --budget <minutes>    Stop starting new measurements after this long and record the rest as over-budget (default: 55)
  --out-json <file>     Where to write results (default: landing-page/src/app/benchmark-results.json)
  --out-md <file>       Where to write the Markdown report (default: BENCHMARKS.md next to package.json)
  --keep                Keep the generated files and print their location
  --render-only <json>  Do not run anything: rewrite the Markdown report (--out-md) from an existing results file
  -h, --help            Show this help`;

const DEFAULT_TERM = "timeout";
const TIE_THRESHOLD = 0.05;
const here = fileURLToPath(new URL(".", import.meta.url));
const cliRoot = resolve(here, "..");
const cli = join(cliRoot, "dist/index.js");

function parseArgs(argv) {
  const options = {
    sizes: [1, 10, 100, 1000],
    keyed: [10, 100],
    deep: [5000, 50000],
    bigint: 10,
    runs: null,
    timeout: 120,
    maxRssGb: 24,
    projectSkip: 2,
    term: DEFAULT_TERM,
    budget: 55,
    outJson: resolve(cliRoot, "../../../landing-page/src/app/benchmark-results.json"),
    outMd: join(cliRoot, "BENCHMARKS.md"),
    keep: false,
    renderOnly: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    if (flag === "--sizes") options.sizes = value().split(",").filter(Boolean).map(Number);
    else if (flag === "--keyed") options.keyed = value().split(",").filter(Boolean).map(Number);
    else if (flag === "--deep") options.deep = value().split(",").filter(Boolean).map(Number);
    else if (flag === "--bigint") options.bigint = Number(value());
    else if (flag === "--runs") options.runs = Number(value());
    else if (flag === "--timeout") options.timeout = Number(value());
    else if (flag === "--max-rss-gb") options.maxRssGb = Number(value());
    else if (flag === "--project-skip") options.projectSkip = Number(value());
    else if (flag === "--term") options.term = value();
    else if (flag === "--budget") options.budget = Number(value());
    else if (flag === "--out-json") options.outJson = resolve(value());
    else if (flag === "--out-md") options.outMd = resolve(value());
    else if (flag === "--keep") options.keep = true;
    else if (flag === "--render-only") options.renderOnly = resolve(value());
    else if (flag === "-h" || flag === "--help") {
      console.log(usage);
      process.exit(0);
    } else throw new Error(`Unknown option ${flag}\n\n${usage}`);
  }
  const numbers = [...options.sizes, ...options.keyed, ...options.deep, options.bigint, options.timeout, options.maxRssGb, options.projectSkip, options.budget];
  if (options.runs !== null) numbers.push(options.runs);
  for (const number of numbers) {
    if (!Number.isFinite(number) || number < 0) throw new Error("Numeric options must be non-negative numbers");
  }
  if (options.runs !== null && options.runs < 1) throw new Error("--runs must be at least 1");
  return options;
}

// ---------------------------------------------------------------------------------------------------------------
// Input generation (deterministic: the same options always produce the same bytes)
// ---------------------------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVELS = ["debug", "info", "info", "info", "warn", "error"];
const SERVICES = ["auth", "billing", "search", "gateway", "inventory", "notifications"];
const CITIES = [["Nairobi", "KE"], ["Berlin", "DE"], ["Austin", "US"], ["Osaka", "JP"], ["São Paulo", "BR"], ["Lyon", "FR"], ["Toronto", "CA"], ["Pune", "IN"]];
const METHODS = ["GET", "GET", "GET", "POST", "PUT", "DELETE"];
const API_PATHS = ["/v1/users", "/v1/orders", "/v1/search", "/v1/items/42", "/healthz", "/v2/reports"];
const ROLES = ["admin", "editor", "viewer", "billing", "support"];
const TAGS = ["canary", "beta", "eu", "mobile", "web", "internal"];
const MESSAGES = ["request completed", "cache miss, fetching from origin", "user session refreshed", "retrying idempotent request", "payload validated", "rate limit window reset"];
const GIVEN = ["Amina", "Lukas", "Mei", "Carlos", "Priya", "Tomás", "Zoe", "Kofi"];
const FAMILY = ["Okoro", "Schmidt", "Tanaka", "Silva", "Patel", "Dubois", "Nguyen", "Mwangi"];

/** One event-log style record: nested objects, arrays, floats, booleans, nulls, non-ASCII text. About 0.5 KB. */
function eventRecord(i, rnd) {
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const [city, country] = pick(CITIES);
  const given = pick(GIVEN);
  const family = pick(FAMILY);
  const status = rnd() < 0.9 ? 200 : pick([201, 204, 400, 404, 500, 502]);
  const timedOut = rnd() < 0.015; // the default search term appears in about 1.5% of records, in `message` only
  const tags = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(TAGS));
  const roles = Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => pick(ROLES));
  return JSON.stringify({
    id: i,
    uuid: Array.from({ length: 4 }, () => ((rnd() * 4294967296) >>> 0).toString(16).padStart(8, "0")).join(""),
    timestamp: new Date(1_767_225_600_000 + i * 137).toISOString(),
    level: timedOut ? "error" : pick(LEVELS),
    service: pick(SERVICES),
    message: timedOut ? `upstream connection timeout after ${1000 + Math.floor(rnd() * 29000)}ms` : pick(MESSAGES),
    user: {
      name: `${given} ${family}`,
      email: `${given}.${family}${i}@example.com`.toLowerCase(),
      age: 18 + Math.floor(rnd() * 60),
      active: rnd() < 0.8,
      roles,
      address: {
        city,
        country,
        geo: { lat: Math.round((rnd() * 180 - 90) * 1e5) / 1e5, lon: Math.round((rnd() * 360 - 180) * 1e5) / 1e5 },
      },
    },
    request: {
      method: pick(METHODS),
      path: pick(API_PATHS),
      status,
      latency_ms: Math.round(rnd() * 25000) / 100,
      bytes: Math.floor(rnd() * 200000),
      headers: { "user-agent": pick(["curl/8.7", "Mozilla/5.0", "okhttp/4.12"]), "x-request-id": Math.floor(rnd() * 1e9).toString(36) },
    },
    tags,
    error: status >= 500 ? { code: `E${status}`, retryable: rnd() < 0.5, detail: null } : null,
  });
}

/** Account records with integers beyond 2^53 and decimals with trailing zeros, which naive JSON tools mangle. */
function bigintRecord(i, rnd) {
  const cents = Math.floor(rnd() * 100000);
  const price = i === 0 ? "1.10" : `${Math.floor(cents / 100)}.${Math.floor(rnd() * 10)}0`;
  return `{"id":${12345678901234567890n + BigInt(i)},"owner":"acct-${i}","price":${price},"balance":${98765432109876543210n - BigInt(i)}.50,"flags":[true,false,null]}`;
}

/**
 * Writes `[record,record,...]` (or `{"r0":record,...}` when `keyed`) of about `bytes` bytes, honoring backpressure.
 * Returns how many times `term` occurs in the output, which is the exact match count the search workloads must report.
 */
async function generateArray(file, bytes, makeRecord, seed, keyed = false, term = null) {
  const out = createWriteStream(file);
  const rnd = mulberry32(seed);
  let id = 0;
  let written = 1;
  let matches = 0;
  out.write(keyed ? "{" : "[");
  while (written < bytes) {
    let batch = "";
    for (let k = 0; k < 2000; k += 1, id += 1) batch += `${id ? "," : ""}${keyed ? `"r${id}":` : ""}${makeRecord(id, rnd)}`;
    written += Buffer.byteLength(batch);
    if (term) for (let at = batch.indexOf(term); at !== -1; at = batch.indexOf(term, at + term.length)) matches += 1;
    if (!out.write(batch)) await once(out, "drain");
  }
  out.end(keyed ? "}" : "]");
  await once(out, "finish");
  return matches;
}

async function generateDeep(file, levels) {
  const out = createWriteStream(file);
  const step = 10_000;
  for (let done = 0; done < levels; done += step) {
    if (!out.write('{"a":'.repeat(Math.min(step, levels - done)))) await once(out, "drain");
  }
  out.write("1");
  for (let done = 0; done < levels; done += step) {
    if (!out.write("}".repeat(Math.min(step, levels - done)))) await once(out, "drain");
  }
  out.end();
  await once(out, "finish");
}

// ---------------------------------------------------------------------------------------------------------------
// Tools and commands
// ---------------------------------------------------------------------------------------------------------------

// Commands are templates. `gronify` is replaced by `node <dist/index.js>`; $INPUT, $GRON and $TERM by quoted values.
// The templates are what BENCHMARKS.md and the JSON show, so they stay readable.
const JQ_STREAM = "jq --stream -c .";
// `paths(scalars|true)` keeps null and false leaves (plain `paths(scalars)` silently drops them, because paths() keeps
// only truthy results) and is about 1.8x faster than a hand-written path(..)/select filter. It omits empty containers.
const JAQ_PATHS = `jaq -c 'paths(scalars|true) as $p | [$p, getpath($p)]'`;

const TOOL_BINARY = {
  gronify: "node",
  gron: "gron",
  "gron --no-sort": "gron",
  fastgron: "fastgron",
  "fastgron -F": "fastgron",
  jq: "jq",
  jaq: "jaq",
};

const FLATTEN_TOOLS = {
  gronify: "gronify flatten $INPUT",
  gron: "gron $INPUT",
  "gron --no-sort": "gron --no-sort $INPUT",
  fastgron: "fastgron $INPUT",
  jq: `${JQ_STREAM} $INPUT`,
  jaq: `${JAQ_PATHS} $INPUT`,
};

const OPS = [
  { key: "flatten", label: "flatten", input: "json", tools: FLATTEN_TOOLS },
  {
    // The same flatten commands, but the output goes through a pipe into `wc -c` instead of straight to /dev/null.
    key: "flatten-piped",
    label: "flatten, output piped to wc -c",
    input: "json",
    tools: Object.fromEntries(Object.entries(FLATTEN_TOOLS).map(([tool, command]) => [tool, `${command} | wc -c`])),
  },
  {
    key: "search",
    label: "search (count matches)",
    input: "json",
    capture: "count",
    tools: {
      gronify: "gronify search $INPUT $TERM --count --case-sensitive",
      gron: "gron $INPUT | grep -c $TERM",
      "gron --no-sort": "gron --no-sort $INPUT | grep -c $TERM",
      fastgron: "fastgron $INPUT | grep -c $TERM",
      "fastgron -F": "fastgron -F $TERM $INPUT | wc -l",
      jq: `${JQ_STREAM} $INPUT | grep -c $TERM`,
      jaq: `${JAQ_PATHS} $INPUT | grep -c $TERM`,
    },
  },
  {
    key: "unflatten",
    label: "unflatten (gron to JSON)",
    input: "gron",
    tools: {
      gronify: "gronify unflatten $GRON",
      gron: "gron -u $GRON",
      fastgron: "fastgron -u --no-indent --no-newline $GRON",
    },
    unsupported: { jq: "jq reads JSON, not gron statements", jaq: "jaq reads JSON, not gron statements" },
  },
  {
    key: "capped-flatten",
    label: "capped flatten (first 10 lines)",
    input: "json",
    capture: "lines",
    cap: 10,
    pipefail: false,
    tools: {
      gronify: "gronify flatten --limit 10 $INPUT",
      gron: "gron $INPUT | head -n 10",
      "gron --no-sort": "gron --no-sort $INPUT | head -n 10",
      fastgron: "fastgron $INPUT | head -n 10",
      jq: `${JQ_STREAM} $INPUT | head -n 10`,
      jaq: `${JAQ_PATHS} $INPUT | head -n 10`,
    },
  },
  {
    key: "capped-search",
    label: "capped search (first 10 matches)",
    input: "json",
    capture: "lines",
    cap: 10,
    pipefail: false,
    tools: {
      gronify: "gronify search $INPUT $TERM --case-sensitive --max-count 10",
      gron: "gron $INPUT | grep -m 10 $TERM",
      "gron --no-sort": "gron --no-sort $INPUT | grep -m 10 $TERM",
      fastgron: "fastgron $INPUT | grep -m 10 $TERM",
      "fastgron -F": "fastgron -F $TERM $INPUT | head -n 10",
      jq: `${JQ_STREAM} $INPUT | grep -m 10 $TERM`,
      jaq: `${JAQ_PATHS} $INPUT | grep -m 10 $TERM`,
    },
  },
];
const op = (key) => OPS.find((candidate) => candidate.key === key);

const ROUNDTRIP = {
  gronify: "gronify flatten $INPUT | gronify unflatten",
  gron: "gron $INPUT | gron -u",
  fastgron: "fastgron $INPUT | fastgron -u --no-indent --no-newline",
  jq: `${JQ_STREAM} $INPUT | jq -c -n 'fromstream(inputs)'`,
  jaq: { unsupported: "jaq has no inverse of a path/value listing: its setpath does not create missing parents" },
};

const shellQuote = (text) => `'${String(text).replaceAll("'", `'\\''`)}'`;

function expand(template, { input, gron, term }) {
  return template
    .replace(/(^|\| )gronify\b/g, (_, prefix) => `${prefix}${shellQuote(process.execPath)} ${shellQuote(cli)}`)
    .replaceAll("$INPUT", () => shellQuote(input ?? ""))
    .replaceAll("$GRON", () => shellQuote(gron ?? ""))
    .replaceAll("$TERM", () => shellQuote(term));
}

const timeBinary = existsSync("/usr/bin/time") ? "/usr/bin/time" : null;
const timeFlag = process.platform === "darwin" ? "-l" : "-v";

// Prefer Homebrew's jq over Apple's /usr/bin/jq, so that the `brew install` in the reproduce steps matches what ran.
{
  const prefix = spawnSync("brew", ["--prefix"], { encoding: "utf8" });
  const brewBin = prefix.status === 0 ? join(prefix.stdout.trim(), "bin") : null;
  if (brewBin && existsSync(join(brewBin, "jq"))) process.env.PATH = `${brewBin}:${process.env.PATH}`;
}

function binaryPath(name) {
  if (name === "node") return process.execPath;
  const found = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : null;
}

function firstLine(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? (result.stdout || result.stderr).trim().split("\n")[0] : null;
}

function detectTools() {
  const versions = {};
  const binaries = {};
  const missing = {};
  const found = (name, version) => {
    const path = binaryPath(name);
    if (path && version) {
      versions[name] = version;
      binaries[name] = path;
    } else missing[name] = "not installed";
  };
  const gronifyVersion = existsSync(cli) ? firstLine("node", [cli, "--version"]) : null;
  if (gronifyVersion) {
    versions.gronify = gronifyVersion;
    binaries.gronify = "node dist/index.js";
  } else missing.gronify = "dist/index.js not found; run `npm run build` first";
  const brewGron = binaryPath("brew") ? firstLine("brew", ["list", "--versions", "gron"]) : null;
  found("gron", brewGron ? brewGron.replace(/^gron\s+/, "") : firstLine("gron", ["--version"]));
  found("fastgron", firstLine("fastgron", ["--version"])?.replace(/^fastgron( version)?\s*/, ""));
  found("jq", firstLine("jq", ["--version"])?.replace(/^jq-/, ""));
  found("jaq", firstLine("jaq", ["--version"])?.replace(/^jaq\s*/, ""));
  return { versions, binaries, missing };
}

/** Why a tool id cannot run at all, or null. */
function unavailable(tool, missing) {
  const binary = TOOL_BINARY[tool];
  const name = binary === "node" ? "gronify" : binary;
  return missing[name] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------------------------------------------

/** Process groups of the benchmark commands currently running, so a signal can stop them all. */
const activeChildren = new Set();

function killActiveChildren() {
  for (const pid of activeChildren) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

function sampleTreeRss(rootPid) {
  return new Promise((resolvePromise) => {
    execFile("ps", ["-axo", "pid=,ppid=,rss="], { maxBuffer: 1 << 25 }, (error, stdout) => {
      if (error) return resolvePromise(0);
      const children = new Map();
      const rss = new Map();
      for (const line of stdout.split("\n")) {
        const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number);
        if (!Number.isFinite(pid)) continue;
        rss.set(pid, kb * 1024);
        if (!children.has(ppid)) children.set(ppid, []);
        children.get(ppid).push(pid);
      }
      let total = 0;
      const queue = [rootPid];
      while (queue.length) {
        const pid = queue.pop();
        total += rss.get(pid) ?? 0;
        queue.push(...(children.get(pid) ?? []));
      }
      resolvePromise(total);
    });
  });
}

/** Reads a file once so that the next run finds it in the page cache. */
function warmCache(path) {
  spawnSync("/bin/cat", [path], { stdio: ["ignore", "ignore", "ignore"] });
}

const countLines = (text) => (text === "" ? 0 : text.split("\n").length);

/**
 * Runs one command once. Resolves with { kind: "ok" | "failed" | "timeout", reasonCode, seconds, rssBytes, output, note,
 * osKill }. A watchdog samples the process tree twice a second and kills it above `maxRssBytes`, which protects the
 * machine from tools that read the whole document into memory. A SIGKILL that this script did not send (exit 137) is
 * reported as `osKill`: the OS killed the process, almost always because the machine ran out of memory.
 */
function runOnce(command, { timeoutMs, maxRssBytes, capture = null, pipefail = true, cap = 0 }) {
  return new Promise((resolvePromise) => {
    const script = `${pipefail ? "set -o pipefail; " : ""}${command}`;
    const argv = timeBinary ? [timeFlag, "/bin/bash", "-c", script] : ["-c", script];
    const started = process.hrtime.bigint();
    const child = spawn(timeBinary ?? "/bin/bash", argv, {
      stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"],
      detached: true,
      env: { ...process.env, LC_ALL: "C" },
    });
    activeChildren.add(child.pid);
    let stdout = "";
    let stderr = "";
    let reason = null;
    let peakObserved = 0;
    child.stdout?.on("data", (data) => {
      if (stdout.length < 1 << 20) stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 1 << 20) stderr = stderr.slice(-(1 << 16));
    });
    const kill = (why) => {
      if (reason) return;
      reason = why;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // already gone
      }
    };
    const timer = setTimeout(() => kill("timeout"), timeoutMs);
    let sampling = false;
    const watchdog = setInterval(async () => {
      if (sampling) return;
      sampling = true;
      const rss = await sampleTreeRss(child.pid);
      sampling = false;
      peakObserved = Math.max(peakObserved, rss);
      if (rss > maxRssBytes) kill("memory");
    }, 500);
    const finish = (result) => {
      clearTimeout(timer);
      clearInterval(watchdog);
      activeChildren.delete(child.pid);
      resolvePromise(result);
    };
    child.on("error", (error) => finish({ kind: "failed", reasonCode: "start-error", seconds: null, rssBytes: null, output: "", note: `could not start: ${error.message}` }));
    child.on("close", (code, signal) => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const lines = stderr.split("\n");
      const report = lines.findIndex((line) => /^\s*[\d.]+\s+real\b/.test(line) || /Command being timed/.test(line));
      const toolStderr = (report === -1 ? lines : lines.slice(0, report)).join(" ").replace(/\s+/g, " ").trim().slice(0, 160);
      const mac = stderr.match(/(\d+)\s+maximum resident set size/);
      const linux = stderr.match(/Maximum resident set size \(kbytes\): (\d+)/);
      const rssBytes = mac ? Number(mac[1]) : linux ? Number(linux[1]) * 1024 : null;
      // Keep leading/trailing blank lines meaningful for the line count; only drop the final newline.
      const output = capture === "lines" ? stdout.replace(/\n$/, "") : stdout.trim();
      const failure = (reasonCode, note, extra = {}) => finish({ kind: "failed", reasonCode, seconds: null, rssBytes: null, output, note, ...extra });
      if (reason === "timeout") {
        return finish({ kind: "timeout", reasonCode: "timeout", seconds: null, rssBytes: null, output, note: `killed after ${(timeoutMs / 1000).toFixed(0)} s timeout (peak observed ${formatBytes(peakObserved)})` });
      }
      if (reason === "memory") return failure("memory-guard", `killed by the memory guard at ${formatBytes(peakObserved)} (limit ${formatBytes(maxRssBytes)})`);
      if (signal === "SIGKILL" || code === 137) {
        return failure("os-oom-kill", `killed by the OS (SIGKILL, exit 137), most likely out of memory (peak observed ${formatBytes(peakObserved)})`, { osKill: true });
      }
      if (code !== 0) {
        const how = signal ? `signal ${signal}` : `exit ${code}`;
        return failure("exit-nonzero", `${how}${toolStderr ? `: ${toolStderr}` : ""}`, { rssBytes });
      }
      if (capture === "lines" && countLines(output) !== cap) {
        return failure("wrong-output", `produced ${countLines(output)} lines, expected ${cap}${toolStderr ? `: ${toolStderr}` : ""}`, { rssBytes });
      }
      finish({ kind: "ok", reasonCode: null, seconds, rssBytes, output, note: null });
    });
  });
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "n/a";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1048576).toFixed(0)} MB`;
}

const formatSeconds = (seconds) => `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s`;

/** Removes temp paths, process ids and thread ids from tool messages, so notes are stable and readable. */
function scrub(text, { file, gronFile } = {}) {
  let result = text;
  if (gronFile) result = result.replaceAll(gronFile, "$GRON");
  if (file) result = result.replaceAll(file, "$INPUT");
  return result
    .replace(/\/(?:private\/)?var\/folders\/[^\s'"]*/g, "$TMP")
    .replace(/\/tmp\/gronify-compare-[^\s'"]*/g, "$TMP")
    .replace(/\/bin\/bash: line \d+: \d+ /g, "")
    .replace(/\s\d+\s+Done\s*\|.*$/, "")
    .replace(/((?:Abort trap|Segmentation fault|Killed): \d+) .*$/, "$1")
    .replace(/\((\d{4,})\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Correctness checks (small documents, not timed)
// ---------------------------------------------------------------------------------------------------------------

function shell(command, { timeoutMs = 120_000, pipefail = true } = {}) {
  const result = spawnSync("/bin/bash", ["-c", `${pipefail ? "set -o pipefail; " : ""}${command}`], {
    encoding: "utf8",
    maxBuffer: 1 << 29,
    timeout: timeoutMs,
    env: { ...process.env, LC_ALL: "C" },
  });
  return { ok: result.status === 0, stdout: result.stdout ?? "", error: scrub((result.stderr || result.error?.message || `exit ${result.status}`).trim().split("\n")[0].slice(0, 160)) };
}

// A literal string, not JSON.stringify of an object, so that -0, -0.0, exponents and key order reach the tools as written.
const EDGE_DOC = String.raw`{"empty_obj":{},"empty_arr":[],"nested_empty":{"a":[[],{}]},"unicode":"café ☕ 日本語 😀","escapes":"line\nbreak \"q\" \\ \t tab </script> & <b>","weird.key":1,"key with space":2,"key\"quote":3,"0":"numeric key","a[0]":"bracket key","":"empty key","nulls":[null,null],"bools":[true,false],"numbers":[0,-0,-0.0,-1,1.5,1e3,1E+2,1e-7,1.0],"deep":{"a":{"b":{"c":[1,[2,[3]]]}}},"ünïcode_key":"v"}`;
const NUMBER_SPELLINGS = ["-0.0", "1E+2", "1e-7", "1.0"];

const BIGINT_DOC = '{"big":12345678901234567890,"price":1.10,"nested":{"ids":[98765432109876543210,1.10]}}';
const BIGINT_LITERALS = ["12345678901234567890", "98765432109876543210", "1.10"];

function missingLiterals(text) {
  return BIGINT_LITERALS.filter((literal) => !new RegExp(`(?<![\\d.])${literal.replaceAll(".", "\\.")}(?![\\d.])`).test(text));
}

function sameJson(expectedText, actualText) {
  let expected;
  let actual;
  try {
    expected = JSON.parse(expectedText);
    actual = JSON.parse(actualText);
  } catch (error) {
    return { equal: false, note: `output is not valid JSON (${error.message.slice(0, 60)})` };
  }
  if (!isDeepStrictEqual(expected, actual)) return { equal: false, note: "parsed output differs from the input" };
  const ordered = JSON.stringify(expected) === JSON.stringify(actual);
  return { equal: true, note: ordered ? "equal, key order preserved" : "equal, key order changed" };
}

function runChecks({ dir, term, missing }) {
  const checks = [];
  const context = (input, gron) => ({ input, gron, term });
  const forTools = (check, templates, evaluate) => {
    const results = [];
    for (const [tool, template] of Object.entries(templates)) {
      if (typeof template !== "string") {
        results.push({ tool, pass: null, note: `n/a: ${template.unsupported}` });
        continue;
      }
      const reason = unavailable(tool, missing);
      if (reason) {
        results.push({ tool, pass: null, note: `n/a: ${reason}` });
        continue;
      }
      results.push({ tool, ...evaluate(tool, template) });
    }
    checks.push({ check, results });
  };

  const bigintFile = join(dir, "check-bigint.json");
  writeFileSync(bigintFile, BIGINT_DOC);
  const edgeFile = join(dir, "check-edge.json");
  writeFileSync(edgeFile, EDGE_DOC);
  const recordsFile = join(dir, "check-records.json");
  const rnd = mulberry32(7);
  writeFileSync(recordsFile, `[${Array.from({ length: 6000 }, (_, i) => eventRecord(i, rnd)).join(",")}]`);

  const literalNote = (text) => {
    const lost = missingLiterals(text);
    return lost.length ? { pass: false, note: `lost or altered: ${lost.join(", ")}` } : { pass: true, note: "all literals kept verbatim" };
  };

  forTools(`big integers and trailing-zero decimals survive flatten (${BIGINT_LITERALS.join(", ")})`, Object.fromEntries(Object.entries(op("flatten").tools).filter(([tool]) => tool !== "gron --no-sort")), (tool, template) => {
    const run = shell(expand(template, context(bigintFile)));
    return run.ok ? literalNote(run.stdout) : { pass: false, note: run.error };
  });

  forTools("big integers and trailing-zero decimals survive a flatten and unflatten round trip", ROUNDTRIP, (tool, template) => {
    const run = shell(expand(template, context(bigintFile)));
    return run.ok ? literalNote(run.stdout) : { pass: false, note: run.error };
  });

  const roundTrip = (file, spellings = false) => (tool, template) => {
    const run = shell(expand(template, context(file)));
    if (!run.ok) return { pass: false, note: run.error };
    const verdict = sameJson(readFileSync(file, "utf8"), run.stdout);
    if (!verdict.equal || !spellings) return { pass: verdict.equal, note: verdict.note };
    const kept = NUMBER_SPELLINGS.every((spelling) => run.stdout.includes(spelling));
    return { pass: true, note: `${verdict.note}; number spellings ${kept ? "kept verbatim" : "normalised"} (${NUMBER_SPELLINGS.join(", ")})` };
  };
  forTools(`round trip equals the input (${(statSync(recordsFile).size / 1048576).toFixed(1)} MB of generated records)`, ROUNDTRIP, roundTrip(recordsFile));
  forTools("round trip equals the input (edge cases: empty containers, unicode, escapes, dotted/quoted/empty keys, -0, -0.0, exponents)", ROUNDTRIP, roundTrip(edgeFile, true));

  // The unflatten workloads feed every tool gron statements written by fastgron (or gron); make sure all of them read that.
  const gronFile = join(dir, "check-records.gron");
  const producer = !missing.fastgron ? "fastgron --semicolon $INPUT" : !missing.gron ? "gron --no-sort $INPUT" : null;
  if (producer) {
    const written = shell(`${expand(producer, context(recordsFile))} > ${shellQuote(gronFile)}`);
    if (written.ok) {
      forTools(`unflatten of ${producer.split(" ")[0]} output equals the input (the gron statements used by the unflatten workloads)`, op("unflatten").tools, (tool, template) => {
        const run = shell(expand(template, context(recordsFile, gronFile)));
        if (!run.ok) return { pass: false, note: run.error };
        const verdict = sameJson(readFileSync(recordsFile, "utf8"), run.stdout);
        return { pass: verdict.equal, note: verdict.note };
      });
    } else console.error(`  could not write the gron input for the unflatten check: ${written.error}`);
  }

  // Search counts: the reference is `gron | grep -c`, the de-facto way to search gron output.
  const searchTemplates = op("search").tools;
  const reference = !missing.gron ? shell(expand(searchTemplates.gron, context(recordsFile))) : null;
  const expectedCount = reference?.ok ? reference.stdout.trim() : null;
  forTools(`search count matches the \`gron | grep -c ${term}\` reference${expectedCount ? ` (${expectedCount})` : ""}`, searchTemplates, (tool, template) => {
    const run = shell(expand(template, context(recordsFile)));
    if (!run.ok) return { pass: false, note: run.error };
    const count = run.stdout.trim();
    if (expectedCount === null) return { pass: null, note: `count ${count}; no gron reference available` };
    return { pass: count === expectedCount, note: `count ${count}` };
  });

  // Capped output: exactly N lines, identical to the first N lines of the same tool's uncapped output.
  const uncapped = (template) => template.replace(" --max-count 10", "").replace(" --limit 10", "").replace("grep -m 10", "grep").replace(/ \| head -n 10$/, "");
  for (const [title, capped] of [
    ["capped flatten returns exactly 10 lines that match the start of the full output", op("capped-flatten")],
    ["capped search returns exactly 10 lines that match the start of the full result", op("capped-search")],
  ]) {
    forTools(title, capped.tools, (tool, template) => {
      const run = shell(expand(template, context(recordsFile)), { pipefail: false });
      if (!run.ok) return { pass: false, note: run.error };
      const lines = run.stdout.replace(/\n$/, "").split("\n");
      if (countLines(run.stdout.replace(/\n$/, "")) !== 10) return { pass: false, note: `returned ${countLines(run.stdout.replace(/\n$/, ""))} lines` };
      const head = shell(`${expand(uncapped(template), context(recordsFile))} | head -n 10`, { pipefail: false });
      const same = head.stdout.replace(/\n$/, "") === lines.join("\n");
      if (same) return { pass: true, note: "10 lines, same as the head of the uncapped output" };
      // gron --no-sort iterates a Go map, so its order differs from run to run: nothing to compare, not a failure.
      if (tool === "gron --no-sort") return { pass: null, note: "n/a (output order not stable)" };
      return { pass: false, note: "10 lines, but different from the head of the uncapped output" };
    });
  }
  return checks;
}

// ---------------------------------------------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------------------------------------------

/** Runs per measurement, decided by the size of the JSON input (also for unflatten, whose input is the gron form). */
function runsFor(jsonBytes, options) {
  if (options.runs !== null) return options.runs;
  return jsonBytes <= 16 * 1048576 ? 5 : 3;
}

/** Remembers per family/op/tool what happened at the previous (smaller) size, to skip tools that already gave up. */
const history = new Map();
/** Tools that parse the whole document before printing anything: if one dies on an input, its other operations will too. */
const WHOLE_DOCUMENT = new Set(["gron", "gron --no-sort", "jaq"]);
const wholeDocumentFailures = new Map();
const startedAt = Date.now();

const rotate = (list, by) => (list.length ? list.map((_, i) => list[(i + by) % list.length]) : list);

/** Marks the fastest successful result, or all results within the tie threshold of it as a tie. */
function markFastest(results) {
  const ok = results.filter((r) => r.status === "ok");
  for (const r of results) {
    delete r.isFastest;
    delete r.isTie;
  }
  if (!ok.length) return;
  const best = Math.min(...ok.map((r) => r.seconds));
  const close = ok.filter((r) => r.seconds <= best * (1 + TIE_THRESHOLD));
  for (const r of ok) {
    r.isTie = close.length > 1 && close.includes(r);
    r.isFastest = close.length === 1 && close[0] === r;
  }
}

async function runWorkload({ family, inputId, inputLabel, operation, file, gronFile, options, missing, expectedMatches }) {
  const inputPath = operation.input === "gron" ? gronFile : file;
  const bytes = statSync(inputPath).size;
  const jsonBytes = statSync(file).size;
  const runs = runsFor(jsonBytes, options);
  const toolIds = [...Object.keys(operation.tools), ...Object.keys(operation.unsupported ?? {})];
  const scrubbing = { file, gronFile };
  const entries = new Map();
  const plan = [];
  const elapsedMinutes = (Date.now() - startedAt) / 60_000;

  for (const tool of toolIds) {
    const template = operation.tools[tool];
    const entry = { tool, command: template ?? "", seconds: null, peakRssBytes: null, status: "skipped" };
    const keyed = `${family}|${operation.key}|${tool}`;
    const previous = history.get(keyed);
    const projected = previous ? previous.seconds * (bytes / previous.bytes) : 0;
    const skip = (reasonCode, note) => {
      entry.reasonCode = reasonCode;
      entry.note = note;
    };
    if (template === undefined) skip("unsupported", operation.unsupported[tool]);
    else if (unavailable(tool, missing)) skip("not-installed", unavailable(tool, missing));
    else if (elapsedMinutes > options.budget) skip("over-budget", `not run: the ${options.budget} min total time budget was used up`);
    else if (!["unflatten"].includes(operation.key) && wholeDocumentFailures.has(`${inputId}|${tool}`)) {
      const earlier = wholeDocumentFailures.get(`${inputId}|${tool}`);
      skip("after-failure", `not run: ${tool} already ${earlier.status === "timeout" ? "timed out" : "failed"} on this input in ${earlier.op} (it parses the whole document first)`);
    } else if (previous && previous.status !== "ok") skip("after-failure", `not run: ${previous.status} on the smaller ${previous.inputLabel} input`);
    else if (previous && options.projectSkip > 0 && projected > options.projectSkip * options.timeout) {
      skip("over-budget", `not run: ${formatSeconds(previous.seconds)} on ${previous.inputLabel} projects to ~${formatSeconds(projected)} here, over ${options.projectSkip}x the ${options.timeout} s timeout`);
    } else plan.push(tool);
    entries.set(tool, entry);
  }

  console.error(`\n== ${operation.key} / ${inputId} (${(bytes / 1048576).toFixed(0)} MB fed to the tool, ${(jsonBytes / 1048576).toFixed(0)} MB JSON, best of ${runs})`);
  const samples = new Map(plan.map((tool) => [tool, []]));
  const failures = new Map();
  const retried = new Set();
  const runOptions = {
    timeoutMs: options.timeout * 1000,
    maxRssBytes: options.maxRssGb * 1024 ** 3,
    capture: operation.capture ?? null,
    pipefail: operation.pipefail ?? true,
    cap: operation.cap ?? 0,
  };
  const wanted = (tool) => {
    const first = samples.get(tool)[0];
    // Slow tools do not need five runs: three are enough to take the best of.
    return first && first.seconds > 10 ? Math.min(runs, 3) : runs;
  };
  for (let round = 0; round < runs; round += 1) {
    const active = plan.filter((tool) => !failures.has(tool) && samples.get(tool).length < wanted(tool));
    for (const tool of rotate(active, round)) {
      const command = expand(operation.tools[tool], { input: file, gron: gronFile, term: options.term });
      warmCache(inputPath);
      let outcome = await runOnce(command, runOptions);
      if (outcome.osKill) {
        // One OS kill may be a one-off (other processes were using the memory); try once more before calling it a failure.
        console.error(`   ${tool}: killed by the OS, retrying once`);
        warmCache(inputPath);
        const retry = await runOnce(command, runOptions);
        if (retry.kind === "ok") retried.add(tool);
        outcome = retry;
      }
      if (outcome.kind === "ok") samples.get(tool).push(outcome);
      else failures.set(tool, outcome);
    }
  }

  for (const tool of plan) {
    const entry = entries.get(tool);
    const failure = failures.get(tool);
    if (failure) {
      entry.status = failure.kind;
      entry.reasonCode = failure.reasonCode;
      entry.note = scrub(failure.note, scrubbing);
      if (!["unflatten"].includes(operation.key) && WHOLE_DOCUMENT.has(tool)) wholeDocumentFailures.set(`${inputId}|${tool}`, { status: failure.kind, op: operation.key });
      continue;
    }
    const taken = samples.get(tool);
    const best = taken.reduce((a, b) => (b.seconds < a.seconds ? b : a));
    entry.status = "ok";
    entry.seconds = Number(best.seconds.toFixed(4));
    entry.peakRssBytes = best.rssBytes;
    entry.samples = taken.map((s) => Number(s.seconds.toFixed(4)));
    if (operation.capture === "count") entry.matchCount = Number(best.output);
    if (retried.has(tool)) entry.note = "an earlier attempt was killed by the OS (likely out of memory); this run is the retry";
  }

  // Search: a tool that reports the wrong number of matches did not do the job, whatever its speed.
  if (operation.capture === "count") {
    const counts = [...entries.values()].filter((r) => r.status === "ok").map((r) => r.matchCount);
    const mode = [...new Set(counts)].sort((a, b) => counts.filter((c) => c === b).length - counts.filter((c) => c === a).length)[0];
    const expected = expectedMatches ?? mode;
    for (const r of entries.values()) {
      if (r.status === "ok" && r.matchCount !== expected) {
        r.note = `reported ${r.matchCount} matches, expected ${expected} (${formatSeconds(r.seconds)} measured)`;
        r.status = "failed";
        r.reasonCode = "wrong-output";
        r.seconds = null;
        r.peakRssBytes = null;
        delete r.samples;
      }
    }
  }

  for (const tool of plan) {
    const entry = entries.get(tool);
    if (entry.status !== "skipped") history.set(`${family}|${operation.key}|${tool}`, { status: entry.status, seconds: entry.seconds, bytes, inputLabel });
  }
  const results = toolIds.map((tool) => entries.get(tool));
  markFastest(results);
  for (const r of results) {
    const mark = r.isFastest ? "fastest" : r.isTie ? "tie" : "";
    console.error(`   ${r.tool.padEnd(15)} ${r.status.padEnd(8)} ${r.seconds === null ? "" : formatSeconds(r.seconds)} ${r.peakRssBytes ? formatBytes(r.peakRssBytes) : ""} ${mark} ${r.note ?? ""}`);
  }
  return { id: `${operation.key}-${inputId}`, operation: operation.key, label: `${operation.label}: ${inputLabel}`, inputBytes: bytes, jsonBytes, runs, results };
}

// ---------------------------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------------------------

function machineInfo() {
  const sysctl = (key) => (process.platform === "darwin" ? firstLine("sysctl", ["-n", key]) : null);
  const mac = process.platform === "darwin" ? firstLine("sw_vers", ["-productVersion"]) : null;
  return {
    cpu: sysctl("machdep.cpu.brand_string") ?? os.cpus()[0]?.model ?? "unknown",
    memGB: Math.round(os.totalmem() / 1024 ** 3),
    os: mac ? `macOS ${mac} (${os.type()} ${os.release()}, ${os.arch()})` : `${os.type()} ${os.release()} (${os.arch()})`,
    node: process.version,
  };
}

const SKIPPED_TEXT = {
  "not-installed": "not installed",
  unsupported: "unsupported",
  "over-budget": "not run (over budget)",
  "after-failure": "not run (earlier failure)",
  "no-input": "no input",
};

function cell(result) {
  if (!result) return "n/a";
  if (result.status === "ok") return `${formatSeconds(result.seconds)} / ${formatBytes(result.peakRssBytes)}`;
  if (result.status === "timeout") return "timeout";
  if (result.status === "failed") {
    const why = { "os-oom-kill": " (OS out-of-memory kill)", "memory-guard": " (memory guard)", "wrong-output": " (wrong output)" }[result.reasonCode] ?? "";
    return `failed${why}`;
  }
  return SKIPPED_TEXT[result.reasonCode] ?? "skipped";
}

function renderMarkdown(report, fullCommands) {
  const { options } = report;
  const lines = [];
  const push = (text = "") => lines.push(text);
  push("# Gronify benchmarks");
  push();
  push("This file is generated by `scripts/bench-compare.mjs` (`npm run bench:compare`). The numbers below are measured, not edited; re-run the script to refresh them. The same data is written to `landing-page/src/app/benchmark-results.json`.");
  push();
  push("## Environment");
  push();
  push(`- Generated: ${report.generatedAt}`);
  push(`- CPU: ${report.machine.cpu}, ${report.machine.memGB} GB RAM`);
  push(`- OS: ${report.machine.os}`);
  push(`- Node: ${report.machine.node} (runs \`node dist/index.js\`)`);
  push("- Tools:");
  for (const [name, version] of Object.entries(report.tools)) push(`  - ${name} ${version}${report.binaries?.[name] && name !== "gronify" ? ` (${report.binaries[name]})` : ""}`);
  for (const [name, why] of Object.entries(report.toolsMissing ?? {})) push(`  - ${name}: ${why}`);
  push(`- Options: timeout ${options.timeoutSeconds} s, memory guard ${options.maxRssGB} GB, search term \`${options.term}\`, time budget ${options.budgetMinutes} min, total run time ${options.elapsedMinutes} min`);
  push();
  push("## Methodology");
  push();
  push("- **Inputs** are generated deterministically (seeded PRNG) into a temp directory and deleted afterwards:");
  push("  - `records`: a top-level JSON array of event-log style records (about 0.5 KB each: nested objects, arrays, floats, booleans, nulls, non-ASCII text). The search term appears in the `message` of about 1.5% of the records.");
  push("  - `keyed`: the same records stored as one object (`{\"r0\":{...},\"r1\":{...}}`) instead of an array, used for unflatten only. It is included because some gron implementations rebuild large arrays much more expensively than large objects, so the array-shaped `records` input alone could mislead.");
  push("  - `deep`: `{\"a\":{\"a\":{...1}}}` nested N levels. Flattening it emits N lines whose paths grow with the depth, so the output is quadratic in N.");
  push("  - `bigint`: records with integers beyond 2^53 (12345678901234567890 and up) and decimals with trailing zeros (1.10).");
  push("- **Timing**: wall time of `bash -c '<command>'` under `/usr/bin/time -l`, which includes process start-up (for gronify, Node start-up). Output goes to `/dev/null`. The search workloads print one number and the capped workloads ten lines; those few bytes are captured to validate the run.");
  push("- **Runs**: the reported time is the best of N runs, where N depends on the size of the JSON input (also for unflatten, whose actual input is the larger gron form): 5 runs up to 16 MB (3 if the first run takes over 10 s), 3 runs above, at every size including 1 GB. All run times are in the JSON (`samples`). A run that fails ends that tool's measurement for the workload.");
  push("- **Fairness of order and cache**: the input is read once to warm the page cache immediately before every single run, and the tool order rotates from round to round, so no tool always runs first or benefits from another tool's warm-up.");
  push(`- **Ties**: results within ${TIE_THRESHOLD * 100}% of the fastest time in a column are a tie. They are not bold and carry \`isTie\` in the JSON; only a result that is more than ${TIE_THRESHOLD * 100}% ahead of every other is bold (\`isFastest\`).`);
  push("- **Peak RSS** is the maximum resident set size reported by `/usr/bin/time -l`, which for a pipeline is the largest single process in it (not the sum), taken from the same run as the reported time.");
  push(`- **Limits**: each run is killed after ${options.timeoutSeconds} s (status \`timeout\`) or when its process tree exceeds ${options.maxRssGB} GB (status \`failed\`, to protect the machine from tools that load the whole document). A SIGKILL that the script did not send is reported as an OS out-of-memory kill; it is retried once, and skips are not cascaded from a single OS kill. Otherwise a tool that fails or times out at one size is not run at larger sizes. A tool whose previous size, scaled linearly, would take more than ${options.projectSkip}x the timeout is also not run (\`over-budget\`, with the projection in the note), and so is everything once the ${options.budgetMinutes} min total budget is used up; these are time-budget shortcuts, not measurements.`);
  push("- **Fair equivalents**: each tool is run the way its documentation suggests for the job, in its default mode unless stated. Notes on the choices:");
  push("  - gron sorts its output by default and reads the whole document before printing; `gron --no-sort` is listed separately. gronify and fastgron keep document order, so `gron --no-sort` is the closest like-for-like (it does not guarantee document order).");
  push("  - gronify search is case-insensitive by default; `--case-sensitive` is used so that it matches `grep`. Search matches whole gron lines (path and value) for all gron-style tools. A search result whose count differs from the exact number of occurrences counted while generating the input is marked failed.");
  push("  - `fastgron -F` is fastgron's native fixed-string filter; it is listed next to `fastgron | grep` for search.");
  push("  - jq and jaq do not produce gron. For jq the closest honest equivalent is `jq --stream -c .`, which emits one `[path, leaf]` event per leaf (plus closing events) with constant memory. jaq has no `--stream`, so it runs `paths(scalars|true) as $p | [$p, getpath($p)]` on the fully parsed document. That is the fastest idiom that still reports every leaf: plain `paths(scalars)` is faster still but silently drops null and false values, and a hand-written `path(..)` filter is about 1.8x slower. It omits empty containers. Their output is not byte-compatible with gron, and they cannot read gron statements, so they are not run for unflatten.");
  push("  - Capped workloads compare early exit: gronify `--limit`/`--max-count` stop reading the input; the others run through `head -n 10` or `grep -m 10`, which stops the pipeline only if the producer notices the closed pipe. Tools that must read and parse the whole document first (gron, jaq) cannot exit early. The matches are near the start of the file, which is the favorable case for early exit.");
  push("  - The unflatten input is `fastgron --semicolon` output (gron-format statements in document order) for every tool, since gron needs the trailing semicolons. gronify and `fastgron -u --no-indent --no-newline` write compact JSON. gron has no compact mode and writes indented JSON, so it writes more bytes to `/dev/null` than the others.");
  push("  - **Output sink**: the main flatten workloads write to `/dev/null`, which costs nothing. Some tools behave very differently when the output is consumed through a pipe (a deeply nested document can be several times slower into a pipe than into /dev/null), so `flatten, output piped to wc -c` repeats flatten with `| wc -c` for the deep documents and the records up to 100 MB. Read the two tables together; neither alone describes what a user piping into grep or a file will see.");
  push("- **Correctness checks** are run on small documents before timing and are listed at the end of this file. They are not timed.");
  push();
  push("## Results");
  push();
  push(`Each cell is \`wall time / peak RSS\`; the fastest time in a column is **bold** unless another result is within ${TIE_THRESHOLD * 100}% of it (a tie). Lower is better. Results that were not measured say why: not installed, unsupported, over budget, or after an earlier failure.`);
  const byOp = new Map();
  for (const workload of report.workloads) {
    if (!byOp.has(workload.operation)) byOp.set(workload.operation, []);
    byOp.get(workload.operation).push(workload);
  }
  const noteLines = [];
  for (const [, workloads] of byOp) {
    push();
    push(`### ${workloads[0].label.split(": ")[0]}`);
    push();
    push(`| Tool | ${workloads.map((w) => w.label.split(": ")[1]).join(" | ")} |`);
    push(`| --- | ${workloads.map(() => "---").join(" | ")} |`);
    const tools = [...new Set(workloads.flatMap((w) => w.results.map((r) => r.tool)))];
    for (const tool of tools) {
      const cells = workloads.map((w) => {
        const result = w.results.find((r) => r.tool === tool);
        return result?.isFastest ? `**${cell(result)}**` : cell(result);
      });
      push(`| ${tool} | ${cells.join(" | ")} |`);
    }
    push();
    push(`Runs per measurement: ${workloads.map((w) => `${w.label.split(": ")[1]} ${w.runs}`).join(", ")}.`);
    for (const w of workloads) {
      for (const r of w.results) if (r.note && r.reasonCode !== "unsupported") noteLines.push(`- ${w.label} / ${r.tool}: ${r.status === "ok" ? "" : `${r.status}. `}${r.note}`);
    }
  }
  push();
  push("### Notes on individual results");
  push();
  const searchRuns = report.workloads.filter((w) => w.operation === "search").flatMap((w) => w.results.filter((r) => r.status === "ok" || r.reasonCode === "wrong-output"));
  push(searchRuns.some((r) => r.reasonCode === "wrong-output") ? "- Some search results reported the wrong number of matches; see the entries below." : "- Every search result that completed reported the exact number of matches.");
  push("- jq and jaq read JSON, not gron statements, so they are not run for unflatten.");
  for (const line of noteLines) push(line);
  push();
  push("## Correctness checks");
  push();
  push("`n/a` means the check does not apply to that tool (or is not meaningful), with the reason in the note.");
  for (const check of report.correctness) {
    push();
    push(`**${check.check}**`);
    push();
    push("| Tool | Result | Note |");
    push("| --- | --- | --- |");
    for (const r of check.results) push(`| ${r.tool} | ${r.pass === null ? "n/a" : r.pass ? "pass" : "FAIL"} | ${r.note.replaceAll("|", "\\|")} |`);
  }
  push();
  push("## Exact commands");
  push();
  push("`$INPUT` is the generated JSON file, `$GRON` the generated gron file, `$TERM` the search term. `gronify` stands for `node dist/index.js`. Every command's output goes to `/dev/null`.");
  push();
  push("| Operation | Tool | Command |");
  push("| --- | --- | --- |");
  for (const [operation, command] of fullCommands) push(`| ${operation[0]} | ${operation[1]} | \`${command.replaceAll("|", "\\|")}\` |`);
  push();
  push("## Reproduce");
  push();
  push("```bash");
  push("brew install gron fastgron jq jaq   # Homebrew's jq is used in preference to /usr/bin/jq; a missing tool is recorded as not installed");
  push("cd src/packages/cli");
  push("npm ci && npm run build");
  push("npm run bench:compare               # about 40 minutes with the default sizes; needs a few GB of free temp space and RAM");
  push("npm run bench:compare -- --sizes 10 --keyed 10 --deep 2000 --out-json /tmp/r.json --out-md /tmp/r.md   # quick run");
  push("npm run bench:compare -- --render-only landing-page/src/app/benchmark-results.json                      # re-render the Markdown from saved results");
  push("```");
  push();
  push("Results depend on the machine, the tool versions and the generated data; compare tools within one run of this table rather than across machines.");
  push();
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------

const options = parseArgs(process.argv.slice(2));
const commandRows = [];
for (const operation of OPS) for (const [tool, template] of Object.entries(operation.tools)) commandRows.push([[operation.label, tool], template]);
for (const [tool, template] of Object.entries(ROUNDTRIP)) if (typeof template === "string") commandRows.push([["round-trip check", tool], template]);

if (options.renderOnly) {
  const saved = JSON.parse(readFileSync(options.renderOnly, "utf8"));
  if (!saved.options) throw new Error(`${options.renderOnly} has no recorded options; it was written by an older version of this script`);
  writeFileSync(options.outMd, renderMarkdown(saved, commandRows));
  console.error(`Wrote ${options.outMd}`);
  process.exit(0);
}

const { versions, binaries, missing } = detectTools();
if (missing.gronify) throw new Error(missing.gronify);

const dir = mkdtempSync(join(tmpdir(), "gronify-compare-"));
const cleanup = () => {
  if (options.keep) console.error(`Kept benchmark files in ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
};
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.on(signal, () => {
    console.error(`\n${signal}: stopping running commands`);
    killActiveChildren();
    cleanup();
    process.exit(code);
  });
}

try {
  console.error("Running correctness checks...");
  const correctness = runChecks({ dir, term: options.term, missing });
  for (const check of correctness) {
    console.error(`  ${check.check}`);
    for (const r of check.results) console.error(`    ${r.tool.padEnd(14)} ${r.pass === null ? "n/a " : r.pass ? "pass" : "FAIL"} ${r.note}`);
  }

  const writeGron = (jsonFile, gronFile) => {
    const producer = !missing.fastgron ? "fastgron --semicolon $INPUT" : !missing.gron ? "gron --no-sort $INPUT" : null;
    if (!producer) {
      console.error("  no gron input: neither fastgron nor gron is installed");
      return false;
    }
    const written = shell(`${expand(producer, { input: jsonFile, term: options.term })} > ${shellQuote(gronFile)}`, { timeoutMs: 30 * 60_000 });
    if (!written.ok) console.error(`  could not write the gron input with ${producer.split(" ")[0]}: ${written.error}`);
    return written.ok;
  };

  const workloads = [];
  const run = async (family, inputId, inputLabel, file, ops, gronFile, expectedMatches = undefined) => {
    for (const operation of ops) {
      if (operation.input === "gron" && !gronFile) {
        const results = Object.keys({ ...operation.tools, ...operation.unsupported }).map((tool) => ({
          tool,
          command: operation.tools[tool] ?? "",
          seconds: null,
          peakRssBytes: null,
          status: "skipped",
          reasonCode: operation.tools[tool] ? "no-input" : "unsupported",
          note: operation.tools[tool] ? "no gron input could be generated" : operation.unsupported[tool],
        }));
        workloads.push({ id: `${operation.key}-${inputId}`, operation: operation.key, label: `${operation.label}: ${inputLabel}`, inputBytes: 0, jsonBytes: statSync(file).size, runs: 0, results });
        continue;
      }
      workloads.push(await runWorkload({ family, inputId, inputLabel, operation, file, gronFile, options, missing, expectedMatches }));
    }
  };
  const byKey = (...keys) => keys.map(op);
  const humanSize = (mb) => (mb >= 1000 && mb % 1000 === 0 ? `${mb / 1000} GB` : `${mb} MB`);
  // The piped-sink variant is repeated only where it stays cheap: the deep documents and records up to 100 MB.
  const PIPED_MAX_MB = 100;

  for (const mb of options.sizes) {
    const file = join(dir, `records-${mb}mb.json`);
    const gronFile = join(dir, `records-${mb}mb.gron`);
    console.error(`\nGenerating records ${humanSize(mb)}...`);
    const matches = await generateArray(file, mb * 1048576, eventRecord, 42, false, options.term);
    const haveGron = writeGron(file, gronFile);
    // Only the default term occurs in nothing but `message`, so only then does the occurrence count equal the line count.
    const ops = OPS.filter((operation) => operation.key !== "flatten-piped" || mb <= PIPED_MAX_MB);
    await run("records", `records-${mb}mb`, `records ${humanSize(mb)}`, file, ops, haveGron ? gronFile : null, options.term === DEFAULT_TERM ? matches : undefined);
    rmSync(file, { force: true });
    rmSync(gronFile, { force: true });
  }

  for (const mb of options.keyed) {
    const file = join(dir, `keyed-${mb}mb.json`);
    const gronFile = join(dir, `keyed-${mb}mb.gron`);
    console.error(`\nGenerating keyed records ${humanSize(mb)}...`);
    await generateArray(file, mb * 1048576, eventRecord, 43, true);
    const haveGron = writeGron(file, gronFile);
    await run("keyed", `keyed-${mb}mb`, `keyed object ${humanSize(mb)}`, file, byKey("unflatten"), haveGron ? gronFile : null);
    rmSync(file, { force: true });
    rmSync(gronFile, { force: true });
  }

  for (const levels of options.deep) {
    const file = join(dir, `deep-${levels}.json`);
    const gronFile = join(dir, `deep-${levels}.gron`);
    console.error(`\nGenerating deep document, ${levels} levels...`);
    await generateDeep(file, levels);
    // The gron form is quadratic in the depth; only build it where it stays small.
    const haveGron = levels <= 10_000 && writeGron(file, gronFile);
    await run("deep", `deep-${levels}`, `${levels} levels deep`, file, byKey("flatten", "flatten-piped", ...(levels <= 10_000 ? ["unflatten"] : [])), haveGron ? gronFile : null);
    rmSync(file, { force: true });
    rmSync(gronFile, { force: true });
  }

  if (options.bigint > 0) {
    const file = join(dir, "bigint.json");
    const gronFile = join(dir, "bigint.gron");
    console.error(`\nGenerating big-integer document, ${options.bigint} MB...`);
    await generateArray(file, options.bigint * 1048576, bigintRecord, 99);
    const haveGron = writeGron(file, gronFile);
    await run("bigint", `bigint-${options.bigint}mb`, `big integers ${options.bigint} MB`, file, byKey("flatten", "unflatten"), haveGron ? gronFile : null);
    rmSync(file, { force: true });
    rmSync(gronFile, { force: true });
  }

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    machine: machineInfo(),
    tools: versions,
    binaries,
    toolsMissing: missing,
    options: {
      timeoutSeconds: options.timeout,
      maxRssGB: options.maxRssGb,
      term: options.term,
      budgetMinutes: options.budget,
      projectSkip: options.projectSkip,
      runsOverride: options.runs,
      tieThreshold: TIE_THRESHOLD,
      sizesMB: options.sizes,
      keyedMB: options.keyed,
      deepLevels: options.deep,
      bigintMB: options.bigint,
      elapsedMinutes: Number(((Date.now() - startedAt) / 60_000).toFixed(1)),
    },
    workloads,
    correctness,
  };

  mkdirSync(dirname(options.outJson), { recursive: true });
  writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(options.outMd, renderMarkdown(report, commandRows));
  console.error(`\nWrote ${options.outJson}\nWrote ${options.outMd}`);

  // Like bench-unflatten.mjs: a failing gronify check or workload is a failing run.
  const gronifyBroke =
    correctness.some((check) => check.results.some((r) => r.tool === "gronify" && r.pass === false)) ||
    workloads.some((w) => w.results.some((r) => r.tool === "gronify" && (r.status === "failed" || r.status === "timeout")));
  if (gronifyBroke) {
    console.error("gronify failed a check or a workload; see the results above");
    process.exitCode = 1;
  }
} finally {
  cleanup();
}
