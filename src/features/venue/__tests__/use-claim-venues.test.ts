import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

type DocSnap = { id: string; exists: () => boolean; data: () => unknown };
type NextCb = (snap: DocSnap) => void;
type ErrCb = (e: Error) => void;

/** Every path `onSnapshot` was subscribed to, in subscription order. */
let subscribedPaths: string[] = [];
/** path -> the live callbacks, so a test can drive each document independently. */
const listeners = new Map<string, { next: NextCb; error: ErrCb }>();
let unsubs: ReturnType<typeof vi.fn>[] = [];

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (ref: { path: string }, next: NextCb, error: ErrCb) => {
    subscribedPaths.push(ref.path);
    listeners.set(ref.path, { next, error });
    const unsub = vi.fn();
    unsubs.push(unsub);
    return unsub;
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

import { claimVenueIds, useClaimVenues } from '../use-claim-venues';

function emit(path: string, venue: Record<string, unknown> | null) {
  const l = listeners.get(path);
  if (!l) throw new Error(`no listener for ${path}`);
  act(() => {
    l.next({
      id: path.split('/').pop() as string,
      exists: () => venue !== null,
      data: () => venue ?? {},
    });
  });
}

function fail(path: string) {
  const l = listeners.get(path);
  if (!l) throw new Error(`no listener for ${path}`);
  act(() => l.error(new Error('permission-denied')));
}

beforeEach(() => {
  subscribedPaths = [];
  listeners.clear();
  unsubs = [];
});

describe('claimVenueIds', () => {
  it('returns an empty list when the claim is absent', () => {
    expect(claimVenueIds(undefined)).toEqual([]);
  });

  it('returns an empty list when the claim is empty', () => {
    expect(claimVenueIds([])).toEqual([]);
  });

  it('preserves claim order', () => {
    expect(claimVenueIds(['v3', 'v1', 'v2'])).toEqual(['v3', 'v1', 'v2']);
  });

  it('de-duplicates repeated IDs', () => {
    expect(claimVenueIds(['v1', 'v2', 'v1'])).toEqual(['v1', 'v2']);
  });

  it('trims surrounding whitespace and drops blank entries', () => {
    expect(claimVenueIds([' v1 ', '', '   ', 'v2'])).toEqual(['v1', 'v2']);
  });

  it('drops non-string entries a malformed claim could carry', () => {
    expect(claimVenueIds([null, 7, 'v1'] as unknown as string[])).toEqual(['v1']);
  });
});

describe('useClaimVenues', () => {
  it('subscribes to nothing and settles immediately when the claim grants no venues', () => {
    const { result } = renderHook(() => useClaimVenues('op1', []));
    expect(subscribedPaths).toEqual([]);
    expect(result.current).toEqual({ venues: [], loading: false });
  });

  it('subscribes to nothing when the operator is not resolved yet', () => {
    const { result } = renderHook(() => useClaimVenues(undefined, ['v1']));
    expect(subscribedPaths).toEqual([]);
    expect(result.current).toEqual({ venues: [], loading: false });
  });

  it('SECURITY: subscribes to exactly the claimed venue documents — never the venues collection', () => {
    renderHook(() => useClaimVenues('op1', ['v1', 'v2']));
    expect(subscribedPaths).toEqual(['operators/op1/venues/v1', 'operators/op1/venues/v2']);
    // A collection-level subscription would be `operators/op1/venues` with no
    // document segment — the exact query `firestore.rules` would let ANY
    // venue_user of this operator run against every venue the operator owns.
    expect(subscribedPaths).not.toContain('operators/op1/venues');
  });

  it('stays loading until every claimed venue has produced a snapshot', async () => {
    const { result } = renderHook(() => useClaimVenues('op1', ['v1', 'v2']));
    expect(result.current.loading).toBe(true);

    emit('operators/op1/venues/v1', { name: 'The Grill' });
    expect(result.current.loading).toBe(true);

    emit('operators/op1/venues/v2', { name: 'Rooftop' });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('returns the claimed venues in claim order, with their ids', async () => {
    const { result } = renderHook(() => useClaimVenues('op1', ['v2', 'v1']));
    emit('operators/op1/venues/v1', { name: 'The Grill' });
    emit('operators/op1/venues/v2', { name: 'Rooftop' });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.venues.map((v) => v.id)).toEqual(['v2', 'v1']);
    expect(result.current.venues.map((v) => v.name)).toEqual(['Rooftop', 'The Grill']);
  });

  it('omits a claimed venue whose document does not exist', async () => {
    const { result } = renderHook(() => useClaimVenues('op1', ['v1', 'v2']));
    emit('operators/op1/venues/v1', { name: 'The Grill' });
    emit('operators/op1/venues/v2', null);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.venues.map((v) => v.id)).toEqual(['v1']);
  });

  it('omits a claimed venue whose read is denied, without failing the rest', async () => {
    const { result } = renderHook(() => useClaimVenues('op1', ['v1', 'v2']));
    emit('operators/op1/venues/v1', { name: 'The Grill' });
    fail('operators/op1/venues/v2');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.venues.map((v) => v.id)).toEqual(['v1']);
  });

  it('RULING G: a content-identical snapshot re-emission keeps venue object and array identity', async () => {
    const { result } = renderHook(() => useClaimVenues('op1', ['v1', 'v2']));
    emit('operators/op1/venues/v1', { name: 'The Grill', status: 'active' });
    emit('operators/op1/venues/v2', { name: 'Rooftop', status: 'active' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const venuesBefore = result.current.venues;
    const grillBefore = venuesBefore[0];

    // Firestore re-emits with a FRESH data object (the mock's `data: () => ...` mirrors that);
    // identical content must not mint a new Venue reference or a new venues array.
    emit('operators/op1/venues/v1', { name: 'The Grill', status: 'active' });

    expect(result.current.venues).toBe(venuesBefore);
    expect(result.current.venues[0]).toBe(grillBefore);
  });

  it('RULING G (NIT-1): recursion — identical NESTED content keeps identity, a nested-leaf change re-mints', async () => {
    const rates = () => ({ validations: { allowPartial: true, maxAmount: 1500 }, valet: { model: 'flat', items: [{ id: 'r1', label: 'Event', amount: 1000 }] } });
    const { result } = renderHook(() => useClaimVenues('op1', ['v1']));
    emit('operators/op1/venues/v1', { name: 'The Grill', rates: rates() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current.venues[0];

    // Fresh objects, identical nested content — a shallow-equality regression would re-mint here.
    emit('operators/op1/venues/v1', { name: 'The Grill', rates: rates() });
    expect(result.current.venues[0]).toBe(before);

    // A change at a nested LEAF (rates.validations.maxAmount) must re-mint — a lazily-shallow
    // deepEqual would miss it and hand back a stale object after a real change.
    const changed = rates();
    changed.validations.maxAmount = 2000;
    emit('operators/op1/venues/v1', { name: 'The Grill', rates: changed });
    await waitFor(() => expect(result.current.venues[0]).not.toBe(before));
    expect((result.current.venues[0] as unknown as { rates: { validations: { maxAmount: number } } }).rates.validations.maxAmount).toBe(2000);
  });

  it('RULING G: a real content change re-mints only that venue — siblings keep their identity', async () => {
    const { result } = renderHook(() => useClaimVenues('op1', ['v1', 'v2']));
    emit('operators/op1/venues/v1', { name: 'The Grill' });
    emit('operators/op1/venues/v2', { name: 'Rooftop' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const grillBefore = result.current.venues[0];
    const rooftopBefore = result.current.venues[1];

    emit('operators/op1/venues/v2', { name: 'Rooftop (North)' });

    await waitFor(() => expect(result.current.venues[1]?.name).toBe('Rooftop (North)'));
    expect(result.current.venues[0]).toBe(grillBefore);
    expect(result.current.venues[1]).not.toBe(rooftopBefore);
  });

  it('reflects a live rename without resubscribing', async () => {
    const { result } = renderHook(() => useClaimVenues('op1', ['v1']));
    emit('operators/op1/venues/v1', { name: 'The Grill' });
    await waitFor(() => expect(result.current.venues[0]?.name).toBe('The Grill'));

    emit('operators/op1/venues/v1', { name: 'The Grill (Downtown)' });
    await waitFor(() => expect(result.current.venues[0]?.name).toBe('The Grill (Downtown)'));
    expect(subscribedPaths).toHaveLength(1);
  });

  it('does not resubscribe when the claim array is a new reference with the same ids', () => {
    const { rerender } = renderHook(({ ids }: { ids: string[] }) => useClaimVenues('op1', ids), {
      initialProps: { ids: ['v1', 'v2'] },
    });
    expect(subscribedPaths).toHaveLength(2);

    rerender({ ids: ['v1', 'v2'] });
    expect(subscribedPaths).toHaveLength(2);
  });

  it('resubscribes when the claimed venue set actually changes', () => {
    const { rerender } = renderHook(({ ids }: { ids: string[] }) => useClaimVenues('op1', ids), {
      initialProps: { ids: ['v1'] },
    });
    expect(subscribedPaths).toEqual(['operators/op1/venues/v1']);

    rerender({ ids: ['v1', 'v2'] });
    expect(subscribedPaths).toEqual([
      'operators/op1/venues/v1',
      'operators/op1/venues/v1',
      'operators/op1/venues/v2',
    ]);
  });

  it('unsubscribes every listener on unmount', () => {
    const { unmount } = renderHook(() => useClaimVenues('op1', ['v1', 'v2']));
    expect(unsubs).toHaveLength(2);
    unmount();
    unsubs.forEach((u) => expect(u).toHaveBeenCalled());
  });
});
