import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortfolioTiles } from '../portfolio-tiles';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 240, retrievalP50: 300, retrievalP90: 400, throughputPerAttendantHour: 2,
    tips: 1000, avgTip: 100, tipRate: 50, revenue: 15000, damageReports: 0, claims: 0, laborCostPerVehicle: 300, laborCostTotal: 5000, platformFees: 50, refundedTotal: 0,
    driveHome: { jobs: 0, completionSec: null, chaseUtilization: null }, rides: { jobs: 0 },
    credentialCompliance: null, offlineSyncSuccess: null,
    ...over,
  };
}

describe('PortfolioTiles', () => {
  it('computes margin as revenue minus labor cost', () => {
    render(<PortfolioTiles operator={vm({ revenue: 15000, laborCostTotal: 5000 })} rangeDays={10} currency="USD" />);
    expect(screen.getByText('$150.00')).toBeInTheDocument(); // revenue
    expect(screen.getByText('$100.00')).toBeInTheDocument(); // margin: (15000-5000)/100
  });

  it('computes utilization as tickets per (rangeDays * 24) hours', () => {
    // 240 tickets over 10 days = 240 hours -> 1.00 ticket/venue-hour
    render(<PortfolioTiles operator={vm({ tickets: 240 })} rangeDays={10} currency="USD" />);
    expect(screen.getByText('1.00 / venue-hour')).toBeInTheDocument();
  });

  it('does not divide by zero when rangeDays is 0', () => {
    render(<PortfolioTiles operator={vm({ tickets: 5 })} rangeDays={0} currency="USD" />);
    expect(screen.getByText('0.00 / venue-hour')).toBeInTheDocument();
  });
});
