import { describe, expect, it } from 'vitest';
import { deltaPercent, formatMetricValue, metricValue, type VenueMetricsSummary } from '../metric-value';

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 10, retrievalP50: 300, retrievalP90: 600, throughputPerAttendantHour: 2.5,
    tips: 5000, avgTip: 500, tipRate: 40, revenue: 15000, damageReports: 1, claims: 2, laborCostPerVehicle: 1200, laborCostTotal: 12000, platformFees: 200, refundedTotal: 0,
    driveHome: { jobs: 3, completionSec: 900, chaseUtilization: 60 }, rides: { jobs: 4 },
    credentialCompliance: 90, offlineSyncSuccess: 95,
    ...over,
  };
}

describe('metricValue', () => {
  it('reads every direct field exactly', () => {
    const m = vm();
    expect(metricValue('tickets', m)).toBe(10);
    expect(metricValue('retrievalP50', m)).toBe(300);
    expect(metricValue('retrievalP90', m)).toBe(600);
    expect(metricValue('throughputPerAttendantHour', m)).toBe(2.5);
    expect(metricValue('tipRate', m)).toBe(40);
    expect(metricValue('avgTip', m)).toBe(500);
    expect(metricValue('tips', m)).toBe(5000);
    expect(metricValue('revenue', m)).toBe(15000);
    expect(metricValue('damageReports', m)).toBe(1);
    expect(metricValue('laborCostPerVehicle', m)).toBe(1200);
    expect(metricValue('credentialCompliance', m)).toBe(90);
    expect(metricValue('offlineSyncSuccess', m)).toBe(95);
  });

  it('reads the three fields nested under driveHome/rides', () => {
    const m = vm();
    expect(metricValue('driveHomeJobs', m)).toBe(3);
    expect(metricValue('driveHomeCompletionSec', m)).toBe(900);
    expect(metricValue('chaseUtilization', m)).toBe(60);
    expect(metricValue('rides', m)).toBe(4);
  });

  it('derives claimsPer1000 from claims/tickets, and is null (not 0) when tickets is 0', () => {
    expect(metricValue('claimsPer1000', vm({ tickets: 10, claims: 2 }))).toBe(200); // 2/10 * 1000
    expect(metricValue('claimsPer1000', vm({ tickets: 0, claims: 0 }))).toBeNull();
  });
});

describe('formatMetricValue', () => {
  it('formats money in cents to a dollar string', () => {
    expect(formatMetricValue('revenue', 15000, 'USD')).toBe('$150.00');
  });
  it('formats a percent with one decimal', () => {
    expect(formatMetricValue('tipRate', 40.5, 'USD')).toBe('40.5%');
  });
  it('formats seconds as m/s, and pure seconds under a minute', () => {
    expect(formatMetricValue('retrievalP50', 125, 'USD')).toBe('2m 5s');
    expect(formatMetricValue('driveHomeCompletionSec', 45, 'USD')).toBe('45s');
  });
  it('formats a ratio to two decimals', () => {
    expect(formatMetricValue('throughputPerAttendantHour', 2.5, 'USD')).toBe('2.50');
  });
  it('formats a count as a rounded, comma-grouped integer', () => {
    expect(formatMetricValue('tickets', 1234, 'USD')).toBe('1,234');
  });
  it('renders null as an em dash, never 0 or NaN', () => {
    expect(formatMetricValue('retrievalP50', null, 'USD')).toBe('—');
  });
});

describe('deltaPercent', () => {
  it('computes a positive and a negative percent change', () => {
    expect(deltaPercent(120, 100)).toBe(20);
    expect(deltaPercent(80, 100)).toBe(-20);
  });
  it('is null when either side is null, or the baseline is zero', () => {
    expect(deltaPercent(null, 100)).toBeNull();
    expect(deltaPercent(100, null)).toBeNull();
    expect(deltaPercent(100, 0)).toBeNull();
  });
});
