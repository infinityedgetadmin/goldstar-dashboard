import type { MetricsDaily } from '@goldstar/platform';
import { formatMoney } from '@/lib/format';
import { buildChartSeries } from './chart-data';
import { TrendChart } from './trend-chart';

export interface TipsChartProps {
  days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[];
  venueId?: string;
  currency: string;
  loading?: boolean;
}

/** Digital tips collected per day, brand palette (success-600 — money-positive metric). */
export function TipsChart({ days, venueId, currency, loading }: TipsChartProps) {
  const points = buildChartSeries(days, venueId, [{ name: 'Tips', metric: 'tips' }]);
  return (
    <TrendChart
      title="Tips"
      kind="bar"
      points={points}
      series={[{ name: 'Tips', color: '#16a34a' }]}
      loading={loading}
      valueFormatter={(v) => formatMoney(Math.round(v), currency)}
    />
  );
}
