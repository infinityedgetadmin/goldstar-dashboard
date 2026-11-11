import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/auth/session-provider';
import type { CallableOutput, Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';

type Summary = CallableOutput<'analyticsSummary'>;
let mockData: Summary | undefined;
let mockLoading = false;
const useAnalyticsSummaryMock = vi.fn(() => ({ data: mockData, loading: mockLoading }));
// Carry #44: the page reads the SERVER-SCOPED callable now, not `useMetricsSeries`'s operator-wide
// rollup documents. Mocking the callable hook is what lets these tests assert the scoping is
// requested — the filtering itself is the handler's, and has its own tests platform-side.
vi.mock('@/features/reports/use-analytics-summary', () => ({
  useAnalyticsSummary: (...args: unknown[]) => useAnalyticsSummaryMock(...(args as [])),
}));

// The real TrendChart is recharts; its own rendering is covered by the reports feature's tests.
// Here it only needs to surface what it was given.
vi.mock('@/features/reports/trend-chart', () => ({
  TrendChart: ({ title, points }: { title: string; points: { day: string; [k: string]: unknown }[] }) => (
    <div data-testid="trend-chart">
      {title}: {points.map((p) => `${p.day}=${String(p['Vehicles'])}`).join(',')}
    </div>
  ),
}));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

import { VenueReports, aggregateHourly } from '../venue-reports';

const GRILL = { id: 'v1', name: 'The Grill', operatorId: 'op1' } as unknown as Venue;

function day(dayStr: string, tickets: number, hourly: number[] = Array.from({ length: 24 }, () => 0)): Summary['days'][number] {
  return { day: dayStr, metrics: { tickets, tips: tickets * 100, retrievalP50: 200, retrievalP90: 400, hourly } } as unknown as Summary['days'][number];
}

/** What the scoped callable returns: `operator` IS this venue's aggregate on a venueId call. */
function summary(days: Summary['days'], over: { tickets?: number; tips?: number; retrievalP50?: number | null } = {}): Summary {
  const tickets = over.tickets ?? days.reduce((n, d) => n + d.metrics.tickets, 0);
  const tips = over.tips ?? days.reduce((n, d) => n + d.metrics.tips, 0);
  return {
    from: '2026-08-17', to: '2026-08-30',
    operator: { tickets, tips, retrievalP50: over.retrievalP50 === undefined ? 200 : over.retrievalP50 },
    venues: {}, previousPeriod: { from: '', to: '', operator: {}, venues: {} }, days,
  } as unknown as Summary;
}

function renderReports() {
  return render(
    <VenueProvider venues={[GRILL]}>
      <VenueReports />
    </VenueProvider>
  );
}

beforeEach(() => {
  mockData = undefined;
  mockLoading = false;
  useAnalyticsSummaryMock.mockClear();
  mockSession = {
    claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1'], claimsVersion: 1 },
    operator: { currency: 'USD' },
  } as unknown as Partial<Session>;
});

describe('aggregateHourly', () => {
  it('sums the venue hourly histograms across days and ignores other venues', () => {
    const h1 = Array.from({ length: 24 }, () => 0);
    h1[18] = 5;
    const h2 = Array.from({ length: 24 }, () => 0);
    h2[18] = 3;
    h2[12] = 2;
    const totals = aggregateHourly([day('2026-08-29', 5, h1), day('2026-08-30', 5, h2)]);
    expect(totals[18]).toBe(8);
    expect(totals[12]).toBe(2);
    expect(totals[0]).toBe(0);
  });

  it('always returns 24 slots, even for an empty series', () => {
    expect(aggregateHourly([])).toHaveLength(24);
    expect(aggregateHourly([day('2026-08-29', 5)])).toHaveLength(24);
  });
});

describe('VenueReports', () => {
  it('requests a 14-day window SCOPED TO THE VENUE (carry #44)', () => {
    renderReports();
    const [input] = useAnalyticsSummaryMock.mock.calls[0] as unknown as [{ from: string; to: string; venueId: string }];
    // The venueId is the whole fix: without it the callable returns the operator-wide aggregate,
    // and the handler refuses an unscoped call from a venue_user for exactly that reason.
    expect(input.venueId).toBe('v1');
    expect(input.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input.from < input.to || input.from === input.to).toBe(true);
  });

  it('TENANT: never asks for the operator-wide rollup at all', () => {
    // The page used to subscribe to `operators/{op}/metrics/daily/days`, which returns whole
    // documents containing every venue's bucket. Nothing here may reach that collection now —
    // asserted as "no venue-less call", since an unscoped request IS the operator-wide read.
    renderReports();
    for (const [input] of useAnalyticsSummaryMock.mock.calls as unknown as [{ venueId?: string } | undefined][]) {
      if (input) expect(input.venueId).toBe('v1');
    }
  });

  it('reads the tiles from the SERVER aggregate rather than re-summing client-side', () => {
    // `operator` is this venue's aggregate on a scoped call, so the page no longer runs its own
    // sum/average loop — which is also what stopped its arithmetic drifting from the operator page.
    mockData = summary([day('2026-08-29', 5), day('2026-08-30', 7)]);
    renderReports();
    expect(within(screen.getByText('Vehicles').parentElement as HTMLElement).getByText('12')).toBeInTheDocument();
    expect(within(screen.getByText('Tips').parentElement as HTMLElement).getByText('$12.00')).toBeInTheDocument();
  });

  it('feeds the vehicles-per-day chart from the venue bucket', () => {
    mockData = summary([day('2026-08-29', 5), day('2026-08-30', 7)]);
    renderReports();
    expect(screen.getByTestId('trend-chart')).toHaveTextContent('Vehicles per day: 2026-08-29=5,2026-08-30=7');
  });

  it('names the busiest hour from the aggregated histogram', () => {
    const h = Array.from({ length: 24 }, () => 0);
    h[18] = 9;
    mockData = summary([day('2026-08-30', 9, h)]);
    renderReports();
    expect(screen.getByText('Busiest around 6 PM.')).toBeInTheDocument();
  });

  it('shows the survey placeholder tile', () => {
    mockData = summary([day('2026-08-30', 1)]);
    renderReports();
    expect(screen.getByText('Survey score').parentElement).toHaveTextContent('—');
    expect(screen.getByText('Arrives with guest surveys')).toBeInTheDocument();
  });

  it('shows an empty state when no rollup days exist yet', () => {
    renderReports();
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
