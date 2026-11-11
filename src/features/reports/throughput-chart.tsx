import type { MetricsDaily } from '@goldstar/platform';
import { buildChartSeries } from './chart-data';
import { TrendChart } from './trend-chart';

export interface ThroughputChartProps {
  days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[];
  venueId?: string;
  loading?: boolean;
}

/** Vehicles delivered per attendant clocked-hour, brand palette (gold accent-500). */
export function ThroughputChart({ days, venueId, loading }: ThroughputChartProps) {
  const points = buildChartSeries(days, venueId, [{ name: 'Throughput', metric: 'throughputPerAttendantHour' }]);
  return (
    <TrendChart
      title="Throughput / attendant-hour"
      kind="line"
      points={points}
      series={[{ name: 'Throughput', color: '#ffc30c' }]}
      loading={loading}
      valueFormatter={(v) => v.toFixed(2)}
    />
  );
}
