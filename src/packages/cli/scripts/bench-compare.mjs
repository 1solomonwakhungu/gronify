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
// Methodology and exact commands are written to BENCHMARKS.md together with the numbers.
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
  --runs <n>            Runs per measurement, best kept. Default: 5 up to 16 MB, 3 up to 200 MB, 1 above
  --timeout <seconds>   Kill a run after this long (default: 120)
  --max-rss-gb <gb>     Kill a run whose process tree exceeds this much memory (default: 28)
  --project-skip <x>    Skip a run when the previous size, scaled linearly, would take more than x times the timeout
                        (default: 2, 0 disables the projection and always runs)
  --term <text>         Search term (default: timeout)
  --out-json <file>     Where to write results (default: landing-page/src/app/benchmark-results.json)
  --out-md <file>       Where to write the Markdown report (default: BENCHMARKS.md next to package.json)
  --keep                Keep the generated files and print their location
  --render-only <json>  Do not run anything: rewrite the Markdown report (--out-md) from an existing results file
  -h, --help            Show this help`;

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
    maxRssGb: 28,
    projectSkip: 2,
    term: "timeout",
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
    else if (flag === "--out-json") options.outJson = resolve(value());
    else if (flag === "--out-md") options.outMd = resolve(value());
    else if (flag === "--keep") options.keep = true;
    else if (flag === "--render-only") options.renderOnly = resolve(value());
    else if (flag === "-h" || flag === "--help") {
      console.log(usage);
      process.exit(0);
    } else throw new Error(`Unknown option ${flag}\n\n${usage}`);
  }
  const numbers = [...options.sizes, ...options.keyed, ...options.deep, options.bigint, options.timeout, options.maxRssGb, options.projectSkip];
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

/** Writes `[record,record,...]` (or `{"r0":record,...}` when `keyed`) of about `bytes` bytes, honoring backpressure. */
async function generateArray(file, bytes, makeRecord, seed, keyed = false) {
  const out = createWriteStream(file);
  const rnd = mulberry32(seed);
  let id = 0;
  let written = 1;
  out.write(keyed ? "{" : "[");
  while (written < bytes) {
    let batch = "";
    for (let k = 0; k < 2000; k += 1, id += 1) batch += `${id ? "," : ""}${keyed ? `"r${id}":` : ""}${makeRecord(id, rnd)}`;
    written += batch.length;
    if (!out.write(batch)) await once(out, "drain");
  }
  out.end(keyed ? "}" : "]");
  await once(out, "finish");
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
const JAQ_PATHS = `jaq -c 'path(..) as $p | getpath($p) | select(((type=="object" or type=="array") and length>0)|not) | [$p, .]'`;

const TOOL_BINARY = {
  gronify: "node",
  gron: "gron",
  "gron --no-sort": "gron",
  fastgron: "fastgron",
  "fastgron -F": "fastgron",
  jq: "jq",
  jaq: "jaq",
};

const OPS = [
  {
    key: "flatten",
    label: "flatten",
    input: "json",
    tools: {
      gronify: "gronify flatten $INPUT",
      gron: "gron $INPUT",
      "gron --no-sort": "gron --no-sort $INPUT",
      fastgron: "fastgron $INPUT",
      jq: `${JQ_STREAM} $INPUT`,
      jaq: `${JAQ_PATHS} $INPUT`,
    },
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
      fastgron: "fastgron -u $GRON",
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

const ROUNDTRIP = {
  gronify: "gronify flatten $INPUT | gronify unflatten",
  gron: "gron $INPUT | gron -u",
  fastgron: "fastgron $INPUT | fastgron -u",
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
  const missing = {};
  const note = (name, version) => {
    if (version) versions[name] = version;
    else missing[name] = "not installed";
  };
  const gronifyVersion = existsSync(cli) ? firstLine("node", [cli, "--version"]) : null;
  if (gronifyVersion) versions.gronify = gronifyVersion;
  else missing.gronify = "dist/index.js not found; run `npm run build` first";
  if (binaryPath("gron")) {
    const brew = binaryPath("brew") ? firstLine("brew", ["list", "--versions", "gron"]) : null;
    note("gron", brew ? brew.replace(/^gron\s+/, "") : firstLine("gron", ["--version"]));
  } else note("gron", null);
  note("fastgron", binaryPath("fastgron") ? firstLine("fastgron", ["--version"])?.replace(/^fastgron( version)?\s*/, "") : null);
  note("jq", binaryPath("jq") ? firstLine("jq", ["--version"])?.replace(/^jq-/, "") : null);
  note("jaq", binaryPath("jaq") ? firstLine("jaq", ["--version"])?.replace(/^jaq\s*/, "") : null);
  return { versions, missing };
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

/**
 * Runs one command once. Resolves with { kind: "ok" | "failed" | "timeout", seconds, rssBytes, output, note }.
 * A watchdog samples the process tree once a second and kills it above `maxRssBytes`, which protects the machine
 * from tools that read the whole document into memory.
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
    }, 1000);
    child.on("error", (error) => {
      clearTimeout(timer);
      clearInterval(watchdog);
      resolvePromise({ kind: "failed", seconds: null, rssBytes: null, output: "", note: `could not start: ${error.message}` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearInterval(watchdog);
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const lines = stderr.split("\n");
      const report = lines.findIndex((line) => /^\s*[\d.]+\s+real\b/.test(line) || /Command being timed/.test(line));
      const toolStderr = (report === -1 ? lines : lines.slice(0, report)).join(" ").replace(/\s+/g, " ").trim().slice(0, 160);
      const mac = stderr.match(/(\d+)\s+maximum resident set size/);
      const linux = stderr.match(/Maximum resident set size \(kbytes\): (\d+)/);
      const rssBytes = mac ? Number(mac[1]) : linux ? Number(linux[1]) * 1024 : null;
      const output = stdout.trim();
      if (reason === "timeout") {
        return resolvePromise({ kind: "timeout", seconds: null, rssBytes: null, output, note: `killed after ${(timeoutMs / 1000).toFixed(0)} s timeout (peak observed ${formatBytes(peakObserved)})` });
      }
      if (reason === "memory") {
        return resolvePromise({ kind: "failed", seconds: null, rssBytes: null, output, note: `killed by the memory guard at ${formatBytes(peakObserved)} (limit ${formatBytes(maxRssBytes)})` });
      }
      if (code !== 0) {
        const how = signal ? `signal ${signal}` : `exit ${code}`;
        return resolvePromise({ kind: "failed", seconds: null, rssBytes, output, note: `${how}${toolStderr ? `: ${toolStderr}` : ""}` });
      }
      if (capture === "lines" && output.split("\n").filter(Boolean).length !== cap) {
        const got = output ? output.split("\n").length : 0;
        return resolvePromise({ kind: "failed", seconds: null, rssBytes, output, note: `produced ${got} lines, expected ${cap}${toolStderr ? `: ${toolStderr}` : ""}` });
      }
      resolvePromise({ kind: "ok", seconds, rssBytes, output, note: null });
    });
  });
}

async function bestOf(command, runs, options) {
  let best = null;
  for (let i = 0; i < runs; i += 1) {
    const current = await runOnce(command, options);
    if (current.kind !== "ok") return current;
    if (best === null || current.seconds < best.seconds) best = current;
  }
  return best;
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "n/a";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1048576).toFixed(0)} MB`;
}

