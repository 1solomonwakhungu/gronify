#!/usr/bin/env node
import { spawn } from "node:child_process";

const cmd = process.argv[2]; // "flatten" or "unflatten"
const file = process.argv[3];

if (!cmd || !file) {
  console.error("Usage: gronify <flatten|unflatten> <file>");
  process.exit(1);
}

const args = cmd === "unflatten" ? ["-u", file] : [file];
const p = spawn("fastgron", args, { stdio: "inherit" });

p.on("error", () => {
  console.error("fastgron not found. Try: brew install fastgron");
  process.exit(1);
});
p.on("exit", (code) => process.exit(code ?? 1));
