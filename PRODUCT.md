# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Platform engineers, developer-experience teams, support engineers, and developers inspecting large JSON payloads in terminal workflows.

## Product Purpose

Gronify is a local-first TypeScript CLI that turns JSON into greppable path assignments, searches those paths, and round-trips gron output back to JSON.

## Positioning

Gronify keeps JSON inspection composable with familiar shell tools by wrapping fastgron with focused commands, stdin/stdout support, search options, and readable terminal output.

## Operating Context

Users inspect service responses, generated configuration, CI artifacts, support bundles, and incident data on macOS, Linux, WSL, Git Bash, or another shell environment with `grep`.

## Capabilities and Constraints

- Requires Node.js 20+, npm 10+, `fastgron` on `PATH`, and `grep` for search.
- Supports flattening and unflattening files or stdin.
- Supports plain-text search, extended regex, case-sensitive matching, match counts, optional color, and pretty output.
- Installation is currently from source; there is no claimed npm release.

## Brand Commitments

The product name is Gronify. The existing logo is in `branding/logo.svg`. Product language is concise, technical, and factual.

## Evidence on Hand

The repository README, CLI implementation, integration tests, example commands, logo, and MIT license are available. No customer logos, testimonials, commercial benchmarks, or adoption metrics are available and must not be fabricated.

## Product Principles

- Keep data local and terminal-native.
- Demonstrate behavior with real commands and output.
- Remain composable with standard shell workflows.
- Make operational JSON easier to scan without hiding its structure.
