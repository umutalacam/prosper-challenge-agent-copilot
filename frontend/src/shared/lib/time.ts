// Human time for the call log and the agent list: "34 minutes ago", "2:05". Pure; pass `now` in so
// callers (and tests) decide the clock.

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "long" });

/** Seconds per unit, largest first; a time is told in the largest unit that fits. */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/**
 * How long ago (or until) `date` is from `now`: "just now" within a minute, then
 * "34 minutes ago", "2 hours ago", "yesterday", "3 weeks ago"…
 */
export function formatRelative(date: Date, now: Date): string {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** A duration as a clock: "0:42", "2:05", "1:02:10". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
