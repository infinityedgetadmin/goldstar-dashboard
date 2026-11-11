import { describe, expect, it } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { buildPnlRows, pnlRow } from '../pnl';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 10, retrievalP50: 200, retrievalP90: 400, throughputPerAttendantHour: 2,
    tips: 1000, avgTip: 100, tipRate: 50, revenue: 15000, damageReports: 1, claims: 0, laborCostPerVehicle: 300, laborCostTotal: 8000, platformFees: 500, refundedTotal: 0,
    driveHome: { jobs: 0, completionSec: null, chaseUtilization: null }, rides: { jobs: 0 },
    credentialCompliance: null, offlineSyncSuccess: null,
    ...over,
  };
}

function venue(id: string, name: string): Venue {
  return { id, operatorId: 'goldstar', name } as unknown as Venue;
}

describe('pnlRow', () => {
  it('computes net as revenue minus refunded minus labor minus platform fees, excluding tips', () => {
    const row = pnlRow('v1', 'St. Elmo', vm({ revenue: 15000, tips: 1000, laborCostTotal: 8000, platformFees: 500, refundedTotal: 0 }));
    expect(row).toEqual({ venueId: 'v1', venueName: 'St. Elmo', revenue: 15000, tips: 1000, labor: 8000, platformFees: 500, refunded: 0, net: 6500 });
  });

  it('Plan 8 Task 5: a partial refund reduces net by exactly its amount and is shown as its own figure', () => {
    // Before contracts v0.4.9 there was no refundedTotal, so a $4.00 partial refund on this venue
    // left net at 6500 — inflated by the full 400 with nothing on the row to show it.
    const row = pnlRow('v1', 'St. Elmo', vm({ revenue: 15000, tips: 1000, laborCostTotal: 8000, platformFees: 500, refundedTotal: 400 }));
    expect(row.refunded).toBe(400);
    expect(row.net).toBe(6100);
  });

  it('allows a negative net (a venue running at a loss for the range)', () => {
    const row = pnlRow('v1', 'St. Elmo', vm({ revenue: 5000, laborCostTotal: 8000, platformFees: 500, refundedTotal: 0 }));
    expect(row.net).toBe(-3500);
  });
});

describe('buildPnlRows', () => {
  it('joins venues with their summary data and drops a venue with no data', () => {
    const rows = buildPnlRows([venue('v1', 'St. Elmo'), venue('v2', 'No Data')], { v1: vm() });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.venueId).toBe('v1');
  });
});
