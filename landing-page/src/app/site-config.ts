export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://gronify.vercel.app"
).replace(/\/+$/, "");

export const repositoryUrl = "https://github.com/1solomonwakhungu/gronify";
export const npmPackageUrl = "https://www.npmjs.com/package/gronify";
export const homebrewTapUrl =
  "https://github.com/1solomonwakhungu/homebrew-tap";
export const skillsUrl =
  "https://skills.sh/1solomonwakhungu/gronify/gronify-json-flatten-search";

export const cliVersion = "1.3.2";
export const nodeRequirement = "20 or newer";
export const npmBuildRequirement = "10 or newer";
export const lastReleaseIsoDate = "2026-11-20";
/** Date of the last change to the home page copy. Bump it with the copy; the sitemap reads it. */
export const homeUpdatedIsoDate = "2026-11-20";

/** Date of the last change to the /playground page or its engine. The sitemap reads it. */
export const playgroundUpdatedIsoDate = "2026-11-20";

/**
 * IndexNow key (https://www.indexnow.org). `public/<key>.txt` must contain
 * exactly this value; `scripts/submit-indexnow.mjs` reads both and refuses to
 * submit when they differ. To rotate it, replace this value and rename and
 * rewrite the key file in the same commit.
 */
export const indexNowKey = "fcf9ec5a77e9058c6aeb871432ab03e8";
