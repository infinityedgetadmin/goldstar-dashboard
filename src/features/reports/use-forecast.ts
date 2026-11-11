'use client';
import type { MetricsForecast } from '@goldstar/platform';
import { useDoc, type LiveDocResult } from '@/lib/firebase/hooks';

/** Live read of `operators/{op}/metrics/forecast/weeks/{isoWeek}` — rules-permitted for manager+
 * (`firestore.rules`' `metrics/forecast/weeks/{week}` rule), no callable wraps this doc (the brief
 * only specifies the scheduled `buildForecast` writer + this direct read path). */
export function useForecast(operatorId: string | undefined, isoWeek: string | undefined): LiveDocResult<MetricsForecast> {
  return useDoc<MetricsForecast>(operatorId && isoWeek ? `operators/${operatorId}/metrics/forecast/weeks/${isoWeek}` : undefined);
}
