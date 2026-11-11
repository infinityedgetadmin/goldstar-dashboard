import { describe, expect, it } from 'vitest';
import type { MetricsDaily, VenueMetrics } from '@goldstar/platform';
import { buildChartSeries } from '../chart-data';

function vm(over: Partial<VenueMetrics> = {}): VenueMetrics {
  return {
    tickets: 10, retrievalP50: 200, retrievalP90: 400, throughputPerAttendantHour: 2,
    tips: 1000, avgTip: 100, tipRate: 50, revenue: 5000, damageReports: 1, claims: 0, laborCostPerVehicle: 300, laborCostTotal: 3000, platformFees: 50, refundedTotal: 0,
    hourly: Array.from({ length: 24 }, () => 0),
    driveHome: { jobs: 0, completionSec: null, chaseUtilization: null }, rides: { jobs: 0 },
    credentialCompliance: null, offlineSyncSuccess: null,
    ...over,
  };
}

describe('buildChartSeries', () => {
  it('maps each day to a point, reading the OPERATOR bucket when no venueId is given', () => {
    const days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[] = [
      { day: '2026-08-01', venues: { v1: vm({ retrievalP50: 100 }) }, operator: vm({ retrievalP50: 200 }) },
      { day: '2026-08-02', venues: { v1: vm({ retrievalP50: 300 }) }, operator: vm({ retrievalP50: 400 }) },
    ];
    const points = buildChartSeries(days, undefined, [{ name: 'P50', metric: 'retrievalP50' }]);
    expect(points).toEqual([
      { day: '2026-08-01', P50: 200 },
      { day: '2026-08-02', P50: 400 },
    ]);
  });

  it('reads the specific venue bucket when venueId is given', () => {
    const days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[] = [
      { day: '2026-08-01', venues: { v1: vm({ retrievalP50: 100 }) }, operator: vm({ retrievalP50: 999 }) },
    ];
    const points = buildChartSeries(days, 'v1', [{ name: 'P50', metric: 'retrievalP50' }]);
    expect(points).toEqual([{ day: '2026-08-01', P50: 100 }]);
  });

  it('a day missing the requested venue entirely contributes null for every series (a gap, not a 0)', () => {
    const days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[] = [{ day: '2026-08-01', venues: {}, operator: vm() }];
    const points = buildChartSeries(days, 'v1', [{ name: 'P50', metric: 'retrievalP50' }, { name: 'P90', metric: 'retrievalP90' }]);
    expect(points).toEqual([{ day: '2026-08-01', P50: null, P90: null }]);
  });

  it('builds multiple named series per day (e.g. P50 and P90 on the same point)', () => {
    const days: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[] = [
      { day: '2026-08-01', venues: {}, operator: vm({ retrievalP50: 200, retrievalP90: 400 }) },
    ];
    const points = buildChartSeries(days, undefined, [{ name: 'P50', metric: 'retrievalP50' }, { name: 'P90', metric: 'retrievalP90' }]);
    expect(points).toEqual([{ day: '2026-08-01', P50: 200, P90: 400 }]);
  });

  it('an empty day series maps to an empty point list', () => {
    expect(buildChartSeries([], undefined, [{ name: 'P50', metric: 'retrievalP50' }])).toEqual([]);
  });
});
