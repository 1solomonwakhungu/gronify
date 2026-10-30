#!/usr/bin/env node
// Benchmarks `gronify flatten` and `gronify search --count` on generated inputs.
//
//   npm run build && npm run bench
//   npm run bench -- --sizes 23,129 --baseline /path/to/old/dist/index.js
//   npm run bench -- --sizes 23 --big 3 --deep 100000
//
// Inputs are generated into a temp directory and deleted afterwards. Output goes to /dev/null so the numbers
// measure the CLI, not the terminal. Peak RSS comes from /usr/bin/time (-l on macOS, -v on Linux) when available.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = `Usage: node scripts/bench.mjs [options]

  --sizes <mb,mb,...>   Input sizes in MB to compare (default: 23,129)
  --big <gb>            Also run the new CLI once on a generated input of this many GB
  --deep <levels>       Also flatten a document nested this many levels deep
  --baseline <file>     dist/index.js of an older build to compare against
  --runs <n>            Runs per measurement for the --sizes inputs, best kept (default: 3)
  --term <text>         Search term (default: status)
  --keep                Keep the generated files and print their location
  -h, --help            Show this help`;

function parseArgs(argv) {
  const options = { sizes: [23, 129], big: 0, deep: 0, baseline: null, runs: 3, term: "status", keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    if (flag === "--sizes") options.sizes = value().split(",").filter(Boolean).map(Number);
    else if (flag === "--big") options.big = Number(value());
    else if (flag === "--deep") options.deep = Number(value());
    else if (flag === "--baseline") options.baseline = resolve(value());
    else if (flag === "--runs") options.runs = Number(value());
    else if (flag === "--term") options.term = value();
    else if (flag === "--keep") options.keep = true;
    else if (flag === "-h" || flag === "--help") {
      console.log(usage);
      process.exit(0);
    } else throw new Error(`Unknown option ${flag}\n\n${usage}`);
  }
  for (const number of [...options.sizes, options.big, options.deep, options.runs]) {
    if (!Number.isFinite(number) || number < 0) throw new Error("Numeric options must be non-negative numbers");
  }
  return options;
}

/** Writes `[{"id":0,"user":{...},"status":"ok","score":0},...]` of about `bytes` bytes, honoring backpressure. */
async function generateRecords(file, bytes) {
  const out = createWriteStream(file);
  let id = 0;
  let written = 0;
  out.write("[");
  while (written < bytes) {
    let batch = "";
    for (let k = 0; k < 5000; k += 1, id += 1) {
      batch += `${id ? "," : ""}{"id":${id},"user":{"name":"user${id}","email":"u${id}@example.com","tags":["a","b"]},"status":"ok","score":0}`;
    }
    written += batch.length;
    if (!out.write(batch)) await once(out, "drain");
  }
  out.end("]");
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

const timeBinary = existsSync("/usr/bin/time") ? "/usr/bin/time" : null;

/** Runs the CLI with stdout discarded; resolves with wall-clock seconds and peak RSS in MB (null if unknown). */
function measure(cli, args) {
  return new Promise((resolvePromise) => {
    const timeFlag = process.platform === "darwin" ? "-l" : "-v";
    const command = timeBinary ? [timeBinary, timeFlag, "node", cli, ...args] : ["node", cli, ...args];
    const started = process.hrtime.bigint();
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 1 << 20) stderr = stderr.slice(-(1 << 16));
    });
    child.on("close", (code) => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const mac = stderr.match(/(\d+)\s+maximum resident set size/);
      const linux = stderr.match(/Maximum resident set size \(kbytes\): (\d+)/);
      const rssMb = mac ? Number(mac[1]) / 1048576 : linux ? Number(linux[1]) / 1024 : null;
      resolvePromise({ seconds, rssMb, code, stderr: stderr.trim().split("\n").slice(0, 3).join(" | ") });
    });
  });
}

async function best(cli, args, runs) {
  let result = null;
  for (let i = 0; i < runs; i += 1) {
    const current = await measure(cli, args);
    if (current.code !== 0) return current;
    if (result === null || current.seconds < result.seconds) result = current;
  }
  return result;
}

function describe(result) {
  if (result === null) return "n/a";
  if (result.code !== 0) return `failed (exit ${result.code}): ${result.stderr.slice(0, 60)}`;
  const rss = result.rssMb === null ? "" : `, ${result.rssMb.toFixed(0)} MB RSS`;
  return `${result.seconds.toFixed(2)} s${rss}`;
}

const options = parseArgs(process.argv.slice(2));
const here = fileURLToPath(new URL(".", import.meta.url));
const cli = resolve(here, "../dist/index.js");
if (!existsSync(cli)) throw new Error("dist/index.js not found; run `npm run build` first");

const dir = mkdtempSync(join(tmpdir(), "gronify-bench-"));
try {
  const rows = [];
  for (const mb of options.sizes) {
    const file = join(dir, `records-${mb}mb.json`);
    await generateRecords(file, mb * 1024 * 1024);
    const actual = (statSync(file).size / 1048576).toFixed(0);
    // `newOnly` rows use options an older baseline build does not have, so they only run on this build.
    for (const [name, args, newOnly] of [
      ["flatten", ["flatten", file], false],
      ["search --count", ["search", file, options.term, "--count"], false],
      ["flatten --sort", ["flatten", "--sort", file], true],
      ["search -m 5 (stops early)", ["search", file, options.term, "-m", "5"], true],
    ]) {
      const current = await best(cli, args, options.runs);
      const before = options.baseline && !newOnly ? await best(options.baseline, args, options.runs) : null;
      rows.push([`${actual} MB`, name, before ? describe(before) : "n/a", describe(current)]);
    }
    rmSync(file);
  }

  if (options.big > 0) {
    const file = join(dir, "big.json");
    console.error(`Generating ${options.big} GB input...`);
    await generateRecords(file, options.big * 1024 ** 3);
    const size = (statSync(file).size / 1024 ** 3).toFixed(2);
    for (const [name, args] of [
      ["flatten", ["flatten", file]],
      ["search --count", ["search", file, options.term, "--count"]],
    ]) {
      rows.push([`${size} GB`, name, "n/a", describe(await measure(cli, args))]);
    }
    rmSync(file);
  }

  if (options.deep > 0) {
    const file = join(dir, "deep.json");
    await generateDeep(file, options.deep);
    rows.push([`${options.deep} levels deep`, "flatten", "n/a", describe(await measure(cli, ["flatten", file]))]);
  }

  const baselineHeader = options.baseline ? "Baseline" : "Baseline (pass --baseline)";
  console.log(`| Input | Command | ${baselineHeader} | This build |`);
  console.log("| --- | --- | --- | --- |");
  for (const row of rows) console.log(`| ${row.join(" | ")} |`);
  console.log(`\nNode ${process.version}, ${process.platform}/${process.arch}, best of ${options.runs} for --sizes runs.`);
} finally {
  if (options.keep) console.error(`Kept benchmark files in ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
}
