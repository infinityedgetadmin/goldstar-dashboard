import type { MetricsDaily } from '@goldstar/platform';
import { buildChartSeries } from './chart-data';
import { TrendChart } from './trend-chart';

export interface DamageChartProps {
  days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[];
  venueId?: string;
  loading?: boolean;
}

/** Damage reports + claims opened per day, brand palette (warning-600 / error-600 — negative-outcome metrics). */
export function DamageChart({ days, venueId, loading }: DamageChartProps) {
  const points = buildChartSeries(days, venueId, [
    { name: 'Damage reports', metric: 'damageReports' },
    { name: 'Claims / 1,000', metric: 'claimsPer1000' },
  ]);
  return (
    <TrendChart
      title="Damage & claims"
      kind="bar"
      points={points}
      series={[
        { name: 'Damage reports', color: '#d97706' },
        { name: 'Claims / 1,000', color: '#dc2626' },
      ]}
      loading={loading}
      valueFormatter={(v) => v.toLocaleString()}
    />
  );
}
