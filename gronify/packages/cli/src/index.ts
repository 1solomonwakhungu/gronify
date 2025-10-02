#!/usr/bin/env node
import { spawn } from "node:child_process";

const cmd = process.argv[2]; // "flatten", "unflatten", or "search"
const file = process.argv[3];
const searchTerm = process.argv[4]; // For search command

if (!cmd || !file) {
  console.error("Usage: gronify <flatten|unflatten|search> <file> [search-term]");
  process.exit(1);
}

if (cmd === "search") {
  if (!searchTerm) {
    console.error("Search command requires a search term: gronify search <file> <search-term>");
    process.exit(1);
  }
  
  // For search: flatten first, then grep
  const p = spawn("fastgron", [file], { stdio: "pipe" });
  const grep = spawn("grep", ["-i", searchTerm], { stdio: ["pipe", "inherit", "inherit"] });
  
  p.stdout?.pipe(grep.stdin);
  
  p.on("error", () => {
    console.error("fastgron not found. Try: brew install fastgron");
    process.exit(1);
  });
  
  grep.on("exit", (code) => process.exit(code ?? 1));
} else {
  // Original flatten/unflatten logic
  const args = cmd === "unflatten" ? ["-u", file] : [file];
  const p = spawn("fastgron", args, { stdio: "inherit" });

  p.on("error", () => {
    console.error("fastgron not found. Try: brew install fastgron");
    process.exit(1);
  });
  p.on("exit", (code) => process.exit(code ?? 1));
}
