#!/usr/bin/env node
// Benchmark and correctness harness for `gronify unflatten`.
//
// Generates gron inputs in a temp directory, times the CLI under /usr/bin/time
// (wall clock and peak RSS), and verifies the output. Nothing large is ever
// written inside the repository; the temp directory is removed on exit.
//
//   node scripts/bench-unflatten.mjs [--cli dist/index.js] [--sizes 56,285]
//                                    [--huge 3] [--roundtrip] [--runs 3]
//
//   --cli        CLI entry to benchmark (default: ../dist/index.js)
//   --sizes      comma-separated gron input sizes in MB (default: 56,285)
//   --huge       one extra input of this many GB (default: off)
//   --runs       timed runs per size, best is reported (default: 3)
//   --roundtrip  run the flatten | unflatten correctness check (default: on
//                when no size flags are given)
//   --no-verify  skip the sha256 output check

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deepStrictEqual } from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1];
}

const cli = resolve(option("cli", join(here, "..", "dist", "index.js")));
const explicit = ["sizes", "huge", "roundtrip"].some((name) => args.includes(`--${name}`));
const sizesMb = (args.includes("--sizes") ? option("sizes", "") : explicit ? "" : "56,285")
  .split(",")
  .filter(Boolean)
  .map(Number);
const hugeGb = Number(option("huge", "0"));
const runs = Number(option("runs", "3"));
const verify = !args.includes("--no-verify");
const roundtrip = args.includes("--roundtrip") || !explicit;

const isMac = platform() === "darwin";
const timeBinary = "/usr/bin/time";

function recordGron(i) {
  const p = `json[${i}]`;
  return (
    `${p} = {}\n${p}.id = ${i}\n${p}.user = {}\n${p}.user.name = "user${i}"\n` +
    `${p}.user.email = "u${i}@example.com"\n${p}.user.tags = []\n${p}.user.tags[0] = "a"\n` +
    `${p}.user.tags[1] = "b"\n${p}.status = "ok"\n${p}.score = 0\n`
  );
}

function recordJson(i) {
  return `{"id":${i},"user":{"name":"user${i}","email":"u${i}@example.com","tags":["a","b"]},"status":"ok","score":0}`;
}

// Writes gron for an array of records until `targetBytes` is reached, and
// returns the sha256 and byte length of the compact JSON the CLI must produce.
async function generateGron(file, targetBytes) {
  const out = createWriteStream(file);
  const expected = createHash("sha256");
  let written = 0;
  let expectedBytes = 0;
  let records = 0;
  const feedExpected = (text) => {
    expected.update(text);
    expectedBytes += Buffer.byteLength(text);
  };

  const first = "json = []\n";
  out.write(first);
  written += first.length;
  feedExpected("[");

  while (written < targetBytes) {
    let gron = "";
    let json = "";
    for (let n = 0; n < 4096 && written + gron.length < targetBytes; n += 1) {
      gron += recordGron(records);
      json += (records === 0 ? "" : ",") + recordJson(records);
      records += 1;
    }
    written += gron.length;
    feedExpected(json);
    if (!out.write(gron)) await once(out, "drain");
  }
  feedExpected("]\n");
  out.end();
  await once(out, "finish");
  return { records, bytes: written, expectedBytes, expectedSha: expected.digest("hex") };
}

function parseTime(stderr) {
  const rss = isMac
    ? Number(/(\d+)\s+maximum resident set size/.exec(stderr)?.[1]) / (1024 * 1024)
    : Number(/Maximum resident set size \(kbytes\): (\d+)/.exec(stderr)?.[1]) / 1024;
  const real = isMac
    ? Number(/([\d.]+)\s+real/.exec(stderr)?.[1])
    : parseElapsed(/Elapsed \(wall clock\) time.*: ([\d:.]+)/.exec(stderr)?.[1]);
  return { seconds: real, rssMb: rss };
}

