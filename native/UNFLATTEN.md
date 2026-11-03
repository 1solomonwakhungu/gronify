# Experimental ordered unflatten

```sh
cargo build --release --locked --manifest-path native/Cargo.toml
native/target/release/gronify-native unflatten [--chunk-size N] [file|-]
native/target/release/gronify-native flatten input.json | native/target/release/gronify-native unflatten
```

This standalone experiment is separate from npm and the default CLI. It emits compact JSON followed by LF. It does not implement pretty output, URL input, atomic output files, sorting, or a tree fallback. Unsupported flags fail. Exit 0 means the input was accepted or stdout disconnected; errors exit 1 and normally identify the gron line.

## Accepted input

The ordered subset follows the Node `LineParser` and `StreamEmitter` contracts:

- One assignment per physical line, rooted at `json`. Blank lines, CRLF, ASCII surrounding whitespace, optional trailing semicolons, and a final line without LF work. Unicode whitespace outside strings is unsupported and rejected.
- Dotted ASCII identifiers and JSON double-quoted bracket keys work. Bracket keys can contain dots, brackets, equals signs, escaped quotes, Unicode, and escaped lone UTF-16 surrogates. Keys normalize before path comparisons, so `json["\u0061"]` and `json.a` identify the same string key. Prototype-like names have no special behavior.
- Numeric brackets are canonical unsigned decimal indexes from 0 through 4294967294. Whitespace inside brackets is accepted. String `"0"` and numeric `0` are distinct: objects require strings, arrays require indexes. Leading zeroes, signed indexes, fractional indexes, and exponent indexes fail.
- Values are JSON strings, numbers, booleans, null, or empty container declarations (`{}` and `[]`, optionally with JSON whitespace inside). Number bytes are never converted to floating point: `-0`, `1.230`, large integers, and `1e+999` survive exactly. Strings use the existing validated native scanner and JSON.stringify-style normalization. Invalid UTF-8, controls, escapes, and trailing material fail.
- The root and each parent container must be assigned before children. Descendants of a container must stay together. Array indexes increase; gaps become `null` without allocating the gap.

Repeated object keys are emitted as duplicate JSON members, matching Node's streaming emitter. A normal JSON parser retains the last member. Reassigning an object member replaces its old value, including a previously emitted container; it does not merge old descendants. This is semantic compatibility, not deduplication or byte equality with Node's tree fallback.

## Explicit failures

Non-empty inline compounds are rejected; first expand them with `flatten`. Root reassignment, descending/repeated array indexes, missing parents, scalar parents, and returning to a closed parent fail with an unsupported ordering/replacement diagnostic pointing to Node's tree fallback. The native process never retries through Node. Node itself can only fall back while its retained-input/output budget permits it.

Output may already have been written when a later line fails, and buffered output can flush during cleanup. Consumers must check exit status and discard partial output. Redirecting stdout is not an atomic file update. Stdout broken-pipe or not-connected writes/flushes cancel quietly with exit 0; the unread tail is not validated. Cancellation is detected only when writing or flushing output. Input and other output failures exit 1. `--help` / `-h` and `--version` print experimental CLI information without reading stdin.

## Memory and limits

The implementation retains one line, parsed path/value, and an explicit stack of open containers. Memory is O(largest line + longest open path + depth), independent of record count. It does not retain prior assignments or build a JSON tree. String normalization can allocate a temporary UTF-16 vector. The line buffer keeps its high-water capacity. Buffered input/output defaults to 64 KiB; `--chunk-size` accepts 1 through 1048576 for input only.

Limits are 64 MiB per physical line **including LF**, 16 MiB of raw path segments after `json`, 100000 path segments/open containers, and 1000000 missing slots per sparse gap. They bound allocation or single-line output amplification and fail explicitly. These experimental limits differ from Node's limits. A stream can still produce arbitrarily much output across many accepted lines.

## Validation and next work

`unflatten_compat.py` runs 150 exact stdout comparisons with Node at input chunks of 1, 7, and 65536 bytes, including seeded nested roundtrips. It also verifies explicit rejection of Node-supported fallback cases and malformed inputs. Rust tests cover malformed syntax, invalid bytes, I/O failure, line/path/depth resource limits, and sparse-gap rejection. Native CI runs these alongside existing flatten/search checks on Linux and macOS.

Before broader compatibility: implement a bounded retained-input/output buffer and tree fallback that stores raw scalar tokens, add non-empty inline compound parsing without floats, and support Node's Unicode whitespace grammar. Preserve explicit late-backtracking errors after any fallback budget is exhausted. Profile repeated path parsing and short-lived key/string allocations before claiming throughput improvements. Pretty/atomic file output and npm integration are separate work.

The local measurement receipt and limitations are in [performance-unflatten.md](performance-unflatten.md). This is ready for review of the ordered subset, not a replacement for Node unflatten.
