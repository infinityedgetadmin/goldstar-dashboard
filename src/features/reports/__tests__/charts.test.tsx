import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MetricsDaily, VenueMetrics } from '@goldstar/platform';
import { RetrievalChart } from '../retrieval-chart';
import { ThroughputChart } from '../throughput-chart';
import { TipsChart } from '../tips-chart';
import { DamageChart } from '../damage-chart';

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

const DAYS: Pick<MetricsDaily, 'day' | 'venues' | 'operator'>[] = [{ day: '2026-08-01', venues: { v1: vm() }, operator: vm() }];

describe('report trend charts', () => {
  it('RetrievalChart renders its title and, with no data, the empty state (not a crash)', () => {
    render(<RetrievalChart days={[]} />);
    expect(screen.getByText('Retrieval time')).toBeInTheDocument();
    expect(screen.getByText('No data for this range')).toBeInTheDocument();
  });

  it('ThroughputChart shows a loading state instead of the empty state while fetching', () => {
    render(<ThroughputChart days={[]} loading />);
    expect(screen.getByText('Throughput / attendant-hour')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No data for this range')).toBeNull();
  });

  it('TipsChart renders without crashing once real data is present', () => {
    render(<TipsChart days={DAYS} currency="USD" />);
    expect(screen.getByText('Tips')).toBeInTheDocument();
    expect(screen.queryByText('No data for this range')).toBeNull();
  });

  it('DamageChart renders without crashing once real data is present', () => {
    render(<DamageChart days={DAYS} />);
    expect(screen.getByText('Damage & claims')).toBeInTheDocument();
    expect(screen.queryByText('No data for this range')).toBeNull();
  });
});
