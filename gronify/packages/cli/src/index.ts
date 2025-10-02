#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, accessSync, constants } from "node:fs";
import { extname } from "node:path";

const cmd = process.argv[2]; // "flatten", "unflatten", or "search"
const file = process.argv[3];
const searchTerm = process.argv[4]; // For search command

// Validate command line arguments
if (!cmd || !file) {
  console.error("Usage: gronify <flatten|unflatten|search> <file> [search-term]");
  console.error("\nCommands:");
  console.error("  flatten   - Convert JSON to gron format");
  console.error("  unflatten - Convert gron format back to JSON");
  console.error("  search    - Search through flattened JSON paths");
  console.error("\nExamples:");
  console.error("  gronify flatten data.json");
  console.error("  gronify search data.json email");
  console.error("  gronify unflatten flattened.txt");
  process.exit(1);
}

// Validate command
if (!["flatten", "unflatten", "search"].includes(cmd)) {
  console.error(`Error: Unknown command '${cmd}'`);
  console.error("Valid commands are: flatten, unflatten, search");
  process.exit(1);
}

// Check if file exists
if (!existsSync(file)) {
  console.error(`Error: File '${file}' does not exist`);
  process.exit(1);
}

// Check if file is readable
try {
  accessSync(file, constants.R_OK);
} catch (error) {
  console.error(`Error: Cannot read file '${file}' - permission denied`);
  process.exit(1);
}

// Validate file extension for JSON files
if (cmd === "flatten" && ![".json", ".jsonl"].includes(extname(file).toLowerCase())) {
  console.warn(`Warning: File '${file}' doesn't have a .json extension`);
  process.exit(1)
}

if (cmd === "search") {
  if (!searchTerm) {
    console.error("Error: Search command requires a search term");
    console.error("Usage: gronify search <file> <search-term>");
    console.error("Example: gronify search data.json email");
    process.exit(1);
  }
  
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
} else {
  // Original flatten/unflatten logic
  const args = cmd === "unflatten" ? ["-u", file] : [file];
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
    if (code !== 0) {
      console.error(`Error: fastgron exited with code ${code}`);
      if (cmd === "flatten" && code === 1) {
        console.error("This might indicate invalid JSON in the input file");
        console.error("Please check that your JSON file is valid");
      } else if (cmd === "unflatten" && code === 1) {
        console.error("This might indicate invalid gron format in the input file");
        console.error("Please check that your input file is in proper gron format");
      }
      process.exit(code ?? 1);
    }
  });
}
