import type { MetricKey, MetricsDaily } from '@goldstar/platform';
import { metricValue } from './metric-value';

// `day: string` plus arbitrary named number|null series values — a plain `{day:string} &
// Record<string, number|null>` intersection doesn't type-check (the index signature would also
// have to accept `day`'s own `string` value), so `day` is folded into the index signature's own
// union instead.
export interface ChartPoint {
  day: string;
  [seriesName: string]: number | string | null;
}

export interface SeriesSpec {
  /** The key under which this series' value lands on each `ChartPoint` (recharts `dataKey`). */
  name: string;
  metric: MetricKey;
}

/**
 * Maps a day-by-day rollup series (`useMetricsSeries`) into recharts-ready points, one or more
 * named series per day. `venueId` (when set) reads each day's `venues[venueId]` bucket instead of
 * the operator-wide aggregate — a day missing that venue entirely (the venue didn't exist yet, or
 * simply had no activity that day) contributes `null` for every series on that day, a gap in the
 * line rather than a misleading 0.
 */
export function buildChartSeries(days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[], venueId: string | undefined, series: SeriesSpec[]): ChartPoint[] {
  return days.map((d) => {
    const vm = venueId ? d.venues[venueId] : d.operator;
    const point: ChartPoint = { day: d.day };
    for (const s of series) point[s.name] = vm ? metricValue(s.metric, vm) : null;
    return point;
  });
}
