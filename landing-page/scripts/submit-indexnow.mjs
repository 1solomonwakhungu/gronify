#!/usr/bin/env node
// Submits every URL in the site's sitemap to IndexNow (https://www.indexnow.org),
// which shares them with Bing, Yandex, Seznam, Naver, and the other
// participating engines.
//
//   node scripts/submit-indexnow.mjs --dry-run
//   node scripts/submit-indexnow.mjs
//
// Run it from `landing-page/` after a deploy. See README.md ("IndexNow").

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteConfigPath = path.join(packageDir, "src/app/site-config.ts");
const builtSitemapPath = path.join(packageDir, ".next/server/app/sitemap.xml.body");
const defaultEndpoint = "https://api.indexnow.org/indexnow";
// The protocol accepts at most 10,000 URLs per request.
const maxUrlsPerRequest = 10_000;
const requestTimeoutMs = 30_000;
const userAgent = "gronify-landing-indexnow";

const usage = `Usage: node scripts/submit-indexnow.mjs [options]

Options:
  --dry-run          Print what would be submitted; send nothing to IndexNow.
  --sitemap <src>    Sitemap file path or URL. Default: the built sitemap
                     (.next/server/app/sitemap.xml.body) when it exists,
                     otherwise <site>/sitemap.xml.
  --site <url>       Site origin. Default: NEXT_PUBLIC_SITE_URL, then the
                     default in src/app/site-config.ts.
  --endpoint <url>   IndexNow endpoint. Default: ${defaultEndpoint}
  --skip-key-check   Do not confirm the live key file before submitting.
  -h, --help         Show this help.`;

class UsageError extends Error {}

function parseCli() {
  try {
    return parseArgs({
      options: {
        "dry-run": { type: "boolean", default: false },
        sitemap: { type: "string" },
        site: { type: "string" },
        endpoint: { type: "string", default: defaultEndpoint },
        "skip-key-check": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw new UsageError(error.message);
  }
}

/** Reads `indexNowKey` and the default site URL from site-config.ts. */
async function readSiteConfig() {
  const source = await readFile(siteConfigPath, "utf8");
  const key = source.match(/export const indexNowKey\s*=\s*"([^"]*)"/)?.[1];
  const defaultSite = source.match(
    /process\.env\.NEXT_PUBLIC_SITE_URL\s*\?\?\s*"([^"]+)"/,
  )?.[1];
  if (!key) throw new Error(`indexNowKey not found in ${siteConfigPath}`);
  if (!defaultSite) throw new Error(`default site URL not found in ${siteConfigPath}`);
  return { key, defaultSite };
}

/** Checks the key format and that public/<key>.txt holds exactly the key. */
async function checkKeyFile(key) {
  // The protocol allows 8 to 128 characters: a-z, A-Z, 0-9, and "-".
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
    throw new Error(`indexNowKey "${key}" must be 8 to 128 characters of a-z, A-Z, 0-9, or "-"`);
  }
  const keyFilePath = path.join(packageDir, "public", `${key}.txt`);
  if (!existsSync(keyFilePath)) {
    throw new Error(`key file ${path.relative(packageDir, keyFilePath)} is missing`);
  }
  const contents = (await readFile(keyFilePath, "utf8")).trim();
  if (contents !== key) {
    throw new Error(`${path.relative(packageDir, keyFilePath)} does not contain the key from site-config.ts`);
  }
}

function parseOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`${label} "${value}" is not a URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UsageError(`${label} "${value}" must be http or https`);
  }
  return url.origin;
}

async function fetchText(url, what) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    throw new Error(`could not fetch ${what} ${url}: ${error.cause?.message ?? error.message}`);
  }
  if (!response.ok) {
    throw new Error(`could not fetch ${what} ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function loadSitemap(source) {
  if (/^https?:\/\//.test(source)) return fetchText(source, "sitemap");
  try {
    return await readFile(path.resolve(source), "utf8");
  } catch (error) {
    throw new Error(`could not read sitemap ${source}: ${error.message}`);
  }
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The unique `<loc>` URLs of a urlset sitemap, in document order. */
function sitemapUrls(xml) {
  if (/<sitemapindex[\s>]/.test(xml)) {
    throw new Error("sitemap index files are not supported; pass a urlset sitemap");
  }
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) =>
    decodeXml(match[1]),
  );
  return [...new Set(urls)];
}

