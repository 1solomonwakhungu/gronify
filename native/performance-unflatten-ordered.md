# Borrowed tokens for ordered unflatten

This follow-up stacks on PR118 at `844f0c29191d1d1861cce7c9f83a23052cdef5a4`. It changes only `unflatten.rs` and adds dedicated tests and performance evidence. It does not include PR117 or change `main.rs`.

The baseline constructs a 4096-byte `Input` for every quoted key/string, allocates quoted dotted keys repeatedly, and copies every scalar. The candidate scans the already bounded line directly, validates UTF-8, and borrows unescaped strings, dotted keys, numeric tokens, literals, and empty container declarations. Escaped strings still use the shared `normalize` function. Only keys retained in the open-container stack become owned. Path parsing and the per-line path vector remain; no prefix cache or broader parser redesign was added.

## Serial ablation results

Seven samples per tool/fixture, alternating forward/reverse order, warm file cache, stdout discarded. Wall time includes process startup and `/usr/bin/time`. All programs run serially, with no compatibility tests running concurrently. This is a shared macOS arm64 machine, not an isolated benchmark host.

Median wall milliseconds:

| Fixture | PR118 baseline | Slice scanner only | Borrowed candidate | Node | fastgron |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tiny startup (`{}`) | 3.81 | 3.99 | 3.92 | 37.53 | 5.72 |
| Original records, 1 MiB JSON | 17.47 | 15.31 | 10.90 | 50.79 | 12.72 |
| Original records, 10 MiB JSON | 135.77 | 115.22 | 72.73 | 105.43 | 77.86 |
| Escaped records, approximately 1 MiB JSON | 19.10 | 14.25 | 12.34 | 55.24 | Not tested |

The candidate reduces wall time by 37.6% and 46.4% on the original 1/10 MiB record fixtures. This ablation supports removing reader setup and token allocations; it is not a sampled CPU profile or allocator trace. The scanner-only artifact retains the baseline's owned paths/values and always calls `normalize`. The candidate also avoids that call for unescaped strings after explicit UTF-8 validation, so the second ablation does not isolate allocation costs alone.

Median peak RSS for the candidate is 1.73 MiB at both original sizes, versus 1.77 MiB for the baseline. Escaped-record RSS is 1.80 MiB versus 1.78 MiB. Startup is 0.11 ms slower in this run; no startup improvement is claimed. Memory remains bounded by the largest physical line, open path, and depth, independent of record count. Escaped normalization still allocates temporary UTF-16 storage. The line buffer and path-vector allocation remain possible future targets, but are not needed for this measured gain.

## Equality and provenance

[measurements-unflatten-ordered.json](measurements-unflatten-ordered.json) retains all 133 raw samples, per-run RSS, fixture hashes and lengths, commands, versions, candidate Rust source hashes, the ablation patch hash, executable hashes, and every built Node JavaScript hash. Native binaries, fastgron, and the Node dist tree are copied before timing and their hashes rechecked afterward. Node's installed runtime and dependencies are shared, not copied. There is no claim of a hermetically isolated toolchain.

The original fixture recipe and gron hashes match the historical [PR118 receipt](measurements-unflatten.json). All three native artifacts and Node produce identical output; for the original records this is source JSON plus LF byte-for-byte. The escaped fixture includes bracket keys, literal Unicode, escaped control/quote/backslash characters, and a lone surrogate. Its output is checked byte-for-byte against the baseline and Node, and parsed equality is checked against its source. Fastgron is tested only on the original integer-only records and startup: its formatting/key order differs, so parsed equality and canonical hashes are checked, with raw hashes retained. No arbitrary numeric or Unicode fidelity claim is made for fastgron.

The scanner-only build is reproducible by applying [unflatten-scanner-ablation.patch](scripts/unflatten-scanner-ablation.patch) to the base revision. It is measurement evidence, not a patch to apply to the candidate branch. To reconstruct frozen executables from the repository root:

```sh
bench_dir=$(mktemp -d)
git archive 844f0c29191d1d1861cce7c9f83a23052cdef5a4 native | tar -x -C "$bench_dir"
cargo build --release --locked --manifest-path "$bench_dir/native/Cargo.toml"
cp "$bench_dir/native/target/release/gronify-native" "$bench_dir/baseline"
patch -d "$bench_dir" -p1 < native/scripts/unflatten-scanner-ablation.patch
cargo build --release --locked --manifest-path "$bench_dir/native/Cargo.toml"
cp "$bench_dir/native/target/release/gronify-native" "$bench_dir/scanner"
cargo build --release --locked --manifest-path native/Cargo.toml
cp native/target/release/gronify-native "$bench_dir/candidate"
npm ci --no-audit --no-fund --prefix src/packages/cli
npm run build --prefix src/packages/cli
python3 native/scripts/unflatten_ordered_bench.py \
  --baseline "$bench_dir/baseline" --scanner "$bench_dir/scanner" \
  --candidate "$bench_dir/candidate" --output "$bench_dir/results.json"
```

## Contract and local verification

The [ordered subset](UNFLATTEN.md) remains unchanged: exact number spellings, canonical string/key normalization including lone surrogates, ordered containers, increasing array indexes, and explicit failures for unsupported ordering and nonempty inline compounds. Repeated object members emit duplicates and replace earlier values when parsed; they do not merge descendants. There is no silent Node fallback. Partial output on failure remains possible. Unicode whitespace outside strings is unsupported. Vertical tab remains gron whitespace outside JSON, and physical lines still use checked `u64` increments.

Passed locally on macOS arm64:

- `cargo fmt --manifest-path native/Cargo.toml -- --check`
- `cargo clippy --locked --manifest-path native/Cargo.toml --all-targets -- -D warnings`
- `cargo test --release --locked --manifest-path native/Cargo.toml`: 22 tests, including 12,800 deterministic byte inputs compared with the existing stream string scanner, explicit Unicode/escape cases, borrowing behavior, and retained-key/replacement checks at three input chunk sizes.
- `compat.py`: 192 flatten byte comparisons, malformed/cap checks, and all 3,750,575,009 bytes of the 50,000-depth output.
- `search_compat.py`: 432 byte/status comparisons plus error and backpressure checks.
- `unflatten_compat.py`: 159 exact-output comparisons plus fallback and malformed rejection checks.

These results do not establish Linux behavior, independent review, broad fuzz coverage, or performance after integrating PR117 or the separate main-parser optimization.
