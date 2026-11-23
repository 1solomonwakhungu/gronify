---
name: json-compare-sorted-diff
description: Compares two JSON files, API snapshots, or configs ignoring key order using gronify flatten --sort with system diff or git diff textconv. Use when checking JSON changes by path, skipping volatile fields, or comparing one subtree.
license: MIT
compatibility: Requires Node.js 20+ and the gronify CLI >= 1.2.0 (for --sort), plus system diff or git.
metadata:
  author: 1solomonwakhungu
  homepage: https://gronify.harlo.dev
  repository: https://github.com/1solomonwakhungu/gronify
---

# Compare JSON Files by Path with `--sort` and `diff`

Gronify has no compare subcommand of its own. Instead, `gronify flatten --sort` turns each JSON file into one `json.path = value` line per value with object keys sorted at every depth, so the system `diff` tool (or `git diff`) ignores key reordering and whitespace and shows every real change with its full path.

## Prerequisites

Check `command -v gronify` (PowerShell: `Get-Command gronify`) and verify `--sort` exists (`gronify flatten --help | grep -e --sort`, requires 1.2.0+). If missing, use `npx gronify ...` or ask the user before installing (`npm install -g gronify` or `brew install 1solomonwakhungu/tap/gronify`).

## Compare two JSON files

### Bash or zsh (process substitution)

```bash
diff -U1 --label old.json --label new.json \
  <(gronify --no-color flatten --sort old.json) \
  <(gronify --no-color flatten --sort new.json)
```

For only the changed lines (easy to paste into a summary or pipe onward):

```bash
diff <(gronify --no-color flatten --sort old.json) <(gronify --no-color flatten --sort new.json) | grep '^[<>]'
```

### POSIX `sh`, Windows PowerShell, or large files (two-file flow)

Where `<( )` is unavailable, or when comparing large files repeatedly, write atomic sorted files with `-o` first (this also surfaces Gronify syntax errors cleanly before `diff` runs):

```bash
gronify --no-color -o old.gron flatten --sort old.json && \
gronify --no-color -o new.gron flatten --sort new.json && \
diff -U1 old.gron new.gron
```

In PowerShell:

```powershell
gronify --no-color -o old.gron flatten --sort old.json
gronify --no-color -o new.gron flatten --sort new.json
Compare-Object (Get-Content old.gron) (Get-Content new.gron)
```

For a quiet yes/no check in scripts (`0` = identical, `1` = different):

```bash
diff -q old.gron new.gron
```

## Compare one subtree or ignore volatile fields

`search --sort` filters first and sorts only what remains. Anchor with `--regex` so sibling keys (e.g. `workerPool`) or string values containing the key name are not accidentally matched:

```bash
# Compare only one branch of two large configs
diff <(gronify --no-color search --sort old.json --regex '^json\.services\.worker(\.|\[| = )') \
     <(gronify --no-color search --sort new.json --regex '^json\.services\.worker(\.|\[| = )')

# Ignore noisy fields such as timestamps or request IDs with -v
diff <(gronify --no-color search --sort -v old.json --regex '\.generatedAt = ') \
     <(gronify --no-color search --sort -v new.json --regex '\.generatedAt = ')
```

## Path-level `git diff` for JSON files

Configure a Git `textconv` driver so `git diff`, `git log -p`, and `git show` display sorted path lines automatically (the raw JSON files stay untouched):

```bash
echo '*.json diff=flatjson' >> .gitattributes
git config diff.flatjson.textconv "gronify --no-color flatten --sort"
git diff -U0 config.json
```

- Use `git diff --no-textconv` to view raw text; `git format-patch` ignores textconv automatically.
- If a revision contains invalid JSON, Gronify exits non-zero and Git stops with `fatal: unable to read files to diff`.

## Sorting rules, memory, and caveats

- **UTF-16 key order:** `--sort` orders object keys at every depth by UTF-16 code unit (same as JS `sort()`), keeps each key's subtree contiguous, and preserves array order (`[2]` before `[10]`). Never pipe `flatten` through plain `sort` (it splits subtrees and puts `[10]` before `[2]`).
- **Exact numeric literals:** `1.0` and `1` stay verbatim and therefore compare as different lines.
- **Process substitution hides errors:** If one side has invalid JSON, Gronify writes to stderr while `diff` still runs on partial/empty input. Always inspect stderr, or use the two-file `-o` flow chained with `&&`.
- **Memory on huge root objects:** Top-level arrays sort one record at a time; a huge root object buffers up to 64 MiB (override with `GRONIFY_SORT_MEMORY`, e.g. `256MiB`) before spilling to `$TMPDIR`.
- **Array insertions/reordering:** Arrays compare by index, so inserting at index `0` renumbers every following line. When array insertions or set-like array comparisons matter, use `diff <(jq -S . old.json) <(jq -S . new.json)` or a structural tool such as `jd` (`jd -set`) or `dyff`.

Reference: [Compare JSON files guide](https://gronify.harlo.dev/guides/compare-json-files) · [Website & CLI docs](https://gronify.harlo.dev)
