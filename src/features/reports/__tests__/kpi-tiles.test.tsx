import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiTiles } from '../kpi-tiles';
import type { VenueMetricsSummary } from '../metric-value';

function vm(over: Partial<VenueMetricsSummary> = {}): VenueMetricsSummary {
  return {
    tickets: 100, retrievalP50: 300, retrievalP90: 600, throughputPerAttendantHour: 2.5,
    tips: 5000, avgTip: 500, tipRate: 40, revenue: 15000, damageReports: 1, claims: 2, laborCostPerVehicle: 1200, laborCostTotal: 12000, platformFees: 200, refundedTotal: 0,
    driveHome: { jobs: 3, completionSec: 900, chaseUtilization: 60 }, rides: { jobs: 4 },
    credentialCompliance: 90, offlineSyncSuccess: 95,
    ...over,
  };
}

describe('KpiTiles', () => {
  it('renders one tile per METRIC_DEFINITIONS entry with a formatted value', () => {
    render(<KpiTiles current={vm()} previous={vm()} currency="USD" />);
    expect(within(screen.getByTestId('kpi-tile-tickets')).getByText('Vehicles')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-tile-tickets')).getByText('100')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-tile-revenue')).getByText('Revenue')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-tile-revenue')).getByText('$150.00')).toBeInTheDocument(); // 15000 cents
  });

  it('shows an upward trend when the current value beats the previous period, scoped to that one tile', () => {
    render(<KpiTiles current={vm({ tickets: 120 })} previous={vm({ tickets: 100 })} currency="USD" />);
    const tile = within(screen.getByTestId('kpi-tile-tickets'));
    expect(tile.getByText('↑', { exact: false })).toBeInTheDocument();
    expect(tile.getByText('vs last period')).toBeInTheDocument();
    expect(tile.getByText(/20%/)).toBeInTheDocument();
  });

  it('shows a downward trend when the current value trails the previous period', () => {
    render(<KpiTiles current={vm({ tickets: 80 })} previous={vm({ tickets: 100 })} currency="USD" />);
    const tile = within(screen.getByTestId('kpi-tile-tickets'));
    expect(tile.getByText('↓', { exact: false })).toBeInTheDocument();
    expect(tile.getByText(/20%/)).toBeInTheDocument();
  });

  it('omits the trend on the one tile whose previous-period baseline is zero, without affecting other tiles', () => {
    render(<KpiTiles current={vm({ tickets: 10 })} previous={vm({ tickets: 0 })} currency="USD" />);
    // tickets' own previous is 0 -> no meaningful percent change -> no "vs last period" on THIS tile.
    expect(within(screen.getByTestId('kpi-tile-tickets')).queryByText('vs last period')).toBeNull();
    // every other metric is identical current vs. previous (0% change, real baseline) -> DOES show a trend.
    expect(within(screen.getByTestId('kpi-tile-revenue')).getByText('vs last period')).toBeInTheDocument();
  });

  it('renders a null metric (e.g. no retrieval data) as an em dash, not a trend or a crash', () => {
    render(<KpiTiles current={vm({ retrievalP50: null })} previous={vm({ retrievalP50: null })} currency="USD" />);
    const tile = within(screen.getByTestId('kpi-tile-retrievalP50'));
    expect(tile.getByText('—')).toBeInTheDocument();
    expect(tile.queryByText('vs last period')).toBeNull();
  });
});
