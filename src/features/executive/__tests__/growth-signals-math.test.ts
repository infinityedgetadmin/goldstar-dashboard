import { describe, expect, it } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { computeGrowthSignals, topByRetrievalImprovement, topByTipGrowth } from '../growth-signals-math';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';

function venue(id: string, type: Venue['type']): Venue {
  return { id, operatorId: 'goldstar', name: id, type } as unknown as Venue;
}

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 10, retrievalP50: 300, retrievalP90: 400, throughputPerAttendantHour: 2,
    tips: 1000, avgTip: 100, tipRate: 50, revenue: 5000, damageReports: 0, claims: 0, laborCostPerVehicle: 300, laborCostTotal: 3000, platformFees: 50, refundedTotal: 0,
    driveHome: { jobs: 0, completionSec: null, chaseUtilization: null }, rides: { jobs: 0 },
    credentialCompliance: null, offlineSyncSuccess: null,
    ...over,
  };
}

const VENUES: Venue[] = [venue('v1', 'restaurant'), venue('v2', 'restaurant'), venue('v3', 'hotel'), venue('v4', 'event')];

const CURRENT: Record<string, VenueMetricsSummary> = {
  v1: vm({ tips: 1200, retrievalP50: 240 }),
  v2: vm({ tips: 1100, retrievalP50: 300 }),
  v3: vm({ tips: 2000, retrievalP50: 100 }),
  // v4 deliberately has no `previous` entry (a venue created mid-range) -> excluded entirely.
};
const PREVIOUS: Record<string, VenueMetricsSummary> = {
  v1: vm({ tips: 1000, retrievalP50: 300 }),
  v2: vm({ tips: 1000, retrievalP50: 300 }),
  v3: vm({ tips: 1000, retrievalP50: 200 }),
};

describe('computeGrowthSignals', () => {
  it('averages tip growth and retrieval improvement per venue type, over venues present in BOTH periods', () => {
    const signals = computeGrowthSignals(VENUES, CURRENT, PREVIOUS);
    const restaurant = signals.find((s) => s.venueType === 'restaurant')!;
    const hotel = signals.find((s) => s.venueType === 'hotel')!;
    expect(restaurant.venueCount).toBe(2);
    expect(restaurant.avgTipGrowthPct).toBeCloseTo(15, 5); // (20% + 10%) / 2
    expect(restaurant.avgRetrievalImprovementPct).toBeCloseTo(10, 5); // (20% + 0%) / 2
    expect(hotel.venueCount).toBe(1);
    expect(hotel.avgTipGrowthPct).toBeCloseTo(100, 5); // 1000 -> 2000
    expect(hotel.avgRetrievalImprovementPct).toBeCloseTo(50, 5); // 200 -> 100, 50% faster
  });

  it('excludes a venue type entirely with zero venues present in both periods', () => {
    const signals = computeGrowthSignals(VENUES, CURRENT, PREVIOUS);
    expect(signals.find((s) => s.venueType === 'event')).toBeUndefined();
  });
});

describe('topByTipGrowth / topByRetrievalImprovement', () => {
  it('picks the venue type with the highest average in each signal', () => {
    const signals = computeGrowthSignals(VENUES, CURRENT, PREVIOUS);
    expect(topByTipGrowth(signals)?.venueType).toBe('hotel'); // 100% beats restaurant's 15%
    expect(topByRetrievalImprovement(signals)?.venueType).toBe('hotel'); // 50% beats restaurant's 10%
  });

  it('returns undefined when there are no signals at all', () => {
    expect(topByTipGrowth([])).toBeUndefined();
    expect(topByRetrievalImprovement([])).toBeUndefined();
  });
});
