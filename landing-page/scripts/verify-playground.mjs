#!/usr/bin/env node
/**
 * Checks that the browser playground engine prints exactly what the Gronify CLI prints.
 *
 *   npm run test:playground
 *       Compares the engine with output recorded from the CLI in scripts/playground-golden.json.
 *
 *   npm run test:playground -- --cli ../src/packages/cli/dist/index.js
 *       Runs the built CLI live on every case plus seeded random documents, and compares.
 *
 *       Add `--random <n>` to change how many random documents run (default 400).
 *
 *   npm run test:playground -- --cli ../src/packages/cli/dist/index.js --write-golden
 *       Re-records the golden file from the CLI.
 *
 * Every case is run as `node <cli> --no-color <args>` on a temp file, where <args> comes from the same
 * `commandArguments` that builds the playground's command bar, so the generated commands are checked too.
 * On an error the CLI may already have written some lines, so only stderr is compared there.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "../src/app/playground");
const goldenPath = join(here, "playground-golden.json");

const gron = await import(join(app, "gron-engine.ts"));
const ungron = await import(join(app, "ungron-engine.ts"));
const { commandArguments } = await import(join(app, "cli-command.ts"));
const { samples } = await import(join(app, "samples.ts"));

const argv = process.argv.slice(2);
const cliIndex = argv.indexOf("--cli");
const cliPath = cliIndex === -1 ? null : resolve(argv[cliIndex + 1] ?? "");
const writeGolden = argv.includes("--write-golden");
const randomIndex = argv.indexOf("--random");
const randomCount = randomIndex === -1 ? 400 : Number(argv[randomIndex + 1]);
if (writeGolden && cliPath === null) {
  console.error("--write-golden needs --cli <path to the built CLI>");
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------------------------
// Fixtures

const jsonFixtures = {
  ...Object.fromEntries(samples.filter((sample) => !sample.stream).map((sample) => [sample.id, sample.json])),
  scalars: '["x", 42, -0, 1E+2, 0.000, 1.10, 12345678901234567890, true, false, null]',
  topString: '"just a string"',
  topNumber: "12345678901234567890",
  topNull: "null",
  unicode:
    '{"caf\\u00e9": "na\\u00efve", "é": "raw é", "emoji": "\\ud83d\\ude00 😀", "lone": "\\ud800", "ctl": "\\u0001\\b\\f\\n\\r\\t", "slash": "\\/", "quote\\"key": "\\"q\\"", "back\\\\slash": 1, "u2028": " "}',
  duplicates: '{"b": 1, "a": 2, "b": 3, "A": 4, "_": 5, "$x": 6, "1": 7, "10": 8, "9": 9}',
  longArray: JSON.stringify(Array.from({ length: 23 }, (_, i) => ({ i, tag: i % 3 === 0 ? "fizz" : "n" }))),
  nested: `${"[".repeat(40)}{"deep": [1, {"z": 0, "a": 1}]}${"]".repeat(40)}`,
  emptyContainers: '{"a": {}, "b": [], "c": [{}, []], "d": {"e": {}}}',
  whitespace: ' \r\n\t{ "a" :\r\n [ 1 ,2 ] , "b" : { } }\n\n',
  recordsArray:
    '[{"id": 2, "name": "b", "tags": ["x", "y"]}, {"id": 1, "name": "a", "meta": {"z": 1, "a": 2}}, {"id": 3, "name": "c"}]',
};

const jsonlFixtures = {
  ...Object.fromEntries(samples.filter((sample) => sample.stream).map((sample) => [sample.id, sample.json])),
  mixed: '{"a":1}\n[2,[3]]\n"just a string"\n42\ntrue\nfalse\nnull\n',
  blankAndCrlf: '\n\r\n  \t\r\n{"a":1}\r\n\r\n \n7\r\n\n',
  noTrailingNewline: '{"a":1}\n12345678901234567890',
  numbers: '{"big":12345678901234567890,"small":1.10,"negZero":-0,"exp":1E+2}\n[1.10,-0,1e2]\n',
  reorderedKeys: '{"z":1,"a":{"d":4,"c":3},"10":0,"2":0,"caf\\u00e9":"\\u00e9"}\n{"b":1,"a":2}\n',
  empty: "",
  onlyBlank: "\n \r\n\t\n",
};

const invalidJsonl = {
  twoOnOneLine: '{"a":1}\n{"b":2} {"c":3}\n',
  multiLineRecord: '{"a":1}\n{"b":\n2}\n',
  newlineInString: '{"a":"x\n"}\n',
  badFourthLine: '{"a":1}\r\n\r\n{"b":2}\r\n{"c":tru}\r\n',
  incompleteLast: '{"a":1}\n{"b":[1,2',
  strayBracket: "]\n",
  loneCrBetween: '{"a":1}\r{"b":2}\n',
  trailingComma: '{"a":1}\n\n{"b":2,}\n',
};

const invalidJson = {
  trailingComma: '{"a": 1,}',
  trailingArrayComma: "[1, 2,]",
  unclosed: "[1, 2",
  missingColon: '{"a" 1}',
  badHex: '"\\u12G4"',
  badEscape: '"\\x"',
  badLiteral: "[tru]",
  longLiteral: "nullified",
  leadingZero: "01",
  rawTab: '{"a": "x\ty"}',
  empty: "",
  blank: "  \n ",
  twoValues: "{} []",
  lonelyMinus: "-",
  badFraction: "1.",
  unterminated: '{"a": "open',
  multiLine: '{\n  "a": [1, 2],\n  "b": [1, 2,]\n}',
  multiLineKey: '{\n  "a": 1,\n  b: 2\n}',
  controlInKey: '{"a\u0001": 1}',
  afterValue: '{"a": 1} x',
  singleQuotes: "{'a': 1}",
};

const gronFixtures = {
  outOfOrder: 'json = {}\njson.b = 2\njson.a = {}\njson.a.y = "y"\njson.c = []\njson.c[1] = true\njson.a.x = 1.10\njson.c[0] = 12345678901234567890',
  sparse: "json = []\njson[3] = 1",
  replaced: 'json = {}\njson.a = 1\njson.b = 2\njson.a = "again"',
  semicolons: 'json = {};\njson.a = [];\njson.a[0] = "x";\n',
  crlf: 'json = {}\r\njson["two words"] = 2\r\njson.n = -0.0\r\n',
  inline: 'json = {"a": [1, 2.50, {"b": null}], "c": "\\u00e9"}',
  inlineDuplicate: 'json = {"a": 1, "a": 2}',
  bracketKeys: 'json = {}\njson["a\\/b"] = 1\njson["\\u00e9"] = 2\njson[ "c" ] = 3\njson["é"] = 4',
  spacedAssignments: "  json   =   {}  \n\tjson.a =  1",
  bom: "﻿json = 1",
  rootTwice: "json = 1\njson = [2]",
  noRoot: 'json.a = 1',
  notGron: "hello world",
  badValue: "json = {}\njson.a = tru",
  leadingZeroIndex: "json = []\njson[01] = 1",
  unclosedBracket: 'json = {}\njson["a = 1',
  numberKey: "json = {}\njson[1.5] = 1",
  arrayKey: 'json = []\njson.a = 1',
  objectIndex: "json = {}\njson[0] = 1",
  missingParent: "json = {}\njson.a.b = 1",
  scalarParent: "json = {}\njson.a = 1\njson.a.b = 2",
  hugeIndex: "json = []\njson[4294967295] = 1",
  emptyValue: "json = {}\njson.a =",
  nothing: "",
  onlyBlank: "\n  \n",
  badPath: "json = {}\njson.1a = 1",
  junkAfterPath: "json = {}\njson.a b = 1",
  // Filtered gron (grep or search output): missing parents, the root included, are synthesized.
  filteredDeep: 'json.a.b[2].c = "x"\njson.a.b[4] = 1\njson.a.d = true',
  filteredRootArray: "json[1].id = 7\njson[3].id = 9",
  filteredReopen: "json.a.x = 1\njson.b = 2\njson.a.y = 3",
  filteredIntoExplicit: 'json = {}\njson.a = {}\njson.a.k = 1\njson.b.c = 2\njson.a.z = 3',
  filteredMissingInFull: "json = {}\njson.x = 1\njson.a.b = 2",
  filteredIndexBack: "json.a[3] = 1\njson.a[1] = 2",
  filteredScalarParent: "json.a = 1\njson.a.b = 2",
  filteredKeyOnArray: "json.a[0] = 1\njson.a.b = 2",
  filteredIndexOnObject: "json.a.b = 1\njson.a[0] = 2",
  filteredScalarRoot: "json = 1\njson.a = 2",
};

// ---------------------------------------------------------------------------------------------------------------
// Cases

const base = {
  runner: "gronify",
  term: "",
  regex: false,
  caseSensitive: false,
  invert: false,
  count: false,
  maxCount: null,
  sort: false,
  limit: null,
  stream: false,
  pretty: false,
};

/** @type {Array<{name: string, input: string, settings: object}>} */
const cases = [];
const add = (name, input, settings) => cases.push({ name, input, settings: { ...base, file: "input.json", ...settings } });