function parseElapsed(text = "") {
  return text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

function timedRun(file) {
  const result = spawnSync(
    "/bin/sh",
    ["-c", `${timeBinary} ${isMac ? "-l" : "-v"} "$0" "$1" --no-color unflatten "$2" > /dev/null`, process.execPath, cli, file],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  if (result.status !== 0) {
    throw new Error(`unflatten failed (${result.status}): ${result.stderr.slice(-500)}`);
  }
  return parseTime(result.stderr);
}

async function checkedRun(file, expected) {
  const child = spawn(process.execPath, [cli, "--no-color", "unflatten", file], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const hash = createHash("sha256");
  let bytes = 0;
  child.stdout.on("data", (chunk) => {
    hash.update(chunk);
    bytes += chunk.length;
  });
  const [code] = await once(child, "close");
  const sha = hash.digest("hex");
  const ok = code === 0 && sha === expected.expectedSha && bytes === expected.expectedBytes;
  return { ok, bytes, sha };
}

async function benchSize(dir, label, targetBytes) {
  const file = join(dir, `${label}.gron`);
  const started = Date.now();
  const generated = await generateGron(file, targetBytes);
  const size = (await stat(file)).size;
  console.error(`generated ${label}: ${(size / 1e6).toFixed(0)} MB, ${generated.records} records in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const samples = [];
  const count = size > 1e9 ? 1 : runs;
  for (let run = 0; run < count; run += 1) samples.push(timedRun(file));
  const best = samples.reduce((a, b) => (a.seconds <= b.seconds ? a : b));
  const rss = Math.max(...samples.map((sample) => sample.rssMb));

  let verified = "skipped";
  if (verify) {
    const check = await checkedRun(file, generated);
    verified = check.ok ? "ok" : `MISMATCH (bytes ${check.bytes} vs ${generated.expectedBytes})`;
  }
  await rm(file, { force: true });
  return { label, mb: Math.round(size / 1e6), seconds: best.seconds, rssMb: rss, verified };
}

// ---------------------------------------------------------------- round trip

function mulberry32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keyPool = [
  "a", "b", "id", "name", "user_name", "$ref", "_x", "service.name", "with space", "quote\"d",
  "back\\slash", "brace]d", "unié", "emoji\u{1F600}", "tab\tkey", "0", "12", "", "constructor",
  "__proto__", "line\nbreak", "ctl\u0001", "a=b", "semi;colon",
];
const stringPool = [
  "", "plain", "with \"quotes\"", "back\\slash", "new\nline", "tab\t", "unié中文",
  "emoji\u{1F600}", "\u0000nul", " sep", "a/b", "trailing;", "= equals", "[1]", "ends with space ",
];
const numberPool = [0, -0.5, 1, 42, 1e21, 1e-7, 123456789.125, -17, 3.14159, 2 ** 31, 5e-324];

function randomValue(random, depth) {
  const roll = random();
  if (depth > 5 || roll < 0.45) {
    const kind = random();
    if (kind < 0.3) return stringPool[Math.floor(random() * stringPool.length)];
    if (kind < 0.6) return numberPool[Math.floor(random() * numberPool.length)];
    if (kind < 0.75) return null;
    return random() < 0.5;
  }
  const size = Math.floor(random() * 5);
  if (roll < 0.72) {
    return Array.from({ length: size }, () => randomValue(random, depth + 1));
  }
  const object = {};
  for (let n = 0; n < size; n += 1) {
    const key = keyPool[Math.floor(random() * keyPool.length)];
    Object.defineProperty(object, key, {
      value: randomValue(random, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return object;
}

function runCli(commandArgs, input) {
  const result = spawnSync(process.execPath, [cli, "--no-color", ...commandArgs], {
    input,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (result.status !== 0) throw new Error(`${commandArgs.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function roundTripCheck() {
  const random = mulberry32(20261029);
  const documents = [];
  for (let n = 0; n < 60; n += 1) documents.push(randomValue(random, 0));
  documents.push([{ nested: [[], {}, [[]], [{}]] }, "x"], {}, [], 0, "scalar", null);
  // Big numbers: the CLI keeps these verbatim, so compare as text, not as parsed values.
  let failures = 0;
  const bundle = documents;
  const flat = runCli(["flatten"], JSON.stringify(bundle));
  const rebuilt = JSON.parse(runCli(["unflatten"], flat));
  const pretty = JSON.parse(runCli(["--pretty", "unflatten"], flat));
  try {
    deepStrictEqual(rebuilt, bundle);
    deepStrictEqual(pretty, bundle);
  } catch (error) {
    failures += 1;
    console.error(`round trip mismatch: ${String(error.message).slice(0, 400)}`);
  }
  // Each document on its own as well, so a failure points at one input.
  documents.forEach((document, index) => {
    try {
      const text = runCli(["unflatten"], runCli(["flatten"], JSON.stringify(document)));
      deepStrictEqual(JSON.parse(text), document);
    } catch (error) {
      failures += 1;
      console.error(`document ${index} failed: ${String(error.message).slice(0, 200)}`);
    }
  });
  return { documents: documents.length + 1, failures };
}

// ---------------------------------------------------------------------- main

const dir = await mkdtemp(join(tmpdir(), "gronify-bench-"));
const rows = [];
try {
  for (const mb of sizesMb) rows.push(await benchSize(dir, `${mb}mb`, mb * 1e6));
  if (hugeGb > 0) rows.push(await benchSize(dir, `${hugeGb}gb`, hugeGb * 1e9));

  if (rows.length > 0) {
    console.log(`\nunflatten benchmark (${cli})`);
    console.log("| input | seconds | peak RSS (MB) | output check |");
    console.log("| --- | ---: | ---: | --- |");
    for (const row of rows) {
      console.log(`| ${row.mb} MB gron | ${row.seconds.toFixed(2)} | ${row.rssMb.toFixed(0)} | ${row.verified} |`);
    }
  }

  if (roundtrip) {
    const result = roundTripCheck();
    console.log(`\nround trip: ${result.documents} documents, ${result.failures} failures`);
    if (result.failures > 0) process.exitCode = 1;
  }
  if (rows.some((row) => row.verified !== "ok" && row.verified !== "skipped")) process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
