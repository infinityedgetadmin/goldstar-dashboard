'use client';
import { useMemo } from 'react';
import { orderBy, where, type QueryConstraint } from 'firebase/firestore';
import type { MetricsDaily } from '@goldstar/platform';
import { useCollection } from '@/lib/firebase/hooks';

export interface UseMetricsSeriesResult {
  days: MetricsDaily[];
  loading: boolean;
}

/**
 * Live day-by-day rollup series for the trend charts — reads `operators/{op}/metrics/daily/days`
 * DIRECTLY (rules-permitted for manager+/venue_user: `firestore.rules`' `metrics/{kind}/days/{day}`
 * rule), never raw `tickets`. The Global Constraint ("never query >7 days of raw tickets
 * client-side; older = rollups via `analyticsSummary`") is satisfied by construction here, not by a
 * length check in this hook or the range picker — this reads pre-aggregated rollup docs for EVERY
 * range length, so there is no raw-ticket code path to gate in the first place (disclosed in
 * task-7-report.md). A single-field range+`orderBy` on `day` needs no composite index.
 */
export function useMetricsSeries(operatorId: string | undefined, from: string | undefined, to: string | undefined): UseMetricsSeriesResult {
  const constraints = useMemo<QueryConstraint[]>(() => (from && to ? [where('day', '>=', from), where('day', '<=', to), orderBy('day', 'asc')] : []), [from, to]);
  const { data, loading } = useCollection<MetricsDaily>(operatorId && from && to ? `operators/${operatorId}/metrics/daily/days` : undefined, constraints);
  return { days: data, loading };
}
