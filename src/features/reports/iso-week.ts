/**
 * ISO-8601 week string (`YYYY-Www`) for a calendar date — duplicated from `goldstar-platform`'s
 * `functions/src/modules/analytics/forecast.ts` (same algorithm, same ground-truth-verified test
 * values) rather than shared, since that implementation lives in Functions code (not the
 * `@goldstar/platform` contracts package this repo vendors) and this is ~10 lines of pure,
 * self-contained calendar math — not worth a contracts package change to share. Disclosed in
 * task-7-report.md. Needed here so the forecast page knows WHICH `metrics/forecast/weeks/{isoWeek}`
 * doc to read for "this week".
 */
export function isoWeekString(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoDayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - isoDayNum + 3); // Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstIsoDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstIsoDayNum + 3);
  const weekNum = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
