export interface DateRange {
  from: string;
  to: string;
}

/** Today's calendar date (`YYYY-MM-DD`) in `tz` — matches the platform's own rollup day-bucketing
 * format, computed independently client-side (no shared library — see `goldstar-platform`'s
 * `rollup.ts` for the server-side equivalent this intentionally mirrors, just without needing the
 * full UTC-instant offset correction that requires, since a date-string add/subtract never crosses
 * a DST boundary the way an arbitrary UTC-instant conversion can). */
export function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Pure calendar-arithmetic day-string shift (`YYYY-MM-DD` +/- n days) — no timezone involved. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const MAX_CUSTOM_RANGE_DAYS = 366;

/** Whole-count of days between `from` and `to`, inclusive both ends (so `from === to` is 1 day). */
export function rangeDayCount(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

export interface RangePreset {
  key: string;
  label: string;
  range: (tz: string) => DateRange;
}

/** Preset ranges shown as one-click buttons — all bounded, all rollup-backed (see
 * `use-metrics-series.ts`'s own header comment on why no raw-ticket path exists to gate here). */
export const RANGE_PRESETS: RangePreset[] = [
  { key: 'today', label: 'Today', range: (tz) => { const t = todayInTz(tz); return { from: t, to: t }; } },
  { key: '7d', label: 'Last 7 days', range: (tz) => { const t = todayInTz(tz); return { from: addDays(t, -6), to: t }; } },
  { key: '30d', label: 'Last 30 days', range: (tz) => { const t = todayInTz(tz); return { from: addDays(t, -29), to: t }; } },
  { key: '90d', label: 'Last 90 days', range: (tz) => { const t = todayInTz(tz); return { from: addDays(t, -89), to: t }; } },
];

/** Which preset (if any) the current `range` exactly matches, for highlighting the active button. */
export function matchingPresetKey(range: DateRange, tz: string): string | undefined {
  return RANGE_PRESETS.find((p) => {
    const r = p.range(tz);
    return r.from === range.from && r.to === range.to;
  })?.key;
}
