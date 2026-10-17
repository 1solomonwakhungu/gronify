import { readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const outputUrl = new URL("../dist/index.js", import.meta.url);
const output = await readFile(outputUrl, "utf8");

if (!output.includes("__GRONIFY_VERSION__")) {
  throw new Error("Version placeholder not found in compiled CLI");
}

await writeFile(
  outputUrl,
  output.replace("__GRONIFY_VERSION__", packageJson.version),
);
