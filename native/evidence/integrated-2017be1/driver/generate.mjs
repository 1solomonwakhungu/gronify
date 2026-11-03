import {createWriteStream} from "node:fs"; import {once} from "node:events";
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


for (const n of [1,10,100,1000]) { const f=`/tmp/gronify-integrated-2017be1-20261103/events-${n}.json`; const matches=await generateArray(f,n*1024*1024,eventRecord,42,false,"timeout"); console.log(JSON.stringify({mib:n,matches,path:f})); }
