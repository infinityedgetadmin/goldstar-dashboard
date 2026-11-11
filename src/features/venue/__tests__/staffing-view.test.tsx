import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/auth/session-provider';
import type { Shift, Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';

vi.mock('firebase/firestore', () => ({
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir?: string) => ({ type: 'orderBy', field, dir: dir ?? 'asc' }),
  limit: (n: number) => ({ type: 'limit', n }),
}));

let mockData: Shift[] = [];
let mockLoading = false;
let mockError: Error | null = null;
const useCollectionMock = vi.fn(() => ({ data: mockData, loading: mockLoading, error: mockError }));
vi.mock('@/lib/firebase/hooks', () => ({
  useCollection: (...args: unknown[]) => useCollectionMock(...(args as [])),
}));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

import { StaffingView, coverageSummary } from '../staffing-view';

const GRILL = { id: 'v1', name: 'The Grill', operatorId: 'op1' } as unknown as Venue;

function shift(over: Partial<Shift> & { id: string }): Shift {
  return {
    operatorId: 'op1',
    venueId: 'v1',
    date: '2026-09-01',
    startsAt: '2026-09-01T21:00:00.000Z',
    endsAt: '2026-09-02T03:00:00.000Z',
    status: 'planned',
    assignments: [
      { uid: 'u1', role: 'lead', startsAt: '2026-09-01T21:00:00.000Z', endsAt: '2026-09-02T03:00:00.000Z', confirmed: true },
      { uid: 'u2', role: 'attendant', startsAt: '2026-09-01T21:00:00.000Z', endsAt: '2026-09-02T03:00:00.000Z', confirmed: false },
      { uid: 'u3', role: 'attendant', startsAt: '2026-09-01T21:00:00.000Z', endsAt: '2026-09-02T03:00:00.000Z', confirmed: true },
    ],
    notes: '',
    assignedUids: ['u1', 'u2', 'u3'],
    source: { provider: 'internal' },
    ...over,
  } as unknown as Shift;
}

function renderStaffing() {
  return render(
    <VenueProvider venues={[GRILL]}>
      <StaffingView />
    </VenueProvider>
  );
}

beforeEach(() => {
  mockData = [];
  mockLoading = false;
  mockError = null;
  useCollectionMock.mockClear();
  mockSession = { claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1'], claimsVersion: 1 } } as unknown as Partial<Session>;
});

describe('coverageSummary', () => {
  it('counts assignments per role', () => {
    expect(coverageSummary(shift({ id: 's1' }).assignments)).toBe('1 lead · 2 attendants');
  });
  it('handles an unstaffed shift', () => {
    expect(coverageSummary([])).toBe('No one assigned yet');
  });
});

describe('StaffingView', () => {
  it('SECURITY: queries the registered venueShifts shape — claim-derived venue id, upcoming dates only, capped', () => {
    renderStaffing();
    const [path, constraints] = useCollectionMock.mock.calls[0] as unknown as [string, Record<string, unknown>[]];
    expect(path).toBe('operators/op1/shifts');
    expect(constraints[0]).toEqual({ type: 'where', field: 'venueId', op: '==', value: 'v1' });
    expect(constraints[1]).toMatchObject({ type: 'where', field: 'date', op: '>=' });
    expect(constraints[2]).toEqual({ type: 'orderBy', field: 'date', dir: 'asc' });
    expect(constraints[3]).toEqual({ type: 'limit', n: 20 });
  });

  it('renders date, hours, coverage counts and confirmation state — and NO staff names or uids', () => {
    mockData = [shift({ id: 's1' })];
    renderStaffing();

    expect(screen.getByText('Sep 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('1 lead · 2 attendants')).toBeInTheDocument();
    expect(screen.getByText('2/3 confirmed')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    // A venue_user cannot resolve names, and raw uids must never leak into the table.
    expect(screen.queryByText(/u1|u2|u3/)).not.toBeInTheDocument();
  });

  it('shows an empty state when no upcoming shifts exist', () => {
    renderStaffing();
    expect(screen.getByText('No upcoming shifts')).toBeInTheDocument();
  });

  it('shows an error state when the listener fails', () => {
    mockError = new Error('permission-denied');
    renderStaffing();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
