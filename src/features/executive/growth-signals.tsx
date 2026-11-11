import type { Venue } from '@goldstar/platform';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';
import { computeGrowthSignals, topByRetrievalImprovement, topByTipGrowth } from './growth-signals-math';

export interface GrowthSignalsProps {
  venues: Venue[];
  current: Record<string, VenueMetricsSummary>;
  previous: Record<string, VenueMetricsSummary>;
}

const VENUE_TYPE_LABEL: Record<string, string> = { restaurant: 'Restaurants', hotel: 'Hotels', event: 'Event venues', other: 'Other venues' };

/** Growth signals (Task 7 brief) — the venue type with the highest average tips growth, and the
 * one with the highest average retrieval-speed improvement, vs. the previous period. */
export function GrowthSignals({ venues, current, previous }: GrowthSignalsProps) {
  const signals = computeGrowthSignals(venues, current, previous);
  const topTips = topByTipGrowth(signals);
  const topRetrieval = topByRetrievalImprovement(signals);

  if (!topTips && !topRetrieval) {
    return <EmptyState title="No growth signal yet" description="Needs at least one venue with data in both this period and the previous one." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card variant="elevated" padding="md">
        <CardHeader>
          <CardTitle as="h3">Tips growth leader</CardTitle>
        </CardHeader>
        <CardContent>
          {topTips ? (
            <>
              <Text size="lg" weight="semibold">
                {VENUE_TYPE_LABEL[topTips.venueType] ?? topTips.venueType}
              </Text>
              <Text size="sm" color="secondary">
                {topTips.avgTipGrowthPct! >= 0 ? '+' : ''}
                {topTips.avgTipGrowthPct!.toFixed(1)}% avg tips vs. last period, across {topTips.venueCount} venue{topTips.venueCount === 1 ? '' : 's'}
              </Text>
            </>
          ) : (
            <Text size="sm" color="tertiary">
              Not enough data yet.
            </Text>
          )}
        </CardContent>
      </Card>
      <Card variant="elevated" padding="md">
        <CardHeader>
          <CardTitle as="h3">Retrieval improvement leader</CardTitle>
        </CardHeader>
        <CardContent>
          {topRetrieval ? (
            <>
              <Text size="lg" weight="semibold">
                {VENUE_TYPE_LABEL[topRetrieval.venueType] ?? topRetrieval.venueType}
              </Text>
              <Text size="sm" color="secondary">
                {topRetrieval.avgRetrievalImprovementPct!.toFixed(1)}% faster retrieval vs. last period, across {topRetrieval.venueCount} venue{topRetrieval.venueCount === 1 ? '' : 's'}
              </Text>
            </>
          ) : (
            <Text size="sm" color="tertiary">
              Not enough data yet.
            </Text>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
