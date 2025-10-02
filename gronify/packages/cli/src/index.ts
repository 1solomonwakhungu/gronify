#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync, accessSync, constants } from "node:fs";
import { extname } from "node:path";

const program = new Command();

// Package info (we'll read this from package.json later)
program
  .name("gronify")
  .description("Make big JSON easy to search, inspect, and diff")
  .version("1.0.0");

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
  .argument("<file>", "JSON file to flatten")
  .action((file: string) => {
    validateFile(file);
    
    // Warn about non-JSON extensions
    if (![".json", ".jsonl"].includes(extname(file).toLowerCase())) {
      console.warn(`Warning: File '${file}' doesn't have a .json extension`);
    }

    runFastgron([file], (code) => {
      if (code === 1) {
        console.error("This might indicate invalid JSON in the input file");
        console.error("Please check that your JSON file is valid");
      }
      process.exit(code);
    });
  });

// Unflatten command
program
  .command("unflatten")
  .description("Convert gron format back to JSON")
  .argument("<file>", "Gron file to unflatten")
  .action((file: string) => {
    validateFile(file);

    runFastgron(["-u", file], (code) => {
      if (code === 1) {
        console.error("This might indicate invalid gron format in the input file");
        console.error("Please check that your input file is in proper gron format");
      }
      process.exit(code);
    });
  });

// Search command
program
  .command("search")
  .description("Search through flattened JSON paths")
  .argument("<file>", "JSON file to search")
  .argument("<term>", "Search term")
  .action((file: string, searchTerm: string) => {
    validateFile(file);

    // For search: flatten first, then grep
    const p = spawn("fastgron", [file], { stdio: "pipe" });
    const grep = spawn("grep", ["-i", searchTerm], { stdio: ["pipe", "inherit", "inherit"] });
    
    p.stdout?.pipe(grep.stdin);
    
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
      if (code !== 0) {
        console.error(`Error: fastgron exited with code ${code}`);
        if (code === 1) {
          console.error("This might indicate invalid JSON in the input file");
        }
        process.exit(code);
      }
    });
    
    grep.on("error", (error) => {
      console.error(`Error running grep: ${error.message}`);
      process.exit(1);
    });
    
    grep.on("exit", (code) => {
      if (code === 1) {
        console.error(`No matches found for '${searchTerm}'`);
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
