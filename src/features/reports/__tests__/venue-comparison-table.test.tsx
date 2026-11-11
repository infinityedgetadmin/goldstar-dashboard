import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { buildComparisonRows, VenueComparisonTable } from '../venue-comparison-table';
import type { VenueMetricsSummary } from '../metric-value';

function venue(id: string, name: string): Venue {
  return { id, operatorId: 'goldstar', name } as unknown as Venue;
}

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 10, retrievalP50: 200, retrievalP90: 400, throughputPerAttendantHour: 2,
    tips: 1000, avgTip: 100, tipRate: 50, revenue: 5000, damageReports: 1, claims: 0, laborCostPerVehicle: 300, laborCostTotal: 3000, platformFees: 50, refundedTotal: 0,
    driveHome: { jobs: 0, completionSec: null, chaseUtilization: null }, rides: { jobs: 0 },
    credentialCompliance: null, offlineSyncSuccess: null,
    ...over,
  };
}

describe('buildComparisonRows', () => {
  it('joins venues with their per-venue summary data', () => {
    const rows = buildComparisonRows([venue('v1', 'St. Elmo'), venue('v2', 'Second Venue')], { v1: vm({ tickets: 5 }), v2: vm({ tickets: 9 }) });
    expect(rows).toEqual([
      { venueId: 'v1', venueName: 'St. Elmo', metrics: vm({ tickets: 5 }) },
      { venueId: 'v2', venueName: 'Second Venue', metrics: vm({ tickets: 9 }) },
    ]);
  });

  it('drops a venue the summary has no data for entirely, rather than a row full of zeros', () => {
    const rows = buildComparisonRows([venue('v1', 'St. Elmo'), venue('v2', 'No Data Venue')], { v1: vm() });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.venueId).toBe('v1');
  });
});

describe('VenueComparisonTable', () => {
  it('renders a row per venue with formatted metric cells', () => {
    render(
      <VenueComparisonTable
        venues={[venue('v1', 'St. Elmo'), venue('v2', 'Second Venue')]}
        venuesData={{ v1: vm({ tickets: 5, revenue: 15000 }), v2: vm({ tickets: 9, revenue: 8000 }) }}
        currency="USD"
      />,
    );
    expect(screen.getByText('St. Elmo')).toBeInTheDocument();
    expect(screen.getByText('Second Venue')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
  });

  it('renders "No results found" when no venue has data for the selected range', () => {
    render(<VenueComparisonTable venues={[venue('v1', 'St. Elmo')]} venuesData={{}} currency="USD" />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });
});
