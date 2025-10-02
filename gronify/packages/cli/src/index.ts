#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync, accessSync, constants, writeFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";

const program = new Command();

// Package info (we'll read this from package.json later)
program
  .name("gronify")
  .description("Make big JSON easy to search, inspect, and diff")
  .version("1.0.0");

// Helper function to check if stdin has data
function hasStdinData(): boolean {
  return !process.stdin.isTTY;
}

// Helper function to read stdin and save to temp file
async function readStdinToTempFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    
    process.stdin.on('end', () => {
      try {
        // Create temp file
        const tempDir = tmpdir();
        const tempFile = join(tempDir, `gronify-stdin-${Date.now()}.json`);
        
        // Ensure temp directory exists
        mkdirSync(tempDir, { recursive: true });
        
        // Write stdin data to temp file
        writeFileSync(tempFile, data, 'utf8');
        
        resolve(tempFile);
      } catch (error) {
        reject(error);
      }
    });
    
    process.stdin.on('error', (error) => {
      reject(error);
    });
  });
}

// Helper function to validate file
function validateFile(filePath: string, allowMissing = false): void {
  if (!allowMissing && !existsSync(filePath)) {
    console.error(`Error: File '${filePath}' does not exist`);
    process.exit(1);
  }

  if (existsSync(filePath)) {
    try {
      accessSync(filePath, constants.R_OK);
    } catch (error) {
      console.error(`Error: Cannot read file '${filePath}' - permission denied`);
      process.exit(1);
    }
  }
}

// Helper function to run fastgron
function  runFastgron(args: string[], onError?: (code: number) => void): void {
  const p = spawn("fastgron", args, { stdio: "inherit" });

  p.on("error", (error: any) => {
    if (error.code === "ENOENT") {
      console.error("Error: fastgron not found. Please install it first:");
      console.error("  macOS/Linux: brew install fastgron");
      console.error("  Or visit: https://github.com/adamritter/fastgron");
    } else {
      console.error(`Error running fastgron: ${error.message}`);
    }
    process.exit(1);
  });

  p.on("exit", (code) => {
    if (code !== 0 && onError) {
      onError(code ?? 1);
    } else if (code !== 0) {
      process.exit(code ?? 1);
    }
  });
}

