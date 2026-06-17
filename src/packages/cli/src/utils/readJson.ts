import { readFileSync } from "node:fs";

/**
 * Read and parse a JSON file
 * @param filePath Path to the JSON file or "-" for stdin
 * @returns Parsed JSON data
 */
export function readJson(filePath: string): any {
  try {
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(`File not found: ${filePath}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

/**
 * Read JSON from stdin synchronously
 * @returns Parsed JSON data
 */
export function readJsonFromStdin(): any {
  const fs = require("node:fs");
  try {
    const content = fs.readFileSync(0, "utf8"); // fd 0 is stdin
    return JSON.parse(content);
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON from stdin: ${error.message}`);
    }
    throw new Error(`Failed to read from stdin: ${error.message}`);
  }
}

/**
 * Read JSON from file or stdin
 * @param filePath Path to file or "-" for stdin
 * @returns Parsed JSON data
 */
export function readJsonInput(filePath?: string): any {
  if (!filePath || filePath === "-") {
    return readJsonFromStdin();
  }
  return readJson(filePath);
}

