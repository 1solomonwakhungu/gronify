import { writeFileSync } from "node:fs";

/**
 * Write content to a file
 * @param filePath Path to the file
 * @param content Content to write
 */
export function writeFile(filePath: string, content: string): void {
  try {
    writeFileSync(filePath, content, "utf8");
  } catch (error: any) {
    throw new Error(`Failed to write to ${filePath}: ${error.message}`);
  }
}

/**
 * Write to file or stdout
 * @param filePath Path to file or undefined for stdout
 * @param content Content to write
 */
export function writeOutput(filePath: string | undefined, content: string): void {
  if (!filePath) {
    console.log(content);
  } else {
    writeFile(filePath, content);
  }
}

