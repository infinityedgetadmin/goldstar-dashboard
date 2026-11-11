import type { MetricsDaily } from '@goldstar/platform';
import { buildChartSeries } from './chart-data';
import { TrendChart } from './trend-chart';

export interface RetrievalChartProps {
  days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[];
  venueId?: string;
  loading?: boolean;
}

function formatSeconds(value: number): string {
  const total = Math.round(value);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Retrieval time trend (P50 + P90), brand palette (bronze primary-500 / gold accent-500). */
export function RetrievalChart({ days, venueId, loading }: RetrievalChartProps) {
  const points = buildChartSeries(days, venueId, [
    { name: 'P50', metric: 'retrievalP50' },
    { name: 'P90', metric: 'retrievalP90' },
  ]);
  return (
    <TrendChart
      title="Retrieval time"
      kind="line"
      points={points}
      series={[
        { name: 'P50', color: '#ab6034' },
        { name: 'P90', color: '#ffc30c' },
      ]}
      loading={loading}
      valueFormatter={formatSeconds}
    />
  );
}
