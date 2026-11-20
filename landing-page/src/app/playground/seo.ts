import { validatePageSeo } from "../guides/validate";

/** Search copy for /playground, held to the same length limits as a guide. */
export const playgroundTitle = "Flatten JSON Online: grep JSON and gron in your browser";

export const playgroundDescription =
  "Flatten JSON online into greppable gron lines, grep JSON by text or regex, and unflatten it back. Runs in your browser with the same output as the Gronify CLI.";

validatePageSeo("/playground", playgroundTitle, playgroundDescription);
