// Builds branding/demo.svg from real Gronify output.
//
// Run from the repository root after building the CLI:
//   (cd src/packages/cli && npm ci && npm run build)
//   node scripts/build-demo-svg.mjs
//
// The script writes the sample JSON files to a temporary directory, runs each demo command against
// src/packages/cli/dist/index.js, and fails if a command errors or prints nothing. Every output line in the SVG
// comes from those runs; nothing is typed in by hand.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const cliEntry = join(repoRoot, "src/packages/cli/dist/index.js");
const outFile = join(repoRoot, "branding/demo.svg");

if (!existsSync(cliEntry)) {
  console.error(
    `Missing ${cliEntry}. Build the CLI first: (cd src/packages/cli && npm ci && npm run build)`,
  );
  process.exit(1);
}

const { version } = JSON.parse(
  readFileSync(join(repoRoot, "src/packages/cli/package.json"), "utf8"),
);

const fixtures = {
  "events.json": {
    events: [
      { id: 1, level: "info", msg: "checkout started" },
      { id: 2, level: "error", msg: "payment declined" },
      { id: 3, level: "warn", msg: "retrying payment" },
      { id: 4, level: "error", msg: "card timeout" },
      { id: 5, level: "info", msg: "fallback provider" },
      { id: 6, level: "error", msg: "fallback failed" },
      { id: 7, level: "error", msg: "order aborted" },
    ],
  },
  "old.json": {
    service: { replicas: 2, image: "checkout:1.4.0", region: "us-east1" },
  },
  "new.json": {
    service: { region: "us-east1", image: "checkout:1.5.0", replicas: 3 },
  },
};

// `ok` lists the exit codes a command may end with; diff exits 1 when the inputs differ.
const commands = [
  { shown: "gronify search events.json --count error", ok: [0] },
  { shown: "gronify search events.json -m 3 error", ok: [0] },
  {
    shown:
      "diff <(gronify flatten --sort old.json) <(gronify flatten --sort new.json)",
    ok: [1],
  },
];

