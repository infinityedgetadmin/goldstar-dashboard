'use client';
import { useEffect, useState } from 'react';
import type { CallableInput, CallableOutput } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';

const analyticsSummary = callable('analyticsSummary');

export interface UseAnalyticsSummaryResult {
  data: CallableOutput<'analyticsSummary'> | undefined;
  loading: boolean;
}

/**
 * Fetches `analyticsSummary` whenever `input` (the selected range/venue filter) changes — a
 * report-view-driven refetch, not a manual search trigger (contrast `use-cursor-search.ts`, which
 * exposes an explicit `search()` the caller invokes). `input === undefined` (operatorId not
 * resolved yet) skips the fetch entirely, matching `useCollection`/`useDoc`'s own "pass undefined to
 * skip" convention.
 */
export function useAnalyticsSummary(input: CallableInput<'analyticsSummary'> | undefined): UseAnalyticsSummaryResult {
  const [data, setData] = useState<CallableOutput<'analyticsSummary'>>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!input) return;
    let cancelled = false;
    setLoading(true);
    analyticsSummary(input)
      .then((out) => {
        if (!cancelled) setData(out);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Depends on the primitive fields, not `input` itself — a caller re-render that produces a
    // referentially-new but value-equal `input` object must not re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input?.from, input?.to, input?.venueId]);

  return { data, loading };
}
