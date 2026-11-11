import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { VenuePnlTable } from '../venue-pnl-table';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';

function venue(id: string, name: string): Venue {
  return { id, operatorId: 'goldstar', name } as unknown as Venue;
}

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 10, retrievalP50: 300, retrievalP90: 400, throughputPerAttendantHour: 2,
    tips: 1000, avgTip: 100, tipRate: 50, revenue: 15000, damageReports: 0, claims: 0, laborCostPerVehicle: 300, laborCostTotal: 5000, platformFees: 500, refundedTotal: 0,
    driveHome: { jobs: 0, completionSec: null, chaseUtilization: null }, rides: { jobs: 0 },
    credentialCompliance: null, offlineSyncSuccess: null,
    ...over,
  };
}

describe('VenuePnlTable', () => {
  it('renders revenue/tips/labor/platform fees/refunded/net columns with the correct formatted values', () => {
    render(<VenuePnlTable venues={[venue('v1', 'St. Elmo')]} venuesData={{ v1: vm({ revenue: 15000, tips: 1000, laborCostTotal: 5000, platformFees: 500, refundedTotal: 700 }) }} currency="USD" />);
    expect(screen.getByText('St. Elmo')).toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument(); // revenue
    expect(screen.getByText('$10.00')).toBeInTheDocument(); // tips
    expect(screen.getByText('$50.00')).toBeInTheDocument(); // labor
    expect(screen.getByText('$5.00')).toBeInTheDocument(); // platform fees
    expect(screen.getByText('$7.00')).toBeInTheDocument(); // refunded
    expect(screen.getByText('$88.00')).toBeInTheDocument(); // net: 150-7-50-5
  });

  it('renders "No results found" with no venue data', () => {
    render(<VenuePnlTable venues={[venue('v1', 'St. Elmo')]} venuesData={{}} currency="USD" />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });
});
