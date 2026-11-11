'use client';
import { useState } from 'react';
import type { Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { SectionTitle } from '@/components/ui/section-title';
import { Text } from '@/components/ui/typography';
import { RangePicker } from '@/features/reports/range-picker';
import { useAnalyticsSummary } from '@/features/reports/use-analytics-summary';
import { useMetricsSeries } from '@/features/reports/use-metrics-series';
import { RANGE_PRESETS, rangeDayCount, type DateRange } from '@/features/reports/date-range';
import { PortfolioTiles } from '@/features/executive/portfolio-tiles';
import { VenuePnlTable } from '@/features/executive/venue-pnl-table';
import { LiabilityTrend } from '@/features/executive/liability-trend';
import { GrowthSignals } from '@/features/executive/growth-signals';

/** Executive (Task 7 brief): portfolio tiles, per-venue P&L, liability trend, growth signals — all
 * from `analyticsSummary` (current + previous period, per-venue breakdown) plus the same
 * rollup-backed day series the Reports charts use for the liability trend line. */
export default function ExecutivePage() {
  const { claims, operator } = useSession();
  const operatorId = claims?.operatorId;
  const timezone = operator?.timezone ?? 'America/Indiana/Indianapolis';
  const currency = operator?.currency ?? 'USD';

  const [range, setRange] = useState<DateRange>(() => RANGE_PRESETS.find((p) => p.key === '30d')!.range(timezone));

  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const { data: summary, loading: summaryLoading } = useAnalyticsSummary(operatorId ? { from: range.from, to: range.to } : undefined);
  const { days, loading: seriesLoading } = useMetricsSeries(operatorId, range.from, range.to);

  if (!operatorId || !operator) {
    return (
      <div className="space-y-6">
        <PageHeader title="Executive" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Executive" description="Portfolio performance across your venues." />
      <RangePicker value={range} onChange={setRange} timezone={timezone} />

      {summaryLoading || venuesLoading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : summary ? (
        <>
          <PortfolioTiles operator={summary.operator} rangeDays={rangeDayCount(range.from, range.to)} currency={currency} />

          <div className="space-y-3">
            <SectionTitle title="Venue P&L" />
            <VenuePnlTable venues={venues} venuesData={summary.venues} currency={currency} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LiabilityTrend days={days} loading={seriesLoading} />
            <div className="space-y-3">
              <SectionTitle title="Growth signals" />
              <GrowthSignals venues={venues} current={summary.venues} previous={summary.previousPeriod.venues} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
