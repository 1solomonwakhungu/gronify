export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://gronify.vercel.app"
).replace(/\/+$/, "");

export const repositoryUrl = "https://github.com/1solomonwakhungu/gronify";
export const npmPackageUrl = "https://www.npmjs.com/package/gronify";
export const homebrewTapUrl =
  "https://github.com/1solomonwakhungu/homebrew-tap";
export const skillsUrl =
  "https://skills.sh/1solomonwakhungu/gronify/gronify-json-flatten-search";

export const cliVersion = "1.3.1";
export const nodeRequirement = "20 or newer";
export const npmBuildRequirement = "10 or newer";
export const lastReleaseIsoDate = "2026-11-05";
/** Date of the last change to the home page copy. Bump it with the copy; the sitemap reads it. */
export const homeUpdatedIsoDate = "2026-11-12";
