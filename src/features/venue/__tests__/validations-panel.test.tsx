import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/auth/session-provider';
import type { Validation, Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';

const { toastMock } = vi.hoisted(() => ({ toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));
vi.mock('@/lib/firebase/callables', () => ({ callable: () => vi.fn() }));

// Descriptor-returning firestore mock so the venue-scoping constraint is assertable exactly —
// see use-venue-tickets.test.ts for the convention.
vi.mock('firebase/firestore', () => ({
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir?: string) => ({ type: 'orderBy', field, dir: dir ?? 'asc' }),
  limit: (n: number) => ({ type: 'limit', n }),
}));

let mockData: Validation[] = [];
let mockLoading = false;
let mockError: Error | null = null;
const useCollectionMock = vi.fn(() => ({ data: mockData, loading: mockLoading, error: mockError }));
vi.mock('@/lib/firebase/hooks', () => ({
  useCollection: (...args: unknown[]) => useCollectionMock(...(args as [])),
}));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));
// The apply dialog (opened by one test below) subscribes to the venue's live tickets, which would
// reach the real Firestore client. This file's subject is the GATING — whether the action is
// offered — so the dialog's own feed is stubbed here and exercised in apply-to-check-dialog.test.
vi.mock('../use-venue-tickets', () => ({
  useVenueTickets: () => ({ tickets: [], loading: false, error: false, retry: vi.fn() }),
}));

import { ValidationsPanel, validationState } from '../validations-panel';

const GRILL = {
  id: 'v1',
  name: 'The Grill',
  operatorId: 'op1',
  rates: { valet: { model: 'flat', items: [], taxRateBps: 0, fees: [] }, validations: { allowPartial: true, maxAmount: 1500 } },
} as unknown as Venue;

function validation(over: Partial<Validation> & { id: string }): Validation {
  return {
    operatorId: 'op1',
    venueId: 'v1',
    code: 'AB12CD',
    type: 'partial',
    amount: 1000,
    issuedBy: 'host1',
    issuedAt: new Date().toISOString(),
    ...over,
  } as Validation;
}

function renderPanel(venue: Venue = GRILL) {
  return render(
    <VenueProvider venues={[venue]}>
      <ValidationsPanel />
    </VenueProvider>
  );
}

/** Same venue with a POS configured — the only thing that unlocks "Apply to check". */
const GRILL_WITH_POS = { ...GRILL, pos: { provider: 'toast', restaurantGuid: 'rg1' } } as unknown as Venue;

beforeEach(() => {
  mockData = [];
  mockLoading = false;
  mockError = null;
  useCollectionMock.mockClear();
  mockSession = {
    uid: 'host1',
    claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1'], claimsVersion: 1 },
    operator: { currency: 'USD' },
  } as unknown as Partial<Session>;
});

describe('validationState', () => {
  const now = '2026-08-30T12:00:00.000Z';
  it('redeemed wins over everything', () => {
    expect(validationState(validation({ id: 'x', redeemedTicketId: '11111111-1111-7111-8111-111111111111', expiresAt: '2020-01-01T00:00:00.000Z' }), now).label).toBe('Redeemed');
  });
  it('expired when past expiresAt and unredeemed', () => {
    expect(validationState(validation({ id: 'x', expiresAt: '2026-08-29T00:00:00.000Z' }), now).label).toBe('Expired');
  });
  it('open otherwise', () => {
    expect(validationState(validation({ id: 'x' }), now).label).toBe('Open');
  });
});