for (const [id, json] of Object.entries({ ...jsonFixtures, ...invalidJson })) {
  add(`flatten/${id}`, json, { mode: "flatten" });
  add(`flatten-sort/${id}`, json, { mode: "flatten", sort: true });
}
for (const [id, json] of Object.entries(jsonFixtures)) {
  for (const limit of [1, 3, 7]) {
    add(`flatten-limit-${limit}/${id}`, json, { mode: "flatten", limit });
    add(`flatten-sort-limit-${limit}/${id}`, json, { mode: "flatten", sort: true, limit });
  }
}
// A cap reached before invalid JSON stops reading, so the error is never seen.
add("flatten-limit/stops-before-error", "[1, 2, 3, oops", { mode: "flatten", limit: 2 });
add("flatten-sort-limit/stops-before-error", "[1, 2, 3, oops", { mode: "flatten", sort: true, limit: 2 });
add("flatten-limit/last-line", "[1, 2]", { mode: "flatten", limit: 3 });
add("flatten-limit/scalar", "7", { mode: "flatten", limit: 1 });

// JSON Lines (--stream) flatten cases, valid and invalid, plus caps and sorting.
for (const [id, jsonl] of Object.entries({ ...jsonlFixtures, ...invalidJsonl })) {
  add(`flatten-stream/${id}`, jsonl, { mode: "flatten", file: "input.jsonl", stream: true });
  add(`flatten-stream-sort/${id}`, jsonl, { mode: "flatten", file: "input.jsonl", stream: true, sort: true });
}
for (const [id, jsonl] of Object.entries(jsonlFixtures)) {
  for (const limit of [1, 3, 7]) {
    add(`flatten-stream-limit-${limit}/${id}`, jsonl, { mode: "flatten", file: "input.jsonl", stream: true, limit });
    add(`flatten-stream-sort-limit-${limit}/${id}`, jsonl, { mode: "flatten", file: "input.jsonl", stream: true, sort: true, limit });
  }
}
add("flatten-stream-limit/stops-before-error", '{"a":1}\n{"a":2}\noops\n', { mode: "flatten", file: "input.jsonl", stream: true, limit: 3 });
add("flatten-stream-sort-limit/stops-before-error", '{"b":1,"a":2}\noops\n', { mode: "flatten", file: "input.jsonl", stream: true, sort: true, limit: 3 });
// Without --stream, JSON Lines fails at line 2 with the --stream tip.
add("flatten-no-stream/jsonl", '{"a":1}\n{"b":2}\n', { mode: "flatten", file: "input.jsonl" });

