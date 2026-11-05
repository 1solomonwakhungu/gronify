# Gronify 1.3.1 benchmark sweep (2026-11-05)

This sweep measures the Gronify CLI as published to npm as `gronify@1.3.1`. It replaces the 2026-11-04 receipt at `00d950204b4d60e510870c3bf2d86718924d6832`, which the harness labelled 1.2.0 because the release bump had not landed yet.

- Source commit: `4c78c13e5ba299462e33a87e8a02be25fda1badd` (`chore(main): release 1.3.1 (#128)`)
- `provenance.dirtyState`: empty when the run started; the run itself rewrote only `landing-page/src/app/benchmark-results.json` and `src/packages/cli/BENCHMARKS.md`
- `tools.gronify`: `1.3.1`; gron 0.7.1, fastgron 0.7.7, jq 1.8.2, jaq 3.1.2
- Machine: Apple M5 Pro, 48 GB RAM, macOS 26.6.1 (Darwin 25.6.0, arm64), Node v22.23.1
- Statistic: median of 3 runs, 60 s timeout, 8 GiB memory guard, 45 min budget
- Harness log: [bench-v131.log](bench-v131.log)

## Reproduce

```sh
git checkout 4c78c13e5ba299462e33a87e8a02be25fda1badd
cd src/packages/cli
npm ci --no-audit --no-fund
npm run build
npm test
npm run bench:compare -- --runs 3 --timeout 60 --max-rss-gb 8 --budget 45
```

Before timing, `npm test` passed all 9 suites and 618 tests.

## npm tarball check

`npm pack gronify@1.3.1` was extracted into an empty temporary directory. Running `diff -r` on its `dist/` against the `dist/` built from `4c78c13` found no differences (68 files each). These measurements therefore describe the code that npm users install.

## What the receipt shows

- The 32 workloads produced 149 successful results, 30 skips, 11 failures, and 2 timeouts. These counts and the failure reasons match the 2026-11-04 receipt. Every failure, timeout, and skip belongs to another tool or is an unsupported pairing. All Gronify runs succeeded.
- Every correctness check gave the same pass, fail, and not-applicable outcome as in the previous receipt.
- Within each workload, the tools finish in the same order as before. On the 1 GiB records fixture, fastgron is faster at flatten and with `-F` at search, using about 1.9 GiB RSS. Gronify is fastest at unflatten. jq leads the capped search.
- The host is shared, and unrelated OS activity was not controlled. Small timing differences do not prove a general performance advantage.

## Gronify headline numbers

Median time and median peak RSS, previous receipt (`00d9502`) compared with this one (`4c78c13`).

| Workload                        | 2026-11-04 (`00d9502`) | 2026-11-05 (1.3.1) | Time   | RSS    |
| ------------------------------- | ---------------------- | ------------------ | ------ | ------ |
| Flatten, 1 GiB records          | 3.833 s / 80 MiB       | 3.625 s / 65 MiB   | −5.4%  | −19.6% |
| Search count, 1 GiB records     | 4.465 s / 75 MiB       | 4.274 s / 55 MiB   | −4.3%  | −26.8% |
| Unflatten, 2.2 GiB gron         | 5.560 s / 101 MiB      | 5.098 s / 97 MiB   | −8.3%  | −4.1%  |
| Search first 10, 1 GiB records  | 40.4 ms / 58 MiB       | 32.8 ms / 52 MiB   | −18.8% | −10.2% |
| Flatten, 1 MB records (startup) | 47.8 ms / 60 MiB       | 36.5 ms / 54 MiB   | −23.6% | −10.0% |
| Flatten 50,000 levels, piped    | 0.542 s / 100 MiB      | 0.517 s / 85 MiB   | −4.6%  | −14.7% |

The largest change elsewhere is `unflatten-deep-5000`, which dropped from 0.121 s to 36.0 ms (−70%). That fits the reused frames in #129. All 32 Gronify workloads got faster, by 4–70%, and their peak RSS fell by 2–27%.
