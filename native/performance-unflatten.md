# Local ordered-unflatten measurements

Three serial samples per tool/fixture on macOS 26.6.1 arm64, with rotated order, warm file cache, and stdout sent to `/dev/null`. Wall time includes process startup and `/usr/bin/time`. RSS is the median of per-run maxima. This shared machine was not isolated from other work. These measurements describe this fixture and implementation, not a general ranking.

| JSON source size | Tool | Median wall ms | Peak RSS MiB |
| --- | --- | ---: | ---: |
| 1 MiB | native | 17.61 | 1.80 |
| 1 MiB | node | 51.67 | 60.39 |
| 1 MiB | fastgron | 12.91 | 17.03 |
| 10 MiB | native | 136.93 | 1.80 |
| 10 MiB | node | 104.75 | 87.56 |
| 10 MiB | fastgron | 76.17 | 98.17 |

The 1 MiB JSON fixture expands to 2,350,258 gron bytes; 10 MiB expands to 24,384,880 gron bytes. Every tool consumes the same gron bytes. The fixture recipe matches the record schema in the existing native benchmark. Native and Node reproduce source JSON plus LF byte-for-byte. fastgron sorts object keys and changes formatting even with `--no-indent --no-newline`; its raw SHA256 is retained, and parsed equality plus canonical SHA256 is verified on this integer-only fixture. No claim of byte equality or arbitrary numeric fidelity is made for fastgron.

Native uses about 1.8 MiB RSS on both sizes. Its 1 MiB wall time is lower than Node, but its 10 MiB throughput is lower than Node and fastgron. fastgron is faster at both sizes. Repeated path parsing and short-lived key/string allocations are candidates for profiling; these measurements do not establish where CPU time is spent.

[measurements-unflatten.json](measurements-unflatten.json) records all samples, commands, tool versions, fixture recipe and hashes, raw/canonical output hashes, source hashes, native/fastgron executable hashes, and every built Node JavaScript hash. The checkout commit is the starting main `483c211`; dirty state is recorded because the native implementation was measured before committing. Source and artifact hashes identify the measured build, not the starting commit alone.

Reproduce from the repository root:

```sh
npm ci --no-audit --no-fund --prefix src/packages/cli
npm run build --prefix src/packages/cli
cargo build --release --locked --manifest-path native/Cargo.toml
python3 native/scripts/unflatten_bench.py
```

Validation for this change: fmt check, clippy with warnings denied, 18 release Rust tests, 150 unflatten exact-output differential comparisons, 192 flatten byte comparisons plus the 50,000-depth comparison, and 432 search byte/status comparisons passed locally. Unsupported/fallback cases and malformed/resource/I/O tests also passed. Linux/macOS CI and independent review remain separate evidence.
