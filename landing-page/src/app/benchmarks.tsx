"use client";

import {
  Grid,
  Heading,
  Link,
  Section,
  SectionIntro,
  Text,
} from "@primer/react-brand";
import type { ReactNode } from "react";

import type {
  BarBlock,
  BarRow,
  BenchmarkView,
  MatrixCell,
  Point,
} from "./benchmark-data";
import styles from "./page.module.css";

function Bar({ percent, highlight }: { percent: number; highlight: boolean }) {
  return (
    <span className={styles.barTrack} aria-hidden="true">
      <span
        className={`${styles.barFill} ${highlight ? styles.barFillGronify : ""}`}
        style={{ inlineSize: `max(${percent.toFixed(2)}%, 2px)` }}
      />
    </span>
  );
}

function BarRowItem({ row }: { row: BarRow }) {
  const measured = row.timeText !== undefined && row.rssText !== undefined;

  return (
    <li
      className={`${styles.barRow} ${row.highlight ? styles.barRowGronify : ""}`}
    >
      <code className={styles.barTool}>{row.label}</code>
      {measured ? (
        <>
          <div className={styles.barMetric}>
            <span className={styles.barMetricLabel}>Time</span>
            <span className={styles.barValue}>{row.timeText}</span>
            <Bar percent={row.timePercent ?? 0} highlight={row.highlight} />
          </div>
          <div className={styles.barMetric}>
            <span className={styles.barMetricLabel}>Peak memory</span>
            <span className={styles.barValue}>{row.rssText}</span>
            <Bar percent={row.rssPercent ?? 0} highlight={row.highlight} />
          </div>
        </>
      ) : (
        <div className={styles.barStatus}>
          <span
            className={`${styles.statusLabel} ${
              row.statusTone === "danger"
                ? styles.statusDanger
                : styles.statusNeutral
            }`}
          >
            {row.statusLabel}
          </span>
          {row.statusNote ? (
            <span className={styles.barNote}>{row.statusNote}</span>
          ) : null}
        </div>
      )}
    </li>
  );
}

function BenchmarkChart({ block }: { block: BarBlock }) {
  return (
    <div className={styles.gridCell}>
      <Heading as="h3" size="6">
        {block.title}
      </Heading>
      <Text as="p" size="200" variant="muted">
        {block.subtitle}
      </Text>
      <div className={styles.barHeader} aria-hidden="true">
        <span>Tool</span>
        <span>Time</span>
        <span>Peak memory</span>
      </div>
      <ul
        className={styles.barList}
        aria-label={`${block.title}: time and peak memory by tool`}
      >
        {block.rows.map((row) => (
          <BarRowItem key={row.tool} row={row} />
        ))}
      </ul>
    </div>
  );
}

function MatrixCellView({ cell, label }: { cell: MatrixCell; label: string }) {
  const glyph = cell.kind === "pass" ? "✓" : cell.kind === "fail" ? "✕" : "–";
  const tone =
    cell.kind === "pass"
      ? styles.cellPass
      : cell.kind === "fail"
        ? styles.cellFail
        : styles.cellNa;

  return (
    <td className={styles.matrixCell} data-label={label} role="cell">
      <span className={tone}>
        <span aria-hidden="true">{glyph} </span>
        {cell.text}
      </span>
      {cell.detail ? (
        <span className={styles.matrixDetail}>{cell.detail}</span>
      ) : null}
    </td>
  );
}

