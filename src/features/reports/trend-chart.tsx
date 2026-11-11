'use client';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import type { ChartPoint } from './chart-data';

export interface TrendChartSeries {
  name: string;
  color: string;
}

export interface TrendChartProps {
  title: string;
  kind: 'line' | 'bar';
  points: ChartPoint[];
  series: TrendChartSeries[];
  loading?: boolean;
  /** Formats a raw numeric value for the tooltip/legend (e.g. cents -> `$X.XX`, seconds -> `Xm Ys`). */
  valueFormatter?: (value: number) => string;
}

/**
 * Shared line/bar trend chart shell behind `retrieval-chart.tsx`/`throughput-chart.tsx`/
 * `tips-chart.tsx`/`damage-chart.tsx` — those four files (the brief's named deliverables) each just
 * shape their own `ChartPoint[]` via `buildChartSeries` and pick a `kind`/series/colors; this file
 * owns the actual recharts wiring so it isn't duplicated four times. `connectNulls` on `<Line>` lets
 * a day with no data for one venue (see `chart-data.ts`'s own comment) show as a gap the line skips
 * over, rather than dropping to 0.
 */
export function TrendChart({ title, kind, points, series, loading, valueFormatter }: TrendChartProps) {
  // recharts' `Tooltip.formatter` returns a `[formattedValue, label]` tuple, not a bare string —
  // wraps `valueFormatter` (which only cares about the raw number) rather than an unsafe cast.
  const tooltipFormatter = valueFormatter ? ((value: number | string, name: string): [string, string] => [valueFormatter(Number(value)), name]) : undefined;
  return (
    <Card variant="elevated" padding="md">
      <CardHeader>
        <CardTitle as="h3">{title}</CardTitle>
      </CardHeader>
      {loading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : points.length === 0 ? (
        <EmptyState title="No data for this range" description="Pick a different date range to see this chart." />
      ) : (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'line' ? (
              <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={tooltipFormatter} />
                {series.length > 1 && <Legend />}
                {series.map((s) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            ) : (
              <BarChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={tooltipFormatter} />
                {series.length > 1 && <Legend />}
                {series.map((s) => (
                  <Bar key={s.name} dataKey={s.name} fill={s.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
