import type { TerminalLine } from "./terminal";

/**
 * The shared layout of every 1200x630 share image: logo and badge on top, the
 * headline and summary in the middle, and an optional terminal snippet at the
 * bottom. It renders inside `ImageResponse`, which supports only flexbox and
 * inline styles, so every element with children sets `display: flex`.
 */
export const ogImageSize = {
  width: 1200,
  height: 630,
};

export const ogImageContentType = "image/png";

const colors = {
  background: "#0a0a0f",
  surface: "#101119",
  border: "#232533",
  text: "#f5f6fa",
  muted: "#9499ad",
};

/** Longest terminal line, in characters, that fits the card at 20px. */
const maxTerminalLineLength = 84;

function GronifyLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="339 399 347 226"
      width={43}
      height={28}
      fill={colors.text}
    >
      <path
        d="M0 0 C2.91286278 1.45643139 5.42505219 2.86796524 8.10546875 4.66015625 C9.31614014 5.46791504 9.31614014 5.46791504 10.55126953 6.29199219 C11.42122559 6.87625977 12.29118164 7.46052734 13.1875 8.0625 C14.0935498 8.66868164 14.99959961 9.27486328 15.93310547 9.89941406 C26.55915797 17.02183842 37.13046279 24.22537583 47.69775391 31.43457031 C49.45901273 32.63215161 51.22786304 33.81857536 53 35 C53 35.66 53 36.32 53 37 C51.19140625 38.3046875 51.19140625 38.3046875 48.5625 39.875 C43.57579202 42.95746062 38.77297111 46.22173617 34 49.625 C27.62181536 54.16138692 21.20758283 58.63975441 14.75 63.0625 C13.95207031 63.6105127 13.15414063 64.15852539 12.33203125 64.72314453 C11.20087891 65.49634033 11.20087891 65.49634033 10.046875 66.28515625 C9.38526367 66.73769775 8.72365234 67.19023926 8.04199219 67.65649414 C5.73801534 69.17236987 3.36490713 70.58105572 1 72 C1 63.75 1 55.5 1 47 C-96.35 47 -193.7 47 -294 47 C-294 39.74 -294 32.48 -294 25 C-196.98 25 -99.96 25 0 25 C0 16.75 0 8.5 0 0 Z"
        transform="translate(633,476)"
      />
      <path
        d="M0 0 C68.31 0 136.62 0 207 0 C207 6.93 207 13.86 207 21 C138.69 21 70.38 21 0 21 C0 14.07 0 7.14 0 0 Z"
        transform="translate(339,553)"
      />
      <path
        d="M0 0 C68.31 0 136.62 0 207 0 C207 6.93 207 13.86 207 21 C138.69 21 70.38 21 0 21 C0 14.07 0 7.14 0 0 Z"
        transform="translate(339,450)"
      />
      <path
        d="M0 0 C37.95 0 75.9 0 115 0 C115 6.93 115 13.86 115 21 C77.05 21 39.1 21 0 21 C0 14.07 0 7.14 0 0 Z"
        transform="translate(339,604)"
      />
      <path
        d="M0 0 C37.95 0 75.9 0 115 0 C115 6.93 115 13.86 115 21 C77.05 21 39.1 21 0 21 C0 14.07 0 7.14 0 0 Z"
        transform="translate(339,399)"
      />
    </svg>
  );
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Headline size that keeps one to three lines inside the card. */
function titleFontSize(title: string): number {
  if (title.length <= 44) return 58;
  if (title.length <= 64) return 52;
  return 44;
}

export type OgCardProps = {
  /** Short label in the top-right pill, such as "Guide". */
  badge: string;
  title: string;
  description: string;
  /** Terminal lines to show at the bottom; omitted when empty. */
  terminal?: TerminalLine[];
};

export function OgCard({ badge, title, description, terminal }: OgCardProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        backgroundColor: colors.background,
        color: colors.text,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <GronifyLogo />
          <span
            style={{
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Gronify
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 14px",
            borderRadius: "8px",
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            color: colors.muted,
            fontSize: 18,
          }}
        >
          {badge}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div
          style={{
            display: "flex",
            fontSize: titleFontSize(title),
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.08,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 25,
            color: colors.muted,
            lineHeight: 1.4,
            maxWidth: "980px",
          }}
        >
          {description}
        </div>
      </div>

      {terminal && terminal.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "7px",
            padding: "20px 28px",
            borderRadius: "12px",
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            fontSize: 20,
          }}
        >
          {terminal.map((line, index) =>
            line.kind === "command" ? (
              <div key={index} style={{ display: "flex", color: colors.text }}>
                <span style={{ color: colors.muted, marginRight: "10px" }}>
                  $
                </span>
                <span>{truncate(line.text, maxTerminalLineLength - 2)}</span>
              </div>
            ) : (
              <div key={index} style={{ display: "flex", color: colors.muted }}>
                {truncate(line.text, maxTerminalLineLength)}
              </div>
            ),
          )}
        </div>
      ) : (
        // Keeps the headline block centred when there is no snippet.
        <div style={{ display: "flex" }} />
      )}
    </div>
  );
}