const searchVariants = [
  {},
  { regex: true },
  { caseSensitive: true },
  { invert: true },
  { count: true },
  { maxCount: 2 },
  { sort: true },
  { sort: true, maxCount: 2 },
  { invert: true, maxCount: 3 },
  { count: true, maxCount: 2 },
  { count: true, sort: true },
  { regex: true, caseSensitive: true, invert: true, sort: true },
];
for (const sample of samples) {
  searchVariants.forEach((variant, index) =>
    add(`search-${index}/${sample.id}`, sample.json, {
      mode: "search",
      file: sample.file,
      term: sample.term,
      stream: Boolean(sample.stream),
      ...variant,
    }),
  );
}
const searchTerms = {
  regexDigits: { term: "\\d{4}", regex: true },
  regexAnchored: { term: "^json\\.entries\\[\\d+\\]\\.id = ", regex: true },
  regexInvalid: { term: "(", regex: true },
  regexInvalidCount: { term: "[", regex: true, count: true },
  upperCase: { term: "IMAGE" },
  upperCaseSensitive: { term: "IMAGE", caseSensitive: true },
  dash: { term: "-250" },
  dashRegex: { term: "-\\d+", regex: true },
  noMatch: { term: "definitely-not-here" },
  noMatchCount: { term: "definitely-not-here", count: true },
  quote: { term: "it's" },
  spaces: { term: "card was" },
  unicodeFold: { term: "É" },
  unicodeExact: { term: "é", caseSensitive: true },
  bigInt: { term: "12345678901234567890" },
  decimal: { term: "1.10" },
  regexBigInt: { term: "= \\d{17,}$", regex: true },
};
for (const [id, settings] of Object.entries(searchTerms)) {
  for (const sample of samples) {
    add(`search-${id}/${sample.id}`, sample.json, {
      mode: "search",
      file: sample.file,
      stream: Boolean(sample.stream),
      ...settings,
    });
  }
  add(`search-${id}/unicode`, jsonFixtures.unicode, { mode: "search", ...settings });
}
for (const [id, json] of Object.entries(invalidJson)) {
  add(`search/${id}`, json, { mode: "search", term: "a" });
  add(`search-regex/${id}`, json, { mode: "search", term: "a", regex: true });
}
for (const [id, jsonl] of Object.entries(invalidJsonl)) {
  add(`search-stream/${id}`, jsonl, { mode: "search", file: "input.jsonl", stream: true, term: "a" });
  add(`search-stream-regex/${id}`, jsonl, { mode: "search", file: "input.jsonl", stream: true, term: "a", regex: true });
}
add("search-m/stops-before-error", '[{"a": 1}, {"a": 2}, oops', { mode: "search", term: "a", maxCount: 1 });
add("search-sort-m/records", jsonFixtures.recordsArray, { mode: "search", term: "id", sort: true, maxCount: 2 });
add("search-stream-m/stops-before-error", '{"a":1}\n{"a":2}\noops\n', { mode: "search", file: "input.jsonl", stream: true, term: "a", maxCount: 1 });
add("search-stream-sort-m/stops-before-error", '{"b":1,"a":2}\n{"a":3}\noops\n', { mode: "search", file: "input.jsonl", stream: true, sort: true, term: "a", maxCount: 1 });
add("search-no-stream/jsonl", '{"a":1}\n{"b":2}\n', { mode: "search", file: "input.jsonl", term: "a" });