describe('ValidationsPanel', () => {
  it('SECURITY: queries validations with a single equality on the claim-derived venue id — no orderBy (unregistered composite)', () => {
    renderPanel();
    expect(useCollectionMock).toHaveBeenCalledWith('operators/op1/validations', [{ type: 'where', field: 'venueId', op: '==', value: 'v1' }]);
  });

  it('renders code, type, amount and redemption state, newest first', () => {
    mockData = [
      validation({ id: 'a', code: 'OLD111', issuedAt: '2026-08-29T10:00:00.000Z' }),
      validation({ id: 'b', code: 'NEW222', issuedAt: '2026-08-30T10:00:00.000Z', redeemedTicketId: '11111111-1111-7111-8111-111111111111' }),
    ];
    renderPanel();

    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(rows[0]).toHaveTextContent('NEW222');
    expect(rows[1]).toHaveTextContent('OLD111');
    expect(screen.getByText('Redeemed')).toBeInTheDocument();
    expect(screen.getAllByText('$10.00').length).toBeGreaterThan(0);
  });

  it("computes today's totals from today's validations only", () => {
    const today = new Date().toISOString();
    mockData = [
      validation({ id: 'a', issuedAt: today, amount: 1000 }),
      validation({ id: 'b', issuedAt: today, amount: 500, redeemedTicketId: '11111111-1111-7111-8111-111111111111' }),
      validation({ id: 'c', issuedAt: '2020-01-01T12:00:00.000Z', amount: 99900 }),
    ];
    renderPanel();

    // NIT-2 class: exact-text queries scoped to each tile — substring toHaveTextContent('2')
    // would also pass on '12'/'20'.
    expect(within(screen.getByText('Issued today').parentElement as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByText('Partial value today').parentElement as HTMLElement).getByText('$15.00')).toBeInTheDocument();
    expect(within(screen.getByText('Redeemed today').parentElement as HTMLElement).getByText('1')).toBeInTheDocument();
  });

  it("marks the caller's own validations 'by you'", () => {
    mockData = [validation({ id: 'a', issuedBy: 'host1' }), validation({ id: 'b', code: 'ZZ99XX', issuedBy: 'someone-else' })];
    renderPanel();
    expect(screen.getAllByText('by you')).toHaveLength(1);
  });

  it('opens the issue dialog from the header action', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));
    expect(screen.getByRole('dialog', { name: 'Issue a validation' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no validations', () => {
    renderPanel();
    expect(screen.getByText('No validations yet')).toBeInTheDocument();
  });

  it('shows an error state when the listener fails', () => {
    mockError = new Error('permission-denied');
    renderPanel();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('ValidationsPanel: "Apply to check" gating (contracts v0.4.1)', () => {
  it('is hidden entirely when the venue has no POS configured', () => {
    mockData = [validation({ id: 'val1' })];
    renderPanel();
    // Without `venue.pos` the callable has no restaurant to talk to. An action that can only fail
    // is worse than no action.
    expect(screen.queryByRole('button', { name: 'Apply to check' })).not.toBeInTheDocument();
  });

  it('appears for a POS venue on an open validation', () => {
    mockData = [validation({ id: 'val1' })];
    renderPanel(GRILL_WITH_POS);
    expect(screen.getByRole('button', { name: 'Apply to check' })).toBeInTheDocument();
  });

  it('is NOT offered on an already-redeemed validation — redemption is terminal', () => {
    mockData = [validation({ id: 'val1', redeemedTicketId: '01912345-7abc-7def-8123-456789abcdef' })];
    renderPanel(GRILL_WITH_POS);
    // Ruling F makes a second redemption fail by design; advertising the action would promise
    // something guaranteed to be refused.
    expect(screen.queryByRole('button', { name: 'Apply to check' })).not.toBeInTheDocument();
    expect(screen.getByText('Redeemed')).toBeInTheDocument();
  });

  it('is NOT offered on an expired validation, and agrees with the Status pill', () => {
    mockData = [validation({ id: 'val1', expiresAt: '2020-01-01T00:00:00.000Z' })];
    renderPanel(GRILL_WITH_POS);
    expect(screen.queryByRole('button', { name: 'Apply to check' })).not.toBeInTheDocument();
    // Button and pill read the same `validationState`, so they cannot disagree.
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('opens the apply dialog for the row that was clicked', () => {
    mockData = [validation({ id: 'val1', code: 'ZZ99YY' })];
    renderPanel(GRILL_WITH_POS);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to check' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Apply to check' })).toBeInTheDocument();
    // Scoped to the dialog: the code also renders in the table row behind it, so an unscoped
    // query would pass even if the dialog opened for the wrong validation.
    expect(within(dialog).getByText('ZZ99YY')).toBeInTheDocument();
  });
});