const formatSeconds = (seconds) => `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s`;

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
  return { ok: result.status === 0, stdout: result.stdout ?? "", error: (result.stderr || result.error?.message || `exit ${result.status}`).trim().split("\n")[0].slice(0, 160) };
}

const EDGE_DOC = JSON.stringify({
  empty_obj: {},
  empty_arr: [],
  nested_empty: { a: [[], {}] },
  unicode: "café ☕ 日本語 😀",
  escapes: 'line\nbreak "q" \\ \t tab </script> & <b>',
  "weird.key": 1,
  "key with space": 2,
  'key"quote': 3,
  0: "numeric key",
  "a[0]": "bracket key",
  "": "empty key",
  nulls: [null, null],
  bools: [true, false],
  numbers: [0, -1, 1.5, 1e3, 1e-7],
  deep: { a: { b: { c: [1, [2, [3]]] } } },
  ünïcode_key: "v",
});

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
        results.push({ tool, pass: null, note: `skipped: ${reason}` });
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

  forTools(`big integers and trailing-zero decimals survive flatten (${BIGINT_LITERALS.join(", ")})`, Object.fromEntries(Object.entries(OPS[0].tools).filter(([tool]) => tool !== "gron --no-sort")), (tool, template) => {
    const run = shell(expand(template, context(bigintFile)));
    return run.ok ? literalNote(run.stdout) : { pass: false, note: run.error };
  });

  forTools(`big integers and trailing-zero decimals survive a flatten and unflatten round trip`, ROUNDTRIP, (tool, template) => {
    const run = shell(expand(template, context(bigintFile)));
    return run.ok ? literalNote(run.stdout) : { pass: false, note: run.error };
  });

  const roundTrip = (file) => (tool, template) => {
    const run = shell(expand(template, context(file)));
    if (!run.ok) return { pass: false, note: run.error };
    const verdict = sameJson(readFileSync(file, "utf8"), run.stdout);
    return { pass: verdict.equal, note: verdict.note };
  };
  forTools(`round trip equals the input (${(statSync(recordsFile).size / 1048576).toFixed(1)} MB of generated records)`, ROUNDTRIP, roundTrip(recordsFile));
  forTools("round trip equals the input (edge cases: empty containers, unicode, escapes, dotted/quoted/empty keys, -0, exponents)", ROUNDTRIP, roundTrip(edgeFile));

  // The unflatten workloads feed every tool gron statements written by fastgron (or gron); make sure all of them read that.
  const gronFile = join(dir, "check-records.gron");
  const producer = !missing.fastgron ? "fastgron --semicolon $INPUT" : !missing.gron ? "gron --no-sort $INPUT" : null;
  if (producer) {
    const written = shell(`${expand(producer, context(recordsFile))} > ${shellQuote(gronFile)}`);
    if (written.ok) {
      forTools(`unflatten of ${producer.split(" ")[0]} output equals the input (the gron statements used by the unflatten workloads)`, OPS[2].tools, (tool, template) => {
        const run = shell(expand(template, context(recordsFile, gronFile)));
        if (!run.ok) return { pass: false, note: run.error };
        const verdict = sameJson(readFileSync(recordsFile, "utf8"), run.stdout);
        return { pass: verdict.equal, note: verdict.note };
      });
    }
  }

  // Search counts: the reference is `gron | grep -c`, the de-facto way to search gron output.
  const searchTemplates = OPS[1].tools;
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
    ["capped flatten returns exactly 10 lines that match the start of the full output", OPS[3]],
    ["capped search returns exactly 10 lines that match the start of the full result", OPS[4]],
  ]) {
    forTools(title, capped.tools, (tool, template) => {
      const run = shell(expand(template, context(recordsFile)), { pipefail: false });
      if (!run.ok) return { pass: false, note: run.error };
      const lines = run.stdout.split("\n").filter(Boolean);
      if (lines.length !== 10) return { pass: false, note: `returned ${lines.length} lines` };
      const reference = shell(`${expand(uncapped(template), context(recordsFile))} | head -n 10`, { pipefail: false });
      const same = reference.stdout.split("\n").filter(Boolean).join("\n") === lines.join("\n");
      return { pass: same, note: same ? "10 lines, same as the head of the uncapped output" : "10 lines, but not the same as the head of a second run of the uncapped command (output order is not stable)" };
    });
  }
  return checks;
}