const gronInputs = { ...gronFixtures };
for (const [id, json] of Object.entries(jsonFixtures)) {
  gronInputs[`flattened-${id}`] = gron.stdoutOf(gron.flatten(json));
  gronInputs[`sorted-${id}`] = gron.stdoutOf(gron.flatten(json, { sort: true }));
}
for (const [id, jsonl] of Object.entries(jsonlFixtures)) {
  gronInputs[`flattened-stream-${id}`] = gron.stdoutOf(gron.flatten(jsonl, { stream: true }));
  gronInputs[`sorted-stream-${id}`] = gron.stdoutOf(gron.flatten(jsonl, { stream: true, sort: true }));
}
// What `gronify search file term | gronify unflatten` sees: only the matching lines.
for (const sample of samples) {
  gronInputs[`searched-${sample.id}`] = gron.stdoutOf(gron.search(sample.json, { term: sample.term, stream: Boolean(sample.stream) }));
  gronInputs[`searched-sorted-${sample.id}`] = gron.stdoutOf(gron.search(sample.json, { term: sample.term, sort: true, stream: Boolean(sample.stream) }));
}
for (const [id, text] of Object.entries(gronInputs)) {
  add(`unflatten/${id}`, text, { mode: "unflatten", file: "input.gron" });
  add(`unflatten-pretty/${id}`, text, { mode: "unflatten", file: "input.gron", pretty: true });
}

