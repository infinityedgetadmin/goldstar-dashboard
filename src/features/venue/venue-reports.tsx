'use client';
import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import type { CallableOutput, MetricsDaily } from '@goldstar/platform';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { useSession } from '@/features/auth/use-session';
import { buildChartSeries } from '@/features/reports/chart-data';
import { formatMetricValue } from '@/features/reports/metric-value';
import { TrendChart } from '@/features/reports/trend-chart';
import { useAnalyticsSummary } from '@/features/reports/use-analytics-summary';
import { formatMoney } from '@/lib/format';
import { daysAgoLocal, todayLocal } from '@/lib/local-date-range';
import { useVenue } from './venue-context';

const RANGE_DAYS = 14;
const HOUR_LABELS = ['12a', '', '', '3a', '', '', '6a', '', '', '9a', '', '', '12p', '', '', '3p', '', '', '6p', '', '', '9p', '', ''];

type SummaryDay = CallableOutput<'analyticsSummary'>['days'][number];

/**
 * Sums the 24-slot `hourly` histograms across the returned days — the histogram ALREADY exists on
 * every `metrics/daily` rollup (written by the platform's `rollup.ts`); this only reads it.
 * Exported for its own unit test.
 *
 * Carry #44: takes the SERVER-SCOPED per-day series now, not whole rollup documents plus a venueId
 * to pick out of them. The scoping moved to the server, so there is nothing left to pick.
 */
export function aggregateHourly(days: Pick<SummaryDay, 'metrics'>[]): number[] {
  const totals = Array.from({ length: 24 }, () => 0);
  for (const d of days) {
    d.metrics.hourly.forEach((n, i) => {
      if (i < 24) totals[i] += n;
    });
  }
  return totals;
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/**
 * Venue reports (Plan 7 Task 1b): the last 14 days of `metrics/daily` rollups, scoped to the
 * active venue's own `venues[venueId]` bucket — vehicles/day, a peak-hours heatmap from the
 * rollups' existing `hourly` histogram, average retrieval, and a survey-score placeholder
 * (guest surveys land in Plan 8).
 *
 * CARRY #44 — this page no longer reads the operator-wide rollup. It used to call
 * `useMetricsSeries`, which subscribes to `operators/{op}/metrics/daily/days` and returns whole
 * rollup DOCUMENTS; the page then picked `d.venues[venueId]` in the browser. Every other venue's
 * bucket and the operator-wide aggregate crossed the wire to one hotel's front desk, and no
 * client-side filter could change that — Firestore has no partial document read.
 *
 * It now calls `analyticsSummary` with `venueId`, which filters SERVER-side (contracts v0.4.6 added
 * the per-day series this page needs; the callable already scoped `operator`/`venues`). What
 * arrives is this venue's numbers and nothing else.
 *
 * DRY is preserved where it was real: `useAnalyticsSummary` is the operator reports feature's own
 * hook, and rendering still goes through the same `buildChartSeries`/`TrendChart`/
 * `formatMetricValue` machinery, so a number reads identically here and on the operator's page.
 * Fixed 14-day window rather than the operator page's range picker — a host wants "how's my stand
 * been lately", not an analyst tool; disclosed in task-1b-report.md.
 */
export function VenueReports() {
  const session = useSession();
  const { venue } = useVenue();
  const operatorId = session.claims?.operatorId;
  const currency = session.operator?.currency ?? 'USD';

  const from = daysAgoLocal(RANGE_DAYS - 1);
  const to = todayLocal();
  const venueId = venue?.id;
  // No venueId, no call: an UNSCOPED `analyticsSummary` returns the operator-wide aggregate, and
  // the handler refuses one from a venue_user for exactly that reason (carry #44). Waiting for the
  // venue is therefore correct rather than merely tidy.
  const { data, loading } = useAnalyticsSummary(operatorId && venueId ? { from, to, venueId } : undefined);
  const days = useMemo(() => data?.days ?? [], [data]);

  const points = useMemo(
    () =>
      // `venueId: undefined` deliberately: the series is ALREADY this venue's, so
      // `buildChartSeries` should read each entry's own metrics rather than index into a
      // per-venue map that no longer arrives. Same renderer, one scoping step earlier.
      buildChartSeries(
        days.map((d) => ({ day: d.day, operator: d.metrics, venues: {} }) as Pick<MetricsDaily, 'day' | 'venues' | 'operator'>),
        undefined,
        [{ name: 'Vehicles', metric: 'tickets' }]
      ),
    [days]
  );

  // The server already aggregated the period for this venue — `operator` IS the venue's aggregate
  // on a scoped call — so the hand-rolled sum/average loop this replaces is gone, and with it the
  // chance of this page's arithmetic drifting from the operator page's.
  const summary = useMemo(
    () => ({
      vehicles: data?.operator.tickets ?? 0,
      tips: data?.operator.tips ?? 0,
      retrievalP50: data?.operator.retrievalP50 ?? null,
    }),
    [data]
  );

  const hourly = useMemo(() => aggregateHourly(days), [days]);
  const hourlyMax = Math.max(1, ...hourly);
  const busiestHour = hourly.length > 0 && Math.max(...hourly) > 0 ? hourly.indexOf(Math.max(...hourly)) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={venue ? `${venue.name} — the last ${RANGE_DAYS} days.` : `The last ${RANGE_DAYS} days.`}
      />

      {!loading && days.length === 0 ? (
        <EmptyState icon={<BarChart3 />} title="No activity yet" description="Reports fill in after your venue's first day of valet activity." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Vehicles" value={loading ? '…' : summary.vehicles} subtitle={`Last ${RANGE_DAYS} days`} />
            <StatTile
              label="Avg retrieval (p50)"
              value={loading ? '…' : formatMetricValue('retrievalP50', summary.retrievalP50, currency)}
              subtitle="Daily median, averaged"
            />
            <StatTile label="Tips" value={loading ? '…' : formatMoney(summary.tips, currency)} subtitle={`Last ${RANGE_DAYS} days`} />
            <StatTile label="Survey score" value="—" subtitle="Arrives with guest surveys" />
          </div>

          <TrendChart title="Vehicles per day" kind="bar" points={points} series={[{ name: 'Vehicles', color: '#ffc30c' }]} loading={loading} />

          <Card variant="elevated" padding="md">
            <CardHeader>
              <CardTitle>Peak hours</CardTitle>
              <CardDescription>
                {busiestHour !== null ? `Busiest around ${hourLabel(busiestHour)}.` : 'Check-ins by hour of day.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid items-end gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }} role="img" aria-label="Check-ins by hour of day">
                {hourly.map((count, hour) => (
                  <div key={hour} className="flex flex-col items-center gap-1">
                    <div
                      title={`${hourLabel(hour)}: ${count} check-in${count === 1 ? '' : 's'}`}
                      className="w-full rounded-sm bg-primary-500"
                      style={{ height: `${Math.max(4, Math.round((count / hourlyMax) * 64))}px`, opacity: count === 0 ? 0.15 : 0.35 + 0.65 * (count / hourlyMax) }}
                    />
                    <Text as="span" size="xs" color="tertiary">
                      {HOUR_LABELS[hour]}
                    </Text>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
