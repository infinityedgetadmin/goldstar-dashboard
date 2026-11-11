import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { GrowthSignals } from '../growth-signals';
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

describe('GrowthSignals', () => {
  it('shows the leading venue type for each signal', () => {
    render(
      <GrowthSignals
        venues={[venue('v1', 'hotel')]}
        current={{ v1: vm({ tips: 2000, retrievalP50: 100 }) }}
        previous={{ v1: vm({ tips: 1000, retrievalP50: 200 }) }}
      />,
    );
    // Both cards resolve to the same leading type ("Hotels") since only one venue has data here.
    expect(screen.getAllByText('Hotels')).toHaveLength(2);
    expect(screen.getByText(/\+100\.0% avg tips/)).toBeInTheDocument();
    expect(screen.getByText(/50\.0% faster retrieval/)).toBeInTheDocument();
  });

  it('shows an empty state when no venue has data in both periods', () => {
    render(<GrowthSignals venues={[venue('v1', 'hotel')]} current={{ v1: vm() }} previous={{}} />);
    expect(screen.getByText('No growth signal yet')).toBeInTheDocument();
  });
});