// Flatten command
program
  .command("flatten")
  .description("Convert JSON to gron format")
  .argument("[file]", "JSON file to flatten (or read from stdin if not provided)")
  .action(async (file?: string) => {
    let inputFile: string;
    let isTemporary = false;

    if (!file) {
      // Check if stdin has data
      if (!hasStdinData()) {
        console.error("Error: No input file provided and no data piped to stdin");
        console.error("Usage: gronify flatten <file> OR cat file.json | gronify flatten");
        process.exit(1);
      }

      try {
        // Read from stdin and create temp file
        inputFile = await readStdinToTempFile();
        isTemporary = true;
      } catch (error) {
        console.error("Error reading from stdin:", error);
        process.exit(1);
      }
    } else {
      inputFile = file;
      validateFile(inputFile);
      
      // Warn about non-JSON extensions
      if (![".json", ".jsonl"].includes(extname(inputFile).toLowerCase())) {
        console.warn(`Warning: File '${inputFile}' doesn't have a .json extension`);
      }
    }

    runFastgron([inputFile], (code) => {
      // Clean up temporary file if created
      if (isTemporary) {
        try {
          require('fs').unlinkSync(inputFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      if (code === 1) {
        console.error("This might indicate invalid JSON in the input");
        console.error("Please check that your JSON is valid");
      }
      process.exit(code);
    });
  });

// Unflatten command
program
  .command("unflatten")
  .description("Convert gron format back to JSON")
  .argument("[file]", "Gron file to unflatten (or read from stdin if not provided)")
  .action(async (file?: string) => {
    let inputFile: string;
    let isTemporary = false;

    if (!file) {
      // Check if stdin has data
      if (!hasStdinData()) {
        console.error("Error: No input file provided and no data piped to stdin");
        console.error("Usage: gronify unflatten <file> OR cat file.gron | gronify unflatten");
        process.exit(1);
      }

      try {
        // Read from stdin and create temp file
        inputFile = await readStdinToTempFile();
        isTemporary = true;
      } catch (error) {
        console.error("Error reading from stdin:", error);
        process.exit(1);
      }
    } else {
      inputFile = file;
      validateFile(inputFile);
    }

    runFastgron(["-u", inputFile], (code) => {
      // Clean up temporary file if created
      if (isTemporary) {
        try {
          require('fs').unlinkSync(inputFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      if (code === 1) {
        console.error("This might indicate invalid gron format in the input");
        console.error("Please check that your input is in proper gron format");
      }
      process.exit(code);
    });
  });

// Search command
program
  .command("search")
  .description("Search through flattened JSON paths")
  .argument("<file_or_term>", "JSON file to search OR search term (if using stdin)")
  .argument("[term]", "Search term or regex pattern (required if first arg is file)")
  .option("-r, --regex", "Use regex pattern matching")
  .option("-c, --case-sensitive", "Case sensitive search")
  .option("--count", "Show only the count of matches")
  .action(async (fileOrTerm: string, term: string | undefined, options: {
    regex?: boolean;
    caseSensitive?: boolean;
    count?: boolean;
  }) => {
    let inputFile: string;
    let searchTerm: string;
    let isTemporary = false;

    // Determine if first argument is a file or search term
    if (term) {
      // Two arguments provided: first is file, second is search term
      inputFile = fileOrTerm;
      searchTerm = term;
      validateFile(inputFile);
    } else {
      // One argument provided: it's the search term, read from stdin
      searchTerm = fileOrTerm;
      
      // Check if stdin has data
      if (!hasStdinData()) {
        console.error("Error: No search term provided or no data piped to stdin");
        console.error("Usage: gronify search <file> <term> OR cat file.json | gronify search <term>");
        process.exit(1);
      }

      try {
        // Read from stdin and create temp file
        inputFile = await readStdinToTempFile();
        isTemporary = true;
      } catch (error) {
        console.error("Error reading from stdin:", error);
        process.exit(1);
      }
    }

    // Build grep arguments based on options
    const grepArgs: string[] = [];
    
    // Case sensitivity (default is case-insensitive)
    if (!options.caseSensitive) {
      grepArgs.push("-i");
    }
    
    // Count only
    if (options.count) {
      grepArgs.push("-c");
    }
    
    // Regex support
    if (options.regex) {
      grepArgs.push("-E"); // Extended regex
    }
    
    // Add the search term
    grepArgs.push(searchTerm);

    // For search: flatten first, then grep
    const p = spawn("fastgron", [inputFile], { stdio: "pipe" });
    const grep = spawn("grep", grepArgs, { stdio: ["pipe", "inherit", "inherit"] });
    
    p.stdout?.pipe(grep.stdin);
    
    const cleanupTempFile = () => {
      if (isTemporary) {
        try {
          require('fs').unlinkSync(inputFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
    
    p.on("error", (error: any) => {
      cleanupTempFile();
      if (error.code === "ENOENT") {
        console.error("Error: fastgron not found. Please install it first:");
        console.error("  macOS/Linux: brew install fastgron");
        console.error("  Or visit: https://github.com/adamritter/fastgron");
      } else {
        console.error(`Error running fastgron: ${error.message}`);
      }
      process.exit(1);
    });
    
    p.on("exit", (code) => {
      if (code !== 0) {
        cleanupTempFile();
        console.error(`Error: fastgron exited with code ${code}`);
        if (code === 1) {
          console.error("This might indicate invalid JSON in the input");
        }
        process.exit(code);
      }
    });
    
    grep.on("error", (error) => {
      cleanupTempFile();
      console.error(`Error running grep: ${error.message}`);
      process.exit(1);
    });
    
    grep.on("exit", (code) => {
      cleanupTempFile();
      if (code === 1) {
        if (!options.count) {
          console.error(`No matches found for '${searchTerm}'`);
        }
        process.exit(0); // This is not an error, just no matches
      } else if (code && code > 1) {
        console.error(`Error: grep exited with code ${code}`);
        process.exit(code);
      }
      process.exit(0);
    });
  });

// Parse arguments
program.parse();
