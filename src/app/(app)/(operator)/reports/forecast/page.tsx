'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Venue } from '@goldstar/platform';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { SectionTitle } from '@/components/ui/section-title';
import { Select } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { todayInTz } from '@/features/reports/date-range';
import { isoWeekString } from '@/features/reports/iso-week';
import { useForecast } from '@/features/reports/use-forecast';
import { ForecastHeatmap } from '@/features/reports/forecast-heatmap';
import { StaffingTable } from '@/features/reports/staffing-table';

/** Staffing forecast (Task 7 brief): a 7x24 heatmap + staffing-suggestion table for the CURRENT
 * ISO week, per venue, read directly from `metrics/forecast/weeks/{isoWeek}` (rules-permitted for
 * manager+ — no callable wraps this doc; the weekly `buildForecast` sweep is its only writer). */
export default function ForecastPage() {
  const { claims, operator } = useSession();
  const operatorId = claims?.operatorId;
  const timezone = operator?.timezone ?? 'America/Indiana/Indianapolis';
  const isoWeek = isoWeekString(todayInTz(timezone));

  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const [venueId, setVenueId] = useState<string>();
  const activeVenueId = venueId ?? venues[0]?.id;

  const { data: forecast, loading: forecastLoading } = useForecast(operatorId, isoWeek);
  const venueForecast = activeVenueId ? forecast?.venues[activeVenueId] : undefined;

  if (!operatorId || !operator) {
    return (
      <div className="space-y-6">
        <PageHeader title="Staffing forecast" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-body-sm text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to reports
        </Link>
      </div>
      <PageHeader title="Staffing forecast" description={`4-week moving average, week ${isoWeek}. Recomputed weekly from ${forecast?.weeksAveraged ?? 0} week(s) of history.`} />

      <Select
        label="Venue"
        value={activeVenueId ?? ''}
        onChange={(e) => setVenueId(e.target.value)}
        options={venues.map((v) => ({ value: v.id, label: v.name }))}
        disabled={venuesLoading || venues.length === 0}
        wrapperClassName="w-full sm:w-64"
      />

      {venuesLoading || forecastLoading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : venueForecast ? (
        <>
          <div className="space-y-3">
            <SectionTitle title="Expected request volume" />
            <ForecastHeatmap forecast={venueForecast} />
          </div>
          <div className="space-y-3">
            <SectionTitle title="Suggested attendants" />
            <StaffingTable forecast={venueForecast} />
          </div>
        </>
      ) : (
        <Text size="sm" color="tertiary">
          No forecast yet for this venue — check back after the weekly forecast job has run at least once.
        </Text>
      )}
    </div>
  );
}
