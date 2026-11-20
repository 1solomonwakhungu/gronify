import type { Guide, TerminalLine } from "./types";

/** Output lines shown under the command on a guide's share image. */
const maxOutputLines = 2;

/**
 * The terminal snippet for a guide's share image: the first command in the
 * guide that runs `gronify`, followed by up to two of its output lines. A guide
 * often opens with `cat file.json`, which says nothing about the tool, so plain
 * shell commands are skipped. When no transcript runs gronify, the guide's
 * first command is used; a guide with no transcript gets no snippet.
 */
export function guideShareSnippet(guide: Guide): TerminalLine[] {
  const transcripts = guide.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.kind === "terminal" ? [block.lines] : [],
    ),
  );

  const isGronify = (line: TerminalLine) =>
    line.kind === "command" && /\bgronify\b/.test(line.text);
  const isCommand = (line: TerminalLine) => line.kind === "command";

  for (const matches of [isGronify, isCommand]) {
    for (const lines of transcripts) {
      const start = lines.findIndex(matches);
      if (start === -1) continue;

      const output: TerminalLine[] = [];
      for (const line of lines.slice(start + 1)) {
        if (line.kind === "command" || output.length === maxOutputLines) break;
        output.push(line);
      }
      return [lines[start], ...output];
    }
  }

  return [];
}
