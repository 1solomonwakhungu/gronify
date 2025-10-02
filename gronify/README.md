# Gronify

Make big JSON easy to search, inspect, and diff — in your terminal and VS Code — powered by [fastgron].

## Why
Developers constantly poke at large or deeply nested JSON. Gronify flattens JSON into greppable “paths” (gron-style), lets you search/filter quickly, and round-trips back to JSON.

## Features (MVP)
- Flatten JSON → gron lines
- Unflatten back to JSON
- Search/filter paths
- VS Code command: “Gronify: Flatten JSON” (preview panel)

## Install

### Prereq: fastgron
macOS/Linux (Homebrew):
```bash
brew install fastgron
