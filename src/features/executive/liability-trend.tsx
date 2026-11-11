import type { MetricsDaily } from '@goldstar/platform';
import { buildChartSeries } from '@/features/reports/chart-data';
import { TrendChart } from '@/features/reports/trend-chart';

export interface LiabilityTrendProps {
  days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[];
  loading?: boolean;
}

/** Liability trend (Task 7 brief: "liability trend claims-per-1,000") — composes the same
 * `TrendChart`/`buildChartSeries` machinery the Reports charts use (DRY), portfolio-wide (no venue
 * filter — a liability signal is naturally read at the operator level first). */
export function LiabilityTrend({ days, loading }: LiabilityTrendProps) {
  const points = buildChartSeries(days, undefined, [{ name: 'Claims / 1,000 vehicles', metric: 'claimsPer1000' }]);
  return (
    <TrendChart
      title="Liability trend"
      kind="line"
      points={points}
      series={[{ name: 'Claims / 1,000 vehicles', color: '#dc2626' }]}
      loading={loading}
      valueFormatter={(v) => v.toFixed(1)}
    />
  );
}