// ---------------------------------------------------------------------------------------------------------------
// Running

/** What the engine prints: `{ stdout, stderr, failed }`. */
function runEngine({ input, settings }) {
  if (settings.mode === "unflatten") {
    const result = ungron.unflatten(input, { pretty: settings.pretty });
    return { stdout: result.output, stderr: result.messages.join("\n"), failed: result.error !== null };
  }
  const result =
    settings.mode === "flatten"
      ? gron.flatten(input, { sort: settings.sort, limit: settings.limit, stream: settings.stream })
      : gron.search(input, settings);
  return { stdout: gron.stdoutOf(result), stderr: result.messages.join("\n"), failed: result.error !== null };
}

let workDir = null;

/** What the CLI prints for the same input and the arguments the command bar shows. */
function runCli(testCase) {
  workDir ??= mkdtempSync(join(tmpdir(), "gronify-playground-"));
  writeFileSync(join(workDir, testCase.settings.file), testCase.input);
  const result = spawnSync(process.execPath, [cliPath, "--no-color", ...commandArguments(testCase.settings)], {
    cwd: workDir,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { stdout: result.stdout, stderr: result.stderr.trimEnd(), failed: result.status !== 0 };
}

function compare(name, expected, actual, failures) {
  const problems = [];
  if (expected.failed !== actual.failed) problems.push(`failed: expected ${expected.failed}, got ${actual.failed}`);
  if (expected.stderr !== actual.stderr) problems.push(`stderr:\n  expected ${JSON.stringify(expected.stderr)}\n  got      ${JSON.stringify(actual.stderr)}`);
  if (!expected.failed && expected.stdout !== actual.stdout) {
    problems.push(`stdout:\n  expected ${JSON.stringify(expected.stdout.slice(0, 600))}\n  got      ${JSON.stringify(actual.stdout.slice(0, 600))}`);
  }
  if (problems.length > 0) failures.push(`${name}\n  ${problems.join("\n  ")}`);
}

// Seeded random documents for the live comparison.
function* randomCases(count) {
  let seed = 0x9e3779b9;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const pick = (items) => items[Math.floor(random() * items.length)];
  const keys = ["a", "B", "_id", "$ref", "two words", "", "é", "caf\\u00e9", "a.b", "1", "10", "zz", "quote\\\"d", "tab\\t"];
  const scalars = ["0", "-0", "1.10", "12345678901234567890", "1e3", "-2.5E-7", "true", "false", "null", '"x"', '"\\/"', '"\\ud83d\\ude00"', '"é"', '"line\\nbreak"', '""'];
  const space = () => pick(["", "", " ", "\n", "\t ", "\r\n  "]);
  const value = (depth) => {
    const roll = random();
    if (depth > 4 || roll < 0.45) return pick(scalars);
    const size = Math.floor(random() * 4);
    if (roll < 0.7) return `[${space()}${Array.from({ length: size }, () => value(depth + 1)).join(`,${space()}`)}${space()}]`;
    return `{${space()}${Array.from({ length: size }, () => `"${pick(keys)}"${space()}:${space()}${value(depth + 1)}`).join(`,${space()}`)}${space()}}`;
  };
  for (let i = 0; i < count; i += 1) {
    const mode = pick(["flatten", "search", "unflatten"]);
    const stream = mode !== "unflatten" && random() < 0.25;
    const inlineSpace = () => pick(["", "", " ", "\t "]);
    const inlineValue = (depth) => {
      const roll = random();
      if (depth > 3 || roll < 0.45) return pick(scalars);
      const size = Math.floor(random() * 4);
      if (roll < 0.7) return `[${inlineSpace()}${Array.from({ length: size }, () => inlineValue(depth + 1)).join(`,${inlineSpace()}`)}${inlineSpace()}]`;
      return `{${inlineSpace()}${Array.from({ length: size }, () => `"${pick(keys)}"${inlineSpace()}:${inlineSpace()}${inlineValue(depth + 1)}`).join(`,${inlineSpace()}`)}${inlineSpace()}}`;
    };
    let json = stream
      ? Array.from({ length: Math.floor(random() * 5) }, () => (random() < 0.2 ? "" : `${inlineSpace()}${inlineValue(0)}${inlineSpace()}`)).join(pick(["\n", "\r\n"]))
      : `${space()}${value(0)}${space()}`;
    // Break about one in eight documents.
    if (json.length > 0 && random() < 0.125) {
      const at = Math.floor(random() * json.length);
      json = json.slice(0, at) + pick([",", "]", "}", "x", '"', ":", "\\", "\n"]) + json.slice(at + 1);
    }
    const settings = {
      mode,
      file: mode === "unflatten" ? "input.gron" : stream ? "input.jsonl" : "input.json",
      term: pick(["a", "1", "\\d", "E", "é", "null", "[0]"]),
      regex: random() < 0.3,
      caseSensitive: random() < 0.3,
      invert: random() < 0.2,
      count: random() < 0.2,
      maxCount: random() < 0.3 ? 1 + Math.floor(random() * 4) : null,
      sort: random() < 0.4,
      limit: random() < 0.3 ? 1 + Math.floor(random() * 6) : null,
      stream,
      pretty: random() < 0.5,
    };
    let input = json;
    if (mode === "unflatten") {
      input = gron.stdoutOf(gron.flatten(json, { sort: settings.sort })) || json;
      // Half the time keep a random subset of the lines, as `grep` would, and sometimes shuffle a pair.
      if (random() < 0.5) {
        const lines = input.split("\n").filter(() => random() < 0.6);
        if (lines.length > 1 && random() < 0.3) {
          const at = Math.floor(random() * (lines.length - 1));
          [lines[at], lines[at + 1]] = [lines[at + 1], lines[at]];
        }
        input = lines.join("\n");
      }
    }
    yield { name: `random/${i}`, input, settings: { ...base, ...settings } };
  }
}

const failures = [];
let checked = 0;

// Fixed expectations that hold whatever the CLI does, so a bad golden file cannot hide them.
const ledgerLines = gron.flatten(samples.find((sample) => sample.id === "ledger").json).lines;
for (const line of ["json.entries[0].id = 12345678901234567890", "json.entries[0].amount = 1.10", "json.openingBalance = 1.10"]) {
  checked += 1;
  if (!ledgerLines.includes(line)) failures.push(`ledger flatten is missing "${line}"`);
}
// Flattening the unflattened output gives the same lines again.
for (const [id, json] of Object.entries(jsonFixtures)) {
  checked += 1;
  const lines = gron.stdoutOf(gron.flatten(json));
  const roundTrip = ungron.unflatten(lines);
  if (roundTrip.error !== null) failures.push(`${id}: round trip failed: ${roundTrip.error}`);
  else if (gron.stdoutOf(gron.flatten(roundTrip.output)) !== lines) failures.push(`${id}: round trip changed the document`);
}
for (const [id, jsonl] of Object.entries(jsonlFixtures)) {
  checked += 1;
  const lines = gron.stdoutOf(gron.flatten(jsonl, { stream: true }));
  const roundTrip = ungron.unflatten(lines);
  if (roundTrip.error !== null) failures.push(`jsonl/${id}: round trip failed: ${roundTrip.error}`);
  else if (gron.stdoutOf(gron.flatten(roundTrip.output)) !== lines) failures.push(`jsonl/${id}: round trip changed the document`);
}
checked += 1;
if (!ungron.unflatten(gron.stdoutOf(gron.flatten(samples.find((s) => s.id === "ledger").json))).output.includes('"id":12345678901234567890,"amount":1.10')) {
  failures.push("ledger round trip did not keep 12345678901234567890 and 1.10 as written");
}

// Adversarial input. These are playground limits, not CLI behavior, so they are checked against the engine alone:
// each must come back as a clean error result quickly, never as a thrown RangeError or a hung tab.
const deepArray = `${"[".repeat(20000)}${"]".repeat(20000)}`;
const deepObject = `${'{"a":'.repeat(8000)}1${"}".repeat(8000)}`;
const adversarial = [
  ["flatten deep array", () => gron.flatten(deepArray)],
  ["flatten --sort deep array", () => gron.flatten(deepArray, { sort: true })],
  ["flatten --sort deep object", () => gron.flatten(deepObject, { sort: true })],
  ["search deep array", () => gron.search(deepArray, { term: "x" })],
  ["search --regex -v deep array", () => gron.search(deepArray, { term: "\\]$", regex: true, invert: true })],
  ["search --count deep object", () => gron.search(deepObject, { term: "a", count: true })],
  ["unflatten sparse index", () => ungron.unflatten("json = []\njson[4294967294] = 1")],
];
for (const [name, run] of adversarial) {
  checked += 1;
  const started = performance.now();
  let result;
  try {
    result = run();
  } catch (error) {
    failures.push(`${name}: threw ${error?.name}: ${error?.message}`);
    continue;
  }
  const elapsed = performance.now() - started;
  if (result.error === null || !result.limitExceeded) {
    failures.push(`${name}: expected the playground output limit error, got ${JSON.stringify(result.error)}`);
  } else if (!/run 'gronify (flatten|search|unflatten)' in a terminal instead/.test(result.error)) {
    failures.push(`${name}: the limit error does not point to the CLI: ${result.error}`);
  }
  if (elapsed > 3000) failures.push(`${name}: took ${Math.round(elapsed)} ms`);
}
// The output stays exact up to the limit: a deep document that fits is flattened in full.
checked += 1;
const fits = gron.flatten(`${"[".repeat(1000)}${"]".repeat(1000)}`);
if (fits.error !== null || fits.lines.length !== 1000 || fits.lines[999] !== `json${"[0]".repeat(999)} = []`) {
  failures.push(`a 1,000-deep array that fits the limit was not flattened in full: ${fits.error}`);
}
// A long malformed gron line full of "=" must not backtrack quadratically while choosing its error message.
checked += 1;
{
  const started = performance.now();
  const result = ungron.unflatten(`json = {}\njson.a[ ${"= ".repeat(100000)}`);
  const elapsed = performance.now() - started;
  if (result.error !== "line 2: unclosed bracket property") failures.push(`long malformed line: got ${result.error}`);
  if (elapsed > 1000) failures.push(`long malformed line: took ${Math.round(elapsed)} ms`);
}

if (cliPath === null) {
  let golden;
  try {
    golden = JSON.parse(readFileSync(goldenPath, "utf8"));
  } catch (error) {
    console.error(`Cannot read ${goldenPath}: ${error.message}`);
    process.exit(2);
  }
  for (const testCase of cases) {
    const expected = golden[testCase.name];
    if (expected === undefined) {
      failures.push(`${testCase.name}: no golden output (re-record with --cli <path> --write-golden)`);
      continue;
    }
    checked += 1;
    compare(testCase.name, expected, runEngine(testCase), failures);
  }
} else {
  const recorded = {};
  try {
    for (const testCase of [...cases, ...randomCases(randomCount)]) {
      const expected = runCli(testCase);
      if (!testCase.name.startsWith("random/")) recorded[testCase.name] = expected;
      checked += 1;
      compare(testCase.name, expected, runEngine(testCase), failures);
    }
  } finally {
    if (workDir !== null) rmSync(workDir, { recursive: true, force: true });
  }
  if (writeGolden) {
    writeFileSync(goldenPath, `${JSON.stringify(recorded, null, 1)}\n`);
    console.log(`Wrote ${Object.keys(recorded).length} cases to ${goldenPath}`);
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${checked} checks failed:\n`);
  console.error(failures.slice(0, 25).join("\n\n"));
  if (failures.length > 25) console.error(`\n... and ${failures.length - 25} more`);
  process.exit(1);
}
console.log(`Playground engine matches the CLI: ${checked} checks passed${cliPath === null ? " (golden file)" : " (live CLI)"}.`);