function run(workDir, command) {
  // `gronify` resolves to the freshly built CLI through a shell function, so the command shown is the command run.
  const script = `gronify() { node ${JSON.stringify(cliEntry)} "$@"; }\n${command.shown}`;
  const result = spawnSync("bash", ["-c", script], {
    cwd: workDir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.error) {
    throw new Error(
      `Could not run "${command.shown}": ${result.error.message}`,
    );
  }
  if (!command.ok.includes(result.status)) {
    throw new Error(
      `"${command.shown}" exited ${result.status}\n${result.stderr}`,
    );
  }
  const lines = (s, kind) =>
    s
      .split("\n")
      .filter((line) => line !== "")
      .map((text) => ({ text, kind }));
  const out = [...lines(result.stdout, "out"), ...lines(result.stderr, "note")];
  if (out.length === 0) {
    throw new Error(`"${command.shown}" printed nothing`);
  }
  return out;
}

const workDir = mkdtempSync(join(tmpdir(), "gronify-demo-"));
let transcript;
try {
  for (const [name, data] of Object.entries(fixtures)) {
    writeFileSync(join(workDir, name), `${JSON.stringify(data, null, 2)}\n`);
  }
  transcript = commands.map((command) => ({
    command: command.shown,
    output: run(workDir, command),
  }));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

// Layout. Colors follow DESIGN.md: violet-black canvas, cool white text, indigo accent used only for the prompt.
const colors = {
  canvas: "#0e0d14",
  panel: "#15141d",
  border: "#262534",
  text: "#e6e7f2",
  muted: "#9a9cbd",
  accent: "#8583ff",
  removed: "#f59aa1",
  added: "#7fdcaa",
};
const fontSize = 14;
const charWidth = 8.6; // generous estimate for 14px monospace; the typing mask must cover the full command
const lineHeight = 23;
const padX = 28;
const padTop = 52;
const gapBetweenBlocks = 12;
const width = 800;

// Timeline, in seconds. One loop: type, print, hold, fade, restart.
const loop = 9;
const typeCharsPerSecond = 62;
const pauseAfterCommand = 0.25;
const outputLineStep = 0.12;
const pauseBetweenBlocks = 0.45;
const fadeOutStart = 8.3;
const fadeOutEnd = 8.8;

const escapeXml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const pct = (seconds) => `${((seconds / loop) * 100).toFixed(2)}%`;

function outputColor(line) {
  if (line.kind === "note") return colors.muted;
  if (line.text.startsWith("< ")) return colors.removed;
  if (line.text.startsWith("> ")) return colors.added;
  if (/^\d+(?:,\d+)?[acd]\d+(?:,\d+)?$/.test(line.text) || line.text === "---")
    return colors.muted;
  return colors.text;
}

const keyframes = [];
const body = [];
let y = padTop;
let t = 0.3;
let id = 0;

for (const [blockIndex, block] of transcript.entries()) {
  if (blockIndex > 0) {
    y += gapBetweenBlocks;
    t += pauseBetweenBlocks;
  }

  // Command line: the prompt and text appear at `t`, then a panel-colored mask slides right in steps to "type" it.
  const typeStart = t;
  const typeEnd = typeStart + block.command.length / typeCharsPerSecond;
  const maskX = padX + 2 * charWidth - 1;
  const maskWidth = Math.ceil(block.command.length * charWidth + 12);
  const lineId = `l${id++}`;
  const maskId = `m${id++}`;
  keyframes.push(
    `@keyframes ${lineId}{0%,${pct(typeStart)}{opacity:0}${pct(typeStart + 0.01)},100%{opacity:1}}`,
  );
  keyframes.push(
    `@keyframes ${maskId}{0%,${pct(typeStart)}{transform:translateX(0)}${pct(typeEnd)},100%{transform:translateX(${maskWidth}px)}}`,
  );
  body.push(
    `<g class="a" style="animation-name:${lineId}"><text x="${padX}" y="${y}"><tspan fill="${colors.accent}">$</tspan> <tspan fill="${colors.text}">${escapeXml(block.command)}</tspan></text>` +
      `<rect class="mask" style="animation-name:${maskId};animation-timing-function:steps(${block.command.length},end)" x="${maskX}" y="${y - fontSize - 2}" width="${maskWidth}" height="${lineHeight}" fill="${colors.panel}"/></g>`,
  );
  y += lineHeight;
  t = typeEnd + pauseAfterCommand;

  for (const line of block.output) {
    const outId = `l${id++}`;
    keyframes.push(
      `@keyframes ${outId}{0%,${pct(t)}{opacity:0}${pct(t + 0.08)},100%{opacity:1}}`,
    );
    body.push(
      `<text class="a" style="animation-name:${outId}" x="${padX}" y="${y}" fill="${outputColor(line)}">${escapeXml(line.text)}</text>`,
    );
    y += lineHeight;
    t += outputLineStep;
  }
}

if (t > fadeOutStart - 1) {
  throw new Error(
    `Timeline runs to ${t.toFixed(2)} s, too close to the ${fadeOutStart} s fade-out`,
  );
}

const height = y + 14;
const panelHeight = height - 16;

const description = transcript
  .map((block) =>
    [`$ ${block.command}`, ...block.output.map((line) => line.text)].join("\n"),
  )
  .join("\n\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">Gronify terminal demo: count matches, cap matches with full paths, and compare two JSON files with diff</title>
<desc id="desc">Real output from gronify ${escapeXml(version)}.
${escapeXml(description)}</desc>
<style>
text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:${fontSize}px;white-space:pre}
.a,.mask,.cycle{animation-duration:${loop}s;animation-iteration-count:infinite;animation-fill-mode:both}
.a{animation-timing-function:linear}
.cycle{animation-name:cycle}
@keyframes cycle{0%,${pct(fadeOutStart)}{opacity:1}${pct(fadeOutEnd)},100%{opacity:0}}
${keyframes.join("\n")}
@media (prefers-reduced-motion:reduce){.a,.mask,.cycle{animation:none!important}.mask{display:none}}
</style>
<rect width="${width}" height="${height}" rx="14" fill="${colors.canvas}"/>
<rect x="8" y="8" width="${width - 16}" height="${panelHeight}" rx="12" fill="${colors.panel}" stroke="${colors.border}"/>
<text x="${width - padX}" y="30" text-anchor="end" fill="${colors.muted}" style="font-size:12px">real output · gronify ${escapeXml(version)}</text>
<clipPath id="inside"><rect x="9" y="9" width="${width - 18}" height="${panelHeight - 2}" rx="11"/></clipPath>
<g class="cycle" clip-path="url(#inside)">
${body.join("\n")}
</g>
</svg>
`;

writeFileSync(outFile, svg);
console.log(
  `Wrote ${outFile} (${Buffer.byteLength(svg)} bytes, ${transcript.length} commands, timeline ${t.toFixed(2)} s of ${loop} s)`,
);