function chunk(items, size) {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** IndexNow fetches keyLocation itself, so a missing key file wastes the submission. */
async function confirmLiveKey(keyLocation, key) {
  const body = (await fetchText(keyLocation, "key file")).trim();
  if (body !== key) {
    throw new Error(`${keyLocation} is live but does not contain the key; deploy the key file first`);
  }
}

const responseHints = {
  400: "bad request: the payload is malformed",
  403: "forbidden: the key is not valid or the key file could not be read",
  422: "unprocessable: a URL does not belong to the host, or the key does not match the protocol",
  429: "too many requests: wait before submitting again",
};

async function submit(endpoint, payload) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": userAgent,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    throw new Error(`IndexNow request failed: ${error.cause?.message ?? error.message}`);
  }
  // 200 means accepted; 202 means accepted while the key is being validated.
  if (response.status === 200 || response.status === 202) return response.status;

  const detail = (await response.text().catch(() => "")).trim().slice(0, 500);
  const hint = responseHints[response.status] ?? "unexpected response";
  throw new Error(`IndexNow returned HTTP ${response.status} (${hint})${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const options = parseCli();
  if (options.help) {
    console.log(usage);
    return;
  }

  const { key, defaultSite } = await readSiteConfig();
  await checkKeyFile(key);

  const origin = parseOrigin(
    options.site ?? process.env.NEXT_PUBLIC_SITE_URL ?? defaultSite,
    "--site",
  );
  const endpoint = options.endpoint;
  parseOrigin(endpoint, "--endpoint");
  const sitemapSource =
    options.sitemap ?? (existsSync(builtSitemapPath) ? builtSitemapPath : `${origin}/sitemap.xml`);

  const allUrls = sitemapUrls(await loadSitemap(sitemapSource));
  // IndexNow rejects the whole request when any URL is on another host.
  const urls = allUrls.filter((url) => URL.canParse(url) && new URL(url).origin === origin);
  const skipped = allUrls.filter((url) => !urls.includes(url));

  const host = new URL(origin).host;
  const keyLocation = `${origin}/${key}.txt`;

  console.log(`Sitemap:      ${path.isAbsolute(sitemapSource) ? path.relative(process.cwd(), sitemapSource) : sitemapSource}`);
  console.log(`Host:         ${host}`);
  console.log(`Key location: ${keyLocation}`);
  console.log(`Endpoint:     ${endpoint}`);
  console.log(`URLs:         ${urls.length}`);
  for (const url of skipped) console.warn(`  skipped (not on ${origin}): ${url}`);

  if (urls.length === 0) {
    throw new Error(`the sitemap has no URLs on ${origin}`);
  }

  const batches = chunk(urls, maxUrlsPerRequest).map((urlList) => ({
    host,
    key,
    keyLocation,
    urlList,
  }));

  if (options["dry-run"]) {
    for (const url of urls) console.log(`  ${url}`);
    console.log(`\nDry run: ${batches.length} request(s) not sent. Payload of the first request:`);
    console.log(JSON.stringify(batches[0], null, 2));
    return;
  }

  if (!options["skip-key-check"]) {
    await confirmLiveKey(keyLocation, key);
    console.log("Key file is live.");
  }

  for (const [index, batch] of batches.entries()) {
    const status = await submit(endpoint, batch);
    console.log(`Request ${index + 1}/${batches.length}: HTTP ${status}, ${batch.urlList.length} URL(s) accepted.`);
  }
}

main().catch((error) => {
  console.error(`submit-indexnow: ${error.message}`);
  if (error instanceof UsageError) console.error(`\n${usage}`);
  process.exitCode = 1;
});
