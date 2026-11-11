import { describe, expect, it } from 'vitest';
import { METRIC_DEFINITIONS } from '@goldstar/platform';
import { comparisonRowsToCsv } from '../export-csv';
import type { VenueMetricsSummary } from '../metric-value';

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 10, retrievalP50: 200, retrievalP90: 400, throughputPerAttendantHour: 2,
    tips: 1000, avgTip: 100, tipRate: 50, revenue: 15000, damageReports: 1, claims: 0, laborCostPerVehicle: 300, laborCostTotal: 3000, platformFees: 50, refundedTotal: 0,
    driveHome: { jobs: 0, completionSec: null, chaseUtilization: null }, rides: { jobs: 0 },
    credentialCompliance: null, offlineSyncSuccess: null,
    ...over,
  };
}

describe('comparisonRowsToCsv', () => {
  it('emits a header row with "Venue" + every METRIC_DEFINITIONS label (a label containing a comma, e.g. "Claims per 1,000 vehicles", is correctly CSV-quoted)', () => {
    const csv = comparisonRowsToCsv([], 'USD');
    const header = csv.split('\r\n')[0]!;
    expect(header.startsWith('Venue,Retrieval time (p50),Retrieval time (p90),Vehicles,')).toBe(true);
    expect(header).toContain('"Claims per 1,000 vehicles"');
    expect(header.split(',')).toHaveLength(1 + METRIC_DEFINITIONS.length + 1); // +1: the quoted comma-containing label splits into 2 fields on a naive split
  });

  it('emits one data row per venue with formatted values', () => {
    const csv = comparisonRowsToCsv([{ venueId: 'v1', venueName: 'St. Elmo', metrics: vm({ tickets: 5, revenue: 15000 }) }], 'USD');
    const rows = csv.split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('St. Elmo');
    expect(rows[1]).toContain('$150.00');
  });

  it('quotes a venue name containing a comma', () => {
    const csv = comparisonRowsToCsv([{ venueId: 'v1', venueName: 'St. Elmo, Downtown', metrics: vm() }], 'USD');
    expect(csv.split('\r\n')[1]).toMatch(/^"St\. Elmo, Downtown"/);
  });

  it('renders a null metric as an em dash in the CSV, never a blank/NaN cell', () => {
    const csv = comparisonRowsToCsv([{ venueId: 'v1', venueName: 'V1', metrics: vm({ retrievalP50: null }) }], 'USD');
    expect(csv.split('\r\n')[1]).toContain('—');
  });
});
