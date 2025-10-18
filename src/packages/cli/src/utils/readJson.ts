import { readFile } from "node:fs/promises";
import { stdin } from "node:process";

/**
 * Read JSON from a file or stdin
 * @param input - File path, '-' for stdin, or undefined for stdin
 * @returns Parsed JSON data
 */
export async function readJson(input?: string): Promise<any> {
  let content: string;

  if (!input || input === "-") {
    // Read from stdin
    content = await readStdin();
  } else {
    // Read from file
    content = await readFile(input, "utf-8");
  }

  try {
    return JSON.parse(content);
  } catch (error: any) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

/**
 * Read all data from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";

    stdin.setEncoding("utf-8");

    stdin.on("data", (chunk) => {
      data += chunk;
    });

    stdin.on("end", () => {
      resolve(data);
    });

    stdin.on("error", (error) => {
      reject(error);
    });
  });
}

