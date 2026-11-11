import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/auth/session-provider';
import type { Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';
import { VenueSwitcher } from '../venue-switcher';

type Snap = { docs: { id: string; data: () => Record<string, unknown> }[] };
type NextCb = (snap: Snap) => void;

/** Every collection subscription, in order, with the venueId its constraints carried. */
let subscriptions: { venueId: unknown; next: NextCb }[] = [];

// REAL `useCollection` (this is the point — the T1b MAJOR-1 fix lives inside it), mocked only at
// the firestore SDK boundary, same convention as `src/lib/firebase/__tests__/hooks.test.tsx`.
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: { path: string }, ...constraints: { type: string; field?: string; value?: unknown }[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir?: string) => ({ type: 'orderBy', field, dir }),
  limit: (n: number) => ({ type: 'limit', n }),
  onSnapshot: (q: { constraints: { type: string; field?: string; value?: unknown }[] }, next: NextCb) => {
    subscriptions.push({ venueId: q.constraints.find((c) => c.type === 'where' && c.field === 'venueId')?.value, next });
    return vi.fn();
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

import { VenueInvoices } from '../venue-invoices';

const GRILL = { id: 'v1', name: 'The Grill', operatorId: 'op1' } as unknown as Venue;
const ROOFTOP = { id: 'v2', name: 'Rooftop', operatorId: 'op1' } as unknown as Venue;

function invoiceDoc(id: string, venueId: string) {
  return {
    id,
    data: () => ({
      operatorId: 'op1',
      venueId,
      period: id,
      lines: [],
      subtotal: 100,
      tax: 0,
      total: 100,
      currency: 'USD',
      status: 'sent' as const,
      sentAt: '2026-08-01T12:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    }),
  };
}

beforeEach(() => {
  subscriptions = [];
  mockSession = { claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1', 'v2'], claimsVersion: 1 } } as unknown as Partial<Session>;
});

/**
 * T1b fix round, MAJOR-1 (review-t1b.md): a venue switch must never show the previous venue's
 * rows under the new venue's name.
 *
 * N1 (re-review): THIS TEST IS NOT THE REGRESSION GUARD. Its pre-snapshot assertions run after
 * `fireEvent.change`, which RTL wraps in `act()` — that flushes the passive effect, so the OLD
 * in-effect reset would also have landed by the time `screen.*` is consulted. "Commits a stale
 * frame then corrects" vs. "never commits one" is not observable through the DOM after an act
 * boundary; the re-reviewer probed this test against the pre-fix hook and it PASSES. The actual
 * MAJOR-1 guard is the two commit-level `useLayoutEffect` tests in
 * `src/lib/firebase/__tests__/hooks.test.tsx` ("never COMMITS a frame pairing the OLD
 * constraints' settled rows…" and the `useQuery` twin) — delete those and this suite would keep
 * passing while the bug walked back in.
 *
 * What THIS test verifies is the WIRING those hook tests can't see: the switcher drives
 * `VenueProvider`, the provider's venue feeds the screen's constraints, the resubscription is
 * scoped to the NEW venue id, and the settled DOM never mixes venues — end-to-end through the
 * REAL `useCollection` + REAL `VenueProvider`, mocked only at the firestore SDK boundary.
 */
describe('venue switch never leaks the previous venue\'s rows (MAJOR-1)', () => {
  it('switching venues drops the old rows immediately and resubscribes scoped to the new venue', async () => {
    render(
      <VenueProvider venues={[GRILL, ROOFTOP]}>
        <VenueSwitcher />
        <VenueInvoices />
      </VenueProvider>
    );

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.venueId).toBe('v1');
    await act(async () => subscriptions[0]!.next({ docs: [invoiceDoc('INV-V1', 'v1')] }));
    expect(screen.getByText('INV-V1')).toBeInTheDocument();

    // Switch to Rooftop. Before ANY new snapshot arrives, the old venue's row must be gone and
    // the header must already say Rooftop — the reviewer's diagnostic frame was exactly
    // {"venue":"v2","rows":["INV-V1"]}.
    fireEvent.change(screen.getByRole('combobox', { name: /venue/i }), { target: { value: 'v2' } });

    expect(screen.queryByText('INV-V1')).not.toBeInTheDocument();
    expect(screen.getByText(/Rooftop — what your venue has been billed\./)).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1]!.venueId).toBe('v2');
    await act(async () => subscriptions[1]!.next({ docs: [invoiceDoc('INV-V2', 'v2')] }));

    await waitFor(() => expect(screen.getByText('INV-V2')).toBeInTheDocument());
    expect(screen.queryByText('INV-V1')).not.toBeInTheDocument();
  });
});
