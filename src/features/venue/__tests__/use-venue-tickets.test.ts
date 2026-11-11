import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

type Snap = { docs: { id: string; data: () => Record<string, unknown> }[] };
type NextCb = (snap: Snap) => void;
type ErrCb = (e: Error) => void;

interface CapturedQuery {
  path: string;
  constraints: unknown[];
  next: NextCb;
  error: ErrCb;
}

/** Every query subscribed, in order, with the exact constraint descriptors it was built from. */
let subscribed: CapturedQuery[] = [];
let unsubs: ReturnType<typeof vi.fn>[] = [];

// Descriptor-returning firestore mock: `where`/`orderBy`/`limit` become plain objects so the test
// can assert the EXACT query shape (the tenant-scoping + registered-QUERIES contract) rather than
// poking at opaque SDK internals — same discipline as `use-claim-venues.test.ts`'s
// `subscribedPaths`.
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (col: { path: string }, ...constraints: unknown[]) => ({ path: col.path, constraints }),
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir?: string) => ({ type: 'orderBy', field, dir: dir ?? 'asc' }),
  limit: (n: number) => ({ type: 'limit', n }),
  onSnapshot: (q: { path: string; constraints: unknown[] }, next: NextCb, error: ErrCb) => {
    subscribed.push({ path: q.path, constraints: q.constraints, next, error });
    const unsub = vi.fn();
    unsubs.push(unsub);
    return unsub;
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

import { useVenueTickets } from '../use-venue-tickets';

function emit(index: number, docs: { id: string; [k: string]: unknown }[]) {
  const q = subscribed[index];
  if (!q) throw new Error(`no query at index ${index}`);
  act(() => q.next({ docs: docs.map(({ id, ...rest }) => ({ id, data: () => rest })) }));
}

beforeEach(() => {
  subscribed = [];
  unsubs = [];
});

describe('useVenueTickets', () => {
  it('subscribes to nothing without an operator or venue', () => {
    const a = renderHook(() => useVenueTickets(undefined, 'v1'));
    const b = renderHook(() => useVenueTickets('op1', undefined));
    expect(subscribed).toEqual([]);
    expect(a.result.current.loading).toBe(false);
    expect(b.result.current.loading).toBe(false);
  });

  it('SECURITY: runs exactly the two registered query shapes (venueQueue + venueParked), both scoped to the given venue', () => {
    renderHook(() => useVenueTickets('op1', 'v1'));

    expect(subscribed).toHaveLength(2);
    expect(subscribed[0]!.path).toBe('operators/op1/tickets');
    expect(subscribed[0]!.constraints).toEqual([
      { type: 'where', field: 'venueId', op: '==', value: 'v1' },
      { type: 'where', field: 'status', op: 'in', value: ['requested', 'claimed', 'retrieving', 'staged', 'ready'] },
      { type: 'orderBy', field: 'times.requestedAt', dir: 'asc' },
    ]);
    expect(subscribed[1]!.path).toBe('operators/op1/tickets');
    expect(subscribed[1]!.constraints).toEqual([
      { type: 'where', field: 'venueId', op: '==', value: 'v1' },
      { type: 'where', field: 'status', op: '==', value: 'checked_in' },
      { type: 'orderBy', field: 'times.checkedInAt', dir: 'desc' },
      { type: 'limit', n: 100 },
    ]);
  });

  it('stays loading until both listeners have produced a snapshot', async () => {
    const { result } = renderHook(() => useVenueTickets('op1', 'v1'));
    expect(result.current.loading).toBe(true);

    emit(0, []);
    expect(result.current.loading).toBe(true);

    emit(1, []);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tickets).toEqual([]);
  });

  it('merges in-motion tickets first, then parked cars, preserving each query order', async () => {
    const { result } = renderHook(() => useVenueTickets('op1', 'v1'));
    emit(0, [{ id: 'req1', jobType: 'valet', status: 'requested' }]);
    emit(1, [
      { id: 'park2', jobType: 'valet', status: 'checked_in' },
      { id: 'park1', jobType: 'valet', status: 'checked_in' },
    ]);

    await waitFor(() => expect(result.current.tickets.map((t) => t.id)).toEqual(['req1', 'park2', 'park1']));
  });

  it("filters non-valet job tickets out of the in-motion list (drive_home shares 'requested')", async () => {
    const { result } = renderHook(() => useVenueTickets('op1', 'v1'));
    emit(0, [
      { id: 'valet1', jobType: 'valet', status: 'requested' },
      { id: 'job1', jobType: 'drive_home', status: 'requested' },
    ]);
    emit(1, []);

    await waitFor(() => expect(result.current.tickets.map((t) => t.id)).toEqual(['valet1']));
  });

  it('surfaces a listener error, and retry re-subscribes both queries', async () => {
    const { result } = renderHook(() => useVenueTickets('op1', 'v1'));
    act(() => subscribed[0]!.error(new Error('permission-denied')));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);

    act(() => result.current.retry());
    expect(subscribed).toHaveLength(4);
    await waitFor(() => expect(result.current.error).toBe(false));
  });

  it('unsubscribes both listeners on unmount', () => {
    const { unmount } = renderHook(() => useVenueTickets('op1', 'v1'));
    expect(unsubs).toHaveLength(2);
    unmount();
    unsubs.forEach((u) => expect(u).toHaveBeenCalled());
  });

  it('re-subscribes with the new venue id when the active venue switches', () => {
    const { rerender } = renderHook(({ venueId }: { venueId: string }) => useVenueTickets('op1', venueId), {
      initialProps: { venueId: 'v1' },
    });
    expect(subscribed).toHaveLength(2);

    rerender({ venueId: 'v2' });
    expect(unsubs.slice(0, 2).every((u) => u.mock.calls.length > 0)).toBe(true);
    expect(subscribed).toHaveLength(4);
    expect(subscribed[2]!.constraints[0]).toEqual({ type: 'where', field: 'venueId', op: '==', value: 'v2' });
  });
});
