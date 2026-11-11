'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/buttons';
import { Select } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { toast } from '@/lib/toast';
import { RangePicker } from '@/features/reports/range-picker';
import { KpiTiles } from '@/features/reports/kpi-tiles';
import { RetrievalChart } from '@/features/reports/retrieval-chart';
import { ThroughputChart } from '@/features/reports/throughput-chart';
import { TipsChart } from '@/features/reports/tips-chart';
import { DamageChart } from '@/features/reports/damage-chart';
import { VenueComparisonTable, buildComparisonRows } from '@/features/reports/venue-comparison-table';
import { downloadCsv, comparisonRowsToCsv } from '@/features/reports/export-csv';
import { useAnalyticsSummary } from '@/features/reports/use-analytics-summary';
import { useMetricsSeries } from '@/features/reports/use-metrics-series';
import { RANGE_PRESETS, type DateRange } from '@/features/reports/date-range';

const ALL_VENUES = '__all__';

/**
 * Reports (Task 7 brief): range-picker-driven KPI tiles + trend charts + a sortable per-venue
 * comparison table + CSV export. Every read here goes through `analyticsSummary` (KPI tiles/venue
 * comparison/CSV) or a direct read of already-aggregated `metrics/daily/days/*` rollup docs (trend
 * charts, via `useMetricsSeries`) — never raw `tickets`, satisfying the Global Constraint by
 * construction for every range length, not just >7 days (see `use-metrics-series.ts`'s own comment).
 */
export default function ReportsPage() {
  const { claims, operator } = useSession();
  const operatorId = claims?.operatorId;
  const timezone = operator?.timezone ?? 'America/Indiana/Indianapolis';
  const currency = operator?.currency ?? 'USD';

  const [range, setRange] = useState<DateRange>(() => RANGE_PRESETS.find((p) => p.key === '30d')!.range(timezone));
  const [venueId, setVenueId] = useState<string>(ALL_VENUES);

  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const summaryInput = operatorId ? { from: range.from, to: range.to, ...(venueId !== ALL_VENUES ? { venueId } : {}) } : undefined;
  const { data: summary, loading: summaryLoading } = useAnalyticsSummary(summaryInput);
  const { days, loading: seriesLoading } = useMetricsSeries(operatorId, range.from, range.to);

  const comparisonRows = useMemo(() => (summary ? buildComparisonRows(venues, summary.venues) : []), [venues, summary]);

  const exportCsv = () => {
    if (comparisonRows.length === 0) {
      toast.info('No results to export yet.');
      return;
    }
    downloadCsv(comparisonRowsToCsv(comparisonRows, currency), `reports-${range.from}_${range.to}.csv`);
  };

  if (!operatorId || !operator) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Operational performance across your venues."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/reports/forecast">
              <Button variant="secondary">Staffing forecast</Button>
            </Link>
            <Button variant="secondary" onClick={exportCsv} disabled={comparisonRows.length === 0}>
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <RangePicker value={range} onChange={setRange} timezone={timezone} />
        <Select
          label="Venue"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          options={[{ value: ALL_VENUES, label: 'All venues' }, ...venues.map((v) => ({ value: v.id, label: v.name }))]}
          disabled={venuesLoading}
          wrapperClassName="w-full sm:w-64"
        />
      </div>

      {summary && <KpiTiles current={summary.operator} previous={summary.previousPeriod.operator} currency={currency} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RetrievalChart days={days} venueId={venueId === ALL_VENUES ? undefined : venueId} loading={seriesLoading} />
        <ThroughputChart days={days} venueId={venueId === ALL_VENUES ? undefined : venueId} loading={seriesLoading} />
        <TipsChart days={days} venueId={venueId === ALL_VENUES ? undefined : venueId} currency={currency} loading={seriesLoading} />
        <DamageChart days={days} venueId={venueId === ALL_VENUES ? undefined : venueId} loading={seriesLoading} />
      </div>

      <div className="space-y-3">
        <SectionTitle title="Venue comparison" />
        {summaryLoading ? (
          <Text size="sm" color="tertiary">
            Loading…
          </Text>
        ) : summary ? (
          <VenueComparisonTable venues={venues} venuesData={summary.venues} currency={currency} />
        ) : null}
      </div>
    </div>
  );
}