// ---------------------------------------------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------------------------------------------

function runsFor(bytes, options) {
  if (options.runs !== null) return options.runs;
  if (bytes <= 16 * 1048576) return 5;
  if (bytes <= 200 * 1048576) return 3;
  return 1;
}

/** Remembers per family/op/tool what happened at the previous (smaller) size, to skip tools that already gave up. */
const history = new Map();
/** Tools that parse the whole document before printing anything: if one dies on an input, its other operations will too. */
const WHOLE_DOCUMENT = new Set(["gron", "gron --no-sort", "jaq"]);
const wholeDocumentFailures = new Map();

async function runWorkload({ family, inputId, inputLabel, op, file, gronFile, options, missing }) {
  const inputPath = op.input === "gron" ? gronFile : file;
  const bytes = statSync(inputPath).size;
  const runs = runsFor(bytes, options);
  const results = [];
  const toolIds = [...Object.keys(op.tools), ...Object.keys(op.unsupported ?? {})];
  console.error(`\n== ${op.key} / ${inputId} (${(bytes / 1048576).toFixed(0)} MB, best of ${runs})`);
  spawnSync("/bin/cat", [inputPath], { stdio: ["ignore", "ignore", "ignore"], maxBuffer: 1 << 20 }); // warm the page cache
  for (const tool of toolIds) {
    const template = op.tools[tool];
    const display = template ?? "";
    const entry = { tool, command: display, seconds: null, peakRssBytes: null, status: "skipped" };
    const keyed = `${family}|${op.key}|${tool}`;
    const previous = history.get(keyed);
    const reason = unavailable(tool, missing);
    if (template === undefined) {
      entry.command = "";
      entry.note = op.unsupported[tool];
    } else if (reason) {
      entry.note = reason;
    } else if (op.key !== "unflatten" && wholeDocumentFailures.has(`${inputId}|${tool}`)) {
      const earlier = wholeDocumentFailures.get(`${inputId}|${tool}`);
      entry.note = `not run: ${tool} already ${earlier.status === "timeout" ? "timed out" : "failed"} on this input in ${earlier.op} (it parses the whole document first)`;
    } else if (previous && previous.status !== "ok") {
      entry.note = `skipped after ${previous.status} on the smaller ${previous.inputLabel} input`;
    } else if (previous && options.projectSkip > 0 && previous.seconds * (bytes / previous.bytes) > options.projectSkip * options.timeout) {
      entry.note = `not run: ${formatSeconds(previous.seconds)} on ${previous.inputLabel} projects to ~${formatSeconds(previous.seconds * (bytes / previous.bytes))} here, over ${options.projectSkip}x the ${options.timeout} s timeout`;
    } else {
      const command = expand(template, { input: file, gron: gronFile, term: options.term });
      const outcome = await bestOf(command, runs, {
        timeoutMs: options.timeout * 1000,
        maxRssBytes: options.maxRssGb * 1024 ** 3,
        capture: op.capture ?? null,
        pipefail: op.pipefail ?? true,
        cap: op.cap ?? 0,
      });
      entry.status = outcome.kind;
      if (outcome.kind === "ok") {
        entry.seconds = Number(outcome.seconds.toFixed(3));
        entry.peakRssBytes = outcome.rssBytes;
        if (op.capture === "count") entry.note = `count ${outcome.output}`;
      } else {
        entry.note = outcome.note;
        entry.peakRssBytes = null;
        if (op.key !== "unflatten" && WHOLE_DOCUMENT.has(tool)) wholeDocumentFailures.set(`${inputId}|${tool}`, { status: outcome.kind, op: op.key });
      }
    }
    if (entry.status !== "skipped") history.set(keyed, { status: entry.status, seconds: entry.seconds, bytes, inputLabel });
    console.error(`   ${tool.padEnd(15)} ${entry.status.padEnd(8)} ${entry.seconds === null ? "" : formatSeconds(entry.seconds)} ${entry.peakRssBytes ? formatBytes(entry.peakRssBytes) : ""} ${entry.note ?? ""}`);
    results.push(entry);
  }
  // Search counts should agree; say so when they do not, next to the numbers.
  if (op.capture === "count") {
    const counts = new Map();
    for (const r of results) if (r.status === "ok") counts.set(r.tool, r.note.replace("count ", ""));
    const reference = counts.get("gron") ?? counts.get("gronify");
    for (const r of results) if (r.status === "ok" && counts.get(r.tool) !== reference) r.note += ` (differs from the reference ${reference})`;
  }
  return { id: `${op.key}-${inputId}`, operation: op.key, label: `${op.label}: ${inputLabel}`, inputBytes: bytes, results };
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

function cell(result) {
  if (!result) return "n/a";
  if (result.status === "ok") return `${formatSeconds(result.seconds)} / ${formatBytes(result.peakRssBytes)}`;
  if (result.status === "timeout") return "timeout";
  if (result.status === "failed") return "failed";
  return "skipped";
}

function renderMarkdown(report, options, fullCommands) {
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
  for (const [name, version] of Object.entries(report.tools)) push(`  - ${name} ${version}`);
  const absent = Object.entries(report.toolsMissing);
  for (const [name, why] of absent) push(`  - ${name}: ${why}`);
  push();
  push("## Methodology");
  push();
  push("- **Inputs** are generated deterministically (seeded PRNG) into a temp directory and deleted afterwards:");
  push("  - `records`: a top-level JSON array of event-log style records (about 0.5 KB each: nested objects, arrays, floats, booleans, nulls, non-ASCII text). The search term appears in the `message` of about 1.5% of the records.");
  push("  - `keyed`: the same records stored as one object (`{\"r0\":{...},\"r1\":{...}}`) instead of an array, used for unflatten only. It is included because some gron implementations rebuild large arrays much more expensively than large objects, so the array-shaped `records` input alone could mislead.");
  push("  - `deep`: `{\"a\":{\"a\":{...1}}}` nested N levels. Flattening it emits N lines whose paths grow with the depth, so the output is quadratic in N.");
  push("  - `bigint`: records with integers beyond 2^53 (12345678901234567890 and up) and decimals with trailing zeros (1.10).");
  push("- **Timing**: wall time of `bash -c '<command>'` under `/usr/bin/time -l`, which includes process start-up (for gronify, Node start-up). Output goes to `/dev/null`. The search workloads print one number and the capped workloads ten lines; those few bytes are captured to validate the run. The reported time is the best of N runs (5 runs up to 16 MB, 3 up to 200 MB, 1 above). The page cache is warmed with one read of the input first, so the numbers measure CPU and memory behavior, not the disk.");
  push("- **Peak RSS** is the maximum resident set size reported by `/usr/bin/time -l`, which for a pipeline is the largest single process in it (not the sum), taken from the same run as the reported time.");
  push(`- **Limits**: each run is killed after ${options.timeout} s (status \`timeout\`) or when its process tree exceeds ${options.maxRssGb} GB (status \`failed\`, to protect the machine from tools that load the whole document). A tool that fails or times out at one size is not run at larger sizes. A tool whose previous size, scaled linearly, would take more than ${options.projectSkip}x the timeout is also not run (status \`skipped\`, with the projection in the note); this is a time-budget shortcut, not a measurement.`);
  push("- **Fair equivalents**: each tool is run the way its documentation suggests for the job, in its default mode unless stated. Notes on the choices:");
  push("  - gron sorts its output by default and reads the whole document before printing; `gron --no-sort` is listed separately. gronify and fastgron keep document order, so `gron --no-sort` is the closest like-for-like (it does not guarantee document order).");
  push("  - gronify search is case-insensitive by default; `--case-sensitive` is used so that it matches `grep`. Search matches whole gron lines (path and value) for all gron-style tools.");
  push("  - `fastgron -F` is fastgron's native fixed-string filter; it is listed next to `fastgron | grep` for search.");
  push("  - jq and jaq do not produce gron. The closest honest equivalent for jq is `jq --stream -c .`, which emits one `[path, leaf]` event per leaf (plus closing events) with constant memory. jaq has no `--stream`, so it runs a path/leaf extraction filter on the fully parsed document, which is closer to the \"flatten\" jq idiom `paths(scalars)` but keeps nulls and empty containers. Their output is not byte-compatible with gron, and they cannot read gron statements, so they are skipped for unflatten.");
  push("  - Capped workloads compare early exit: gronify `--limit`/`--max-count` stop reading the input; the others run through `head -n 10` or `grep -m 10`, which stops the pipeline only if the producer notices the closed pipe. Tools that must read and parse the whole document first (gron, jaq) cannot exit early. The matches are near the start of the file, which is the favorable case for early exit.");
  push("  - The unflatten input is `fastgron --semicolon` output (gron-format statements in document order) for every tool, since gron needs the trailing semicolons. gronify's unflatten output is compact JSON, gron's and fastgron's is indented, so they write different numbers of bytes to `/dev/null`.");
  push("- **Correctness checks** are run on small documents before timing and are listed at the end of this file. They are not timed.");
  push();
  push("## Results");
  push();
  push("Each cell is `wall time / peak RSS`; the fastest successful time in a column is **bold**. Lower is better.");
  const byOp = new Map();
  for (const workload of report.workloads) {
    if (!byOp.has(workload.operation)) byOp.set(workload.operation, []);
    byOp.get(workload.operation).push(workload);
  }
  const noteLines = [];
  for (const [operation, workloads] of byOp) {
    push();
    push(`### ${workloads[0].label.split(":")[0]}`);
    push();
    push(`| Tool | ${workloads.map((w) => w.label.split(": ")[1]).join(" | ")} |`);
    push(`| --- | ${workloads.map(() => "---").join(" | ")} |`);
    const tools = [...new Set(workloads.flatMap((w) => w.results.map((r) => r.tool)))];
    const fastest = workloads.map((w) => Math.min(...w.results.filter((r) => r.status === "ok").map((r) => r.seconds)));
    for (const tool of tools) {
      const cells = workloads.map((w, index) => {
        const result = w.results.find((r) => r.tool === tool);
        const text = cell(result);
        if (result?.status === "ok" && result.seconds === fastest[index]) return `**${text}**`;
        return text;
      });
      push(`| ${tool} | ${cells.join(" | ")} |`);
    }
    for (const w of workloads) {
      // Successful search runs carry their match count in the note; only mismatches are worth repeating here.
      for (const r of w.results) if (r.note && !r.note.includes("reads JSON, not gron") && (r.status !== "ok" || r.note.includes("differs"))) noteLines.push(`- ${w.label} / ${r.tool}: ${r.status === "ok" ? "" : `${r.status}. `}${r.note}`);
    }
  }
  push();
  const searchRuns = report.workloads.filter((w) => w.operation === "search").flatMap((w) => w.results.filter((r) => r.status === "ok"));
  push("### Notes on individual results");
  push();
  push(searchRuns.some((r) => r.note.includes("differs")) ? "- Search match counts differ between tools in some runs; see the entries below." : "- Search match counts were identical across every tool that completed, at every size.");
  for (const line of noteLines) push(line);
  push();
  push("## Correctness checks");
  push();
  push("`pass` is `n/a` when the tool is not installed.");
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
  push("brew install gron fastgron jq jaq   # any missing tool is recorded as skipped");
  push("cd src/packages/cli");
  push("npm ci && npm run build");
  push("npm run bench:compare               # about 20 minutes with the default sizes; needs a few GB of free temp space and RAM");
  push("npm run bench:compare -- --sizes 10 --deep 2000 --out-json /tmp/r.json --out-md /tmp/r.md   # quick run");
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
for (const op of OPS) for (const [tool, template] of Object.entries(op.tools)) commandRows.push([[op.label, tool], template]);
for (const [tool, template] of Object.entries(ROUNDTRIP)) if (typeof template === "string") commandRows.push([["round-trip check", tool], template]);

if (options.renderOnly) {
  const saved = JSON.parse(readFileSync(options.renderOnly, "utf8"));
  writeFileSync(options.outMd, renderMarkdown({ ...saved, toolsMissing: {} }, options, commandRows));
  console.error(`Wrote ${options.outMd}`);
  process.exit(0);
}

const { versions, missing } = detectTools();
if (missing.gronify) throw new Error(missing.gronify);

const dir = mkdtempSync(join(tmpdir(), "gronify-compare-"));
const cleanup = () => {
  if (options.keep) console.error(`Kept benchmark files in ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
};
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

try {
  console.error("Running correctness checks...");
  const correctness = runChecks({ dir, term: options.term, missing });
  for (const check of correctness) {
    console.error(`  ${check.check}`);
    for (const r of check.results) console.error(`    ${r.tool.padEnd(10)} ${r.pass === null ? "n/a " : r.pass ? "pass" : "FAIL"} ${r.note}`);
  }

  const writeGron = (jsonFile, gronFile) => {
    const producer = !missing.fastgron ? "fastgron --semicolon $INPUT" : !missing.gron ? "gron --no-sort $INPUT" : null;
    if (!producer) return false;
    const written = shell(`${expand(producer, { input: jsonFile, term: options.term })} > ${shellQuote(gronFile)}`, { timeoutMs: 30 * 60_000 });
    return written.ok;
  };

  const workloads = [];
  const run = async (family, inputId, inputLabel, file, ops, gronFile) => {
    for (const op of ops) {
      if (op.input === "gron" && !gronFile) {
        workloads.push({ id: `${op.key}-${inputId}`, operation: op.key, label: `${op.label}: ${inputLabel}`, inputBytes: statSync(file).size, results: Object.keys({ ...op.tools, ...op.unsupported }).map((tool) => ({ tool, command: op.tools[tool] ?? "", seconds: null, peakRssBytes: null, status: "skipped", note: op.tools[tool] ? "no gron input could be generated" : op.unsupported[tool] })) });
        continue;
      }
      workloads.push(await runWorkload({ family, inputId, inputLabel, op, file, gronFile, options, missing }));
    }
  };
  const byKey = (...keys) => OPS.filter((op) => keys.includes(op.key));

  for (const mb of options.sizes) {
    const label = mb >= 1000 && mb % 1000 === 0 ? `${mb / 1000} GB` : `${mb} MB`;
    const file = join(dir, `records-${mb}mb.json`);
    const gronFile = join(dir, `records-${mb}mb.gron`);
    console.error(`\nGenerating records ${label}...`);
    await generateArray(file, mb * 1048576, eventRecord, 42);
    const haveGron = writeGron(file, gronFile);
    await run("records", `records-${mb}mb`, `records ${label}`, file, OPS, haveGron ? gronFile : null);
    rmSync(file, { force: true });
    rmSync(gronFile, { force: true });
  }

  for (const mb of options.keyed) {
    const label = mb >= 1000 && mb % 1000 === 0 ? `${mb / 1000} GB` : `${mb} MB`;
    const file = join(dir, `keyed-${mb}mb.json`);
    const gronFile = join(dir, `keyed-${mb}mb.gron`);
    console.error(`\nGenerating keyed records ${label}...`);
    await generateArray(file, mb * 1048576, eventRecord, 43, true);
    const haveGron = writeGron(file, gronFile);
    await run("keyed", `keyed-${mb}mb`, `keyed object ${label}`, file, byKey("unflatten"), haveGron ? gronFile : null);
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
    await run("deep", `deep-${levels}`, `${levels} levels deep`, file, byKey("flatten", ...(levels <= 10_000 ? ["unflatten"] : [])), haveGron ? gronFile : null);
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
  }

  const toolsMissing = {};
  for (const [name, why] of Object.entries(missing)) toolsMissing[name] = why;
  const report = {
    generatedAt: new Date().toISOString(),
    machine: machineInfo(),
    tools: versions,
    workloads,
    correctness,
  };

  mkdirSync(dirname(options.outJson), { recursive: true });
  writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(options.outMd, `${renderMarkdown({ ...report, toolsMissing }, options, commandRows)}`);
  console.error(`\nWrote ${options.outJson}\nWrote ${options.outMd}`);
} finally {
  cleanup();
}