function PointList({ title, points }: { title: string; points: Point[] }) {
  return (
    <div className={styles.gridCell}>
      <Heading as="h3" size="6">
        {title}
      </Heading>
      <ul className={styles.pointList}>
        {points.map((point) => (
          <li key={point.title}>
            <Text as="p" size="200" weight="semibold">
              {point.title}
            </Text>
            <Text as="p" size="200" variant="muted">
              {point.body}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Benchmarks({
  view,
  reproduce,
}: {
  view: BenchmarkView;
  reproduce: ReactNode;
}) {
  const {
    barBlocks,
    benchmarkUrl,
    environment,
    losses,
    matrix,
    matrixNote,
    matrixTools,
    tiePercent,
    timeoutSeconds,
    wins,
  } = view;

  return (
    <>
      <Section
        id="benchmarks"
        paddingBlockStart="spacious"
        paddingBlockEnd="none"
      >
        <SectionIntro align="center" fullWidth>
          <SectionIntro.Label>Benchmarks</SectionIntro.Label>
          <SectionIntro.Heading size="3">
            Time, memory, and the work each tool does.
          </SectionIntro.Heading>
          <SectionIntro.Description>
            {view.headlineDescription} Compare tools within each chart. For tool
            selection, see the{" "}
            <a className={styles.inlineLink} href="#compare">
              ecosystem comparison
            </a>
            .
          </SectionIntro.Description>
        </SectionIntro>
      </Section>

      <Section paddingBlockStart="normal" paddingBlockEnd="none">
        <Grid>
          <Grid.Column span={12}>
            <div className={styles.gridFrame}>
              {barBlocks.map((block) => (
                <BenchmarkChart key={block.id} block={block} />
              ))}
            </div>
          </Grid.Column>
        </Grid>
        <Text as="p" size="100" variant="muted" className={styles.benchCaption}>
          Each metric uses its own linear scale within a chart. Lower is better.
          Full flatten and unflatten output goes to /dev/null; search counts
          matches and capped workloads stop early. Piped-output results are in
          BENCHMARKS.md. Time and RSS are independently aggregated; memory is
          the median of per-run peaks, and pipeline RSS is the largest
          individual process peak rather than the sum. Memory uses MiB and GiB.
          Peak memory for a run that timed out is the largest value seen while
          sampling the process tree. A tie means the two times are within{" "}
          {`${tiePercent}%`} of each other.
        </Text>
      </Section>

      <Section paddingBlockStart="normal" paddingBlockEnd="none">
        <Grid>
          <Grid.Column span={12}>
            <div className={`${styles.gridFrame} ${styles.gridFrameTwoUp}`}>
              <PointList title="What Gronify delivers" points={wins} />
              <PointList
                title="Tradeoffs and comparison limits"
                points={losses}
              />
            </div>
          </Grid.Column>
        </Grid>
      </Section>

      <Section paddingBlockStart="normal" paddingBlockEnd="none">
        <Grid>
          <Grid.Column span={12}>
            <div className={styles.gridFrame}>
              <div className={styles.gridCell}>
                <Heading as="h3" size="6">
                  Correctness and capability
                </Heading>
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Correctness and capability matrix"
                  tabIndex={0}
                >
                  <table className={styles.matrix} role="table">
                    <caption className={styles.srOnly}>
                      Correctness and capability checks for each tool
                    </caption>
                    <thead role="rowgroup">
                      <tr role="row">
                        <th scope="col" role="columnheader">
                          Check
                        </th>
                        {matrixTools.map((tool) => (
                          <th key={tool.key} scope="col" role="columnheader">
                            <code>{tool.label}</code>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {matrix.map((row) => (
                        <tr key={row.label} role="row">
                          <th scope="row" role="rowheader">
                            {row.label}
                            {row.description ? (
                              <span className={styles.matrixDetail}>
                                {row.description}
                              </span>
                            ) : null}
                          </th>
                          {row.cells.map((cell, index) => (
                            <MatrixCellView
                              key={matrixTools[index].key}
                              cell={cell}
                              label={matrixTools[index].label}
                            />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Text as="p" size="100" variant="muted">
                  {matrixNote}
                </Text>
              </div>
            </div>
          </Grid.Column>
        </Grid>
      </Section>

      <Section paddingBlockStart="normal" paddingBlockEnd="none">
        <Grid>
          <Grid.Column span={12}>
            <div className={`${styles.gridFrame} ${styles.gridFrameTwoUp}`}>
              <div className={styles.gridCell}>
                <Heading as="h3" size="6">
                  Machine and versions
                </Heading>
                <Text as="p" size="200" variant="muted">
                  Measured {environment.date} on {environment.machine},{" "}
                  {environment.os}, Node.js {environment.node}. The host was
                  shared; these are workload-specific observations.
                </Text>
                {view.sourceUrl ? (
                  <Text as="p" size="200">
                    Source:{" "}
                    <a className={styles.inlineLink} href={view.sourceUrl}>
                      <code>{environment.sourceCommit.slice(0, 12)}</code>
                    </a>
                    . Runtime files and built artifacts are hashed in the raw
                    results.
                  </Text>
                ) : null}
                <Text as="p" size="200" font="monospace">
                  {environment.tools
                    .map((tool) => `${tool.name} ${tool.version}`)
                    .join(" · ")}
                </Text>
                <Text as="p" size="200" variant="muted">
                  Times are wall clock with process start-up included. Gronify
                  was built from the source commit above. Reported times use the{" "}
                  {environment.statistic} of the recorded trials. Runs still
                  going after {timeoutSeconds} s were killed.{" "}
                  <Link href={benchmarkUrl} size="small" arrowDirection="end">
                    Read the methodology and every result
                  </Link>
                  {" · "}
                  <a className={styles.inlineLink} href={view.rawResultsUrl}>
                    Raw trials and provenance
                  </a>
                </Text>
              </div>
              <div className={styles.gridCell}>
                <Heading as="h3" size="6">
                  Reproduce it
                </Heading>
                <Text as="p" size="200" variant="muted">
                  The script generates its own inputs, runs each tool, and
                  rewrites BENCHMARKS.md and the data behind this page. Run it
                  from src/packages/cli. The raw provenance records the source
                  commit, harness hash, and exact flags for this sweep. Any
                  comparison tool you have not installed is recorded as skipped.
                </Text>
                {reproduce}
              </div>
            </div>
          </Grid.Column>
        </Grid>
      </Section>
    </>
  );
}
