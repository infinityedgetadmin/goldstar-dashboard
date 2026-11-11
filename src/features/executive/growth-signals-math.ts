import type { Venue } from '@goldstar/platform';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';

export interface GrowthSignal {
  venueType: string;
  /** Average % change in tips across venues of this type with data in both periods (positive = growth). */
  avgTipGrowthPct: number | null;
  /** Average % IMPROVEMENT in retrieval speed (positive = faster than the previous period; a
   * lower retrieval time is the improvement, so this is NOT the same sign convention as a plain
   * percent-change). */
  avgRetrievalImprovementPct: number | null;
  venueCount: number;
}

/** `(before - after) / before * 100` — positive when `after` is LOWER than `before` (faster
 * retrieval = an improvement), unlike a plain percent-change which would read faster-service as
 * negative. `null` when there's no baseline or either side is missing. */
function improvementPct(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before <= 0) return null;
  return ((before - after) / before) * 100;
}

function tipGrowthPct(before: number, after: number): number | null {
  if (before <= 0) return null;
  return ((after - before) / before) * 100;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Growth signals (Task 7 brief: "growth signals (venue types with highest tips/retrieval
 * improvements)") — groups venues by `Venue.type` and, for each type, averages the per-venue
 * tips-growth and retrieval-speed-improvement of every venue with data in BOTH `current` and
 * `previous` (a venue missing from either period contributes nothing to that type's average,
 * rather than skewing it with an assumed 0% change). Returned per-type, unsorted — callers pick the
 * "top" type themselves (`topByTipGrowth`/`topByRetrievalImprovement` below).
 */
export function computeGrowthSignals(venues: Venue[], current: Record<string, VenueMetricsSummary>, previous: Record<string, VenueMetricsSummary>): GrowthSignal[] {
  const byType = new Map<string, { tipGrowths: number[]; retrievalImprovements: number[]; count: number }>();
  for (const v of venues) {
    const cur = current[v.id];
    const prev = previous[v.id];
    if (!cur || !prev) continue;
    const entry = byType.get(v.type) ?? { tipGrowths: [], retrievalImprovements: [], count: 0 };
    entry.count++;
    const tipGrowth = tipGrowthPct(prev.tips, cur.tips);
    if (tipGrowth !== null) entry.tipGrowths.push(tipGrowth);
    const retrievalImprovement = improvementPct(prev.retrievalP50, cur.retrievalP50);
    if (retrievalImprovement !== null) entry.retrievalImprovements.push(retrievalImprovement);
    byType.set(v.type, entry);
  }
  return [...byType.entries()].map(([venueType, e]) => ({
    venueType,
    avgTipGrowthPct: mean(e.tipGrowths),
    avgRetrievalImprovementPct: mean(e.retrievalImprovements),
    venueCount: e.count,
  }));
}

/** The venue type with the highest average tip growth, ignoring types with no measurable growth (null). */
export function topByTipGrowth(signals: GrowthSignal[]): GrowthSignal | undefined {
  return signals.filter((s) => s.avgTipGrowthPct !== null).sort((a, b) => b.avgTipGrowthPct! - a.avgTipGrowthPct!)[0];
}

/** The venue type with the highest average retrieval-speed improvement, ignoring types with no measurable improvement (null). */
export function topByRetrievalImprovement(signals: GrowthSignal[]): GrowthSignal | undefined {
  return signals.filter((s) => s.avgRetrievalImprovementPct !== null).sort((a, b) => b.avgRetrievalImprovementPct! - a.avgRetrievalImprovementPct!)[0];
}
