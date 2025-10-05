#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync, accessSync, constants, writeFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { createFormatter, shouldUseColor, type FormatOptions } from "./formatter.js";

const program = new Command();

// Package info (we'll read this from package.json later)
program
  .name("gronify")
  .description("Make big JSON easy to search, inspect, and diff")
  .version("1.0.0")
  .option("--color", "Enable colored output (default: auto-detect)")
  .option("--no-color", "Disable colored output")
  .option("--pretty", "Enable pretty formatting with better readability");

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

// Helper function to create formatter from global options
function createFormatterFromOptions(globalOptions: any): import("./formatter.js").OutputFormatter {
  const formatOptions: FormatOptions = {
    color: globalOptions.color ?? shouldUseColor(),
    pretty: globalOptions.pretty ?? false,
    format: 'gron'
  };
  return createFormatter(formatOptions);
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

// Helper function to run fastgron with formatting
function runFastgron(args: string[], formatter: import("./formatter.js").OutputFormatter, onError?: (code: number) => void): void {
  const p = spawn("fastgron", args, { stdio: ["inherit", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";

  if (p.stdout) {
    p.stdout.on("data", (data) => {
      stdout += data.toString();
    });
  }

  if (p.stderr) {
    p.stderr.on("data", (data) => {
      stderr += data.toString();
    });
  }

  p.on("error", (error: any) => {
    if (error.code === "ENOENT") {
      console.error(formatter.formatError("fastgron not found. Please install it first:"));
      console.error("  macOS/Linux: brew install fastgron");
      console.error("  Or visit: https://github.com/adamritter/fastgron");
    } else {
      console.error(formatter.formatError(`running fastgron: ${error.message}`));
    }
    process.exit(1);
  });

  p.on("exit", (code) => {
    if (stderr) {
      console.error(formatter.formatError(stderr.trim()));
    }

    if (stdout) {
      // Check if this is gron output (flatten) or JSON output (unflatten)
      const isGronOutput = args.includes("-u") ? false : true;
      
      if (isGronOutput) {
        console.log(formatter.formatGron(stdout.trim()));
      } else {
        console.log(formatter.formatJson(stdout.trim()));
      }
    }

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
  .action(async (file?: string, options?: any, command?: any) => {
    const globalOptions = command?.parent?.opts() || {};
    const formatter = createFormatterFromOptions(globalOptions);
    
    let inputFile: string;
    let isTemporary = false;

    if (!file) {
      // Check if stdin has data
      if (!hasStdinData()) {
        console.error(formatter.formatError("No input file provided and no data piped to stdin"));
        console.error("Usage: gronify flatten <file> OR cat file.json | gronify flatten");
        process.exit(1);
      }

      try {
        // Read from stdin and create temp file
        inputFile = await readStdinToTempFile();
        isTemporary = true;
      } catch (error) {
        console.error(formatter.formatError(`reading from stdin: ${error}`));
        process.exit(1);
      }
    } else {
      inputFile = file;
      validateFile(inputFile);
      
      // Warn about non-JSON extensions
      if (![".json", ".jsonl"].includes(extname(inputFile).toLowerCase())) {
        console.warn(formatter.formatWarning(`File '${inputFile}' doesn't have a .json extension`));
      }
    }

    runFastgron([inputFile], formatter, (code: number) => {
      // Clean up temporary file if created
      if (isTemporary) {
        try {
          require('fs').unlinkSync(inputFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      if (code === 1) {
        console.error(formatter.formatError("This might indicate invalid JSON in the input"));
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
  .action(async (file?: string, options?: any, command?: any) => {
    const globalOptions = command?.parent?.opts() || {};
    const formatter = createFormatterFromOptions(globalOptions);
    
    let inputFile: string;
    let isTemporary = false;

    if (!file) {
      // Check if stdin has data
      if (!hasStdinData()) {
        console.error(formatter.formatError("No input file provided and no data piped to stdin"));
        console.error("Usage: gronify unflatten <file> OR cat file.gron | gronify unflatten");
        process.exit(1);
      }

      try {
        // Read from stdin and create temp file
        inputFile = await readStdinToTempFile();
        isTemporary = true;
      } catch (error) {
        console.error(formatter.formatError(`reading from stdin: ${error}`));
        process.exit(1);
      }
    } else {
      inputFile = file;
      validateFile(inputFile);
    }

    runFastgron(["-u", inputFile], formatter, (code: number) => {
      // Clean up temporary file if created
      if (isTemporary) {
        try {
          require('fs').unlinkSync(inputFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      if (code === 1) {
        console.error(formatter.formatError("This might indicate invalid gron format in the input"));
        console.error("Please check that your gron file is properly formatted");
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
  }, command?: any) => {
    const globalOptions = command?.parent?.opts() || {};
    const formatter = createFormatterFromOptions(globalOptions);
    
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
        console.error(formatter.formatError("No search term provided or no data piped to stdin"));
        console.error("Usage: gronify search <file> <term> OR cat file.json | gronify search <term>");
        process.exit(1);
      }

      try {
        // Read from stdin and create temp file
        inputFile = await readStdinToTempFile();
        isTemporary = true;
      } catch (error) {
        console.error(formatter.formatError(`reading from stdin: ${error}`));
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
    const grep = spawn("grep", grepArgs, { stdio: ["pipe", "pipe", "pipe"] });
    
    let grepOutput = "";
    let grepError = "";
    
    p.stdout?.pipe(grep.stdin);
    
    if (grep.stdout) {
      grep.stdout.on("data", (data) => {
        grepOutput += data.toString();
      });
    }
    
    if (grep.stderr) {
      grep.stderr.on("data", (data) => {
        grepError += data.toString();
      });
    }
    
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
        console.error(formatter.formatError("fastgron not found. Please install it first:"));
        console.error("  macOS/Linux: brew install fastgron");
        console.error("  Or visit: https://github.com/adamritter/fastgron");
      } else {
        console.error(formatter.formatError(`running fastgron: ${error.message}`));
      }
      process.exit(1);
    });
    
    p.on("exit", (code) => {
      if (code !== 0) {
        cleanupTempFile();
        console.error(formatter.formatError(`fastgron exited with code ${code}`));
        if (code === 1) {
          console.error("This might indicate invalid JSON in the input");
        }
        process.exit(code);
      }
    });
    
    grep.on("error", (error) => {
      cleanupTempFile();
      console.error(formatter.formatError(`running grep: ${error.message}`));
      process.exit(1);
    });
    
    grep.on("exit", (code) => {
      cleanupTempFile();
      
      if (grepError) {
        console.error(formatter.formatError(grepError.trim()));
      }
      
      if (code === 1) {
        if (!options.count) {
          console.error(formatter.formatWarning(`No matches found for '${searchTerm}'`));
        }
        process.exit(0); // This is not an error, just no matches
      } else if (code && code > 1) {
        console.error(formatter.formatError(`grep exited with code ${code}`));
        process.exit(code);
      }
      
      if (grepOutput) {
        if (options.count) {
          console.log(formatter.formatSuccess(grepOutput.trim()));
        } else {
          // Highlight search results
          console.log(formatter.formatSearchResults(grepOutput.trim(), searchTerm));
        }
      }
      
      process.exit(0);
    });
  });

// Parse arguments
program.parse();
