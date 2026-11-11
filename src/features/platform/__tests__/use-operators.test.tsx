import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// F8b (final-review.md T3-parked item): the venue-count-per-operator effect used to depend on the
// whole `operators` array reference, so ANY operators-collection snapshot (even one that only
// changes a field on an existing operator, not the set of operator ids) tore down and recreated
// every venue-count listener. Fixed by keying the effect on a stable operator-id-membership key
// instead. Mirrors lib/firebase/__tests__/hooks.test.tsx's onSnapshot-mocking pattern.

let calls: Record<string, number> = {};
let venueUnsubs: Record<string, ReturnType<typeof vi.fn>> = {};
let operatorsSnapshotCb: ((s: unknown) => void) | undefined;

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (ref: { path: string }, onNext: (s: unknown) => void) => {
    if (ref.path === 'operators') {
      operatorsSnapshotCb = onNext;
      return vi.fn();
    }
    calls[ref.path] = (calls[ref.path] ?? 0) + 1;
    const unsub = vi.fn();
    venueUnsubs[ref.path] = unsub;
    return unsub;
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

import { useOperators } from '../use-operators';

function op(id: string, over: Record<string, unknown> = {}) {
  return { id, name: id, createdAt: '2026-01-01T00:00:00.000Z', ...over };
}

beforeEach(() => {
  calls = {};
  venueUnsubs = {};
  operatorsSnapshotCb = undefined;
});

describe('useOperators (F8b: venue-count listener churn)', () => {
  it('does NOT tear down and recreate venue-count listeners when a snapshot update changes a field but not operator-id membership', async () => {
    renderHook(() => useOperators());

    await act(async () => {
      operatorsSnapshotCb?.({ docs: [{ data: () => op('op1') }, { data: () => op('op2') }] });
    });
    expect(calls['operators/op1/venues']).toBe(1);
    expect(calls['operators/op2/venues']).toBe(1);

    // Same two operator ids, brand-new array reference (a real `onSnapshot` always produces one),
    // but one field changed on op1 (e.g. a status flip) — membership is unchanged.
    await act(async () => {
      operatorsSnapshotCb?.({ docs: [{ data: () => op('op1', { status: 'suspended' }) }, { data: () => op('op2') }] });
    });

    expect(venueUnsubs['operators/op1/venues']).not.toHaveBeenCalled();
    expect(venueUnsubs['operators/op2/venues']).not.toHaveBeenCalled();
    expect(calls['operators/op1/venues']).toBe(1);
    expect(calls['operators/op2/venues']).toBe(1);
  });

  it('DOES tear down and recreate listeners when operator-id membership actually changes (a new operator is added)', async () => {
    renderHook(() => useOperators());

    await act(async () => {
      operatorsSnapshotCb?.({ docs: [{ data: () => op('op1') }] });
    });
    expect(calls['operators/op1/venues']).toBe(1);
    const firstOp1Unsub = venueUnsubs['operators/op1/venues']; // captured before it gets overwritten below

    await act(async () => {
      operatorsSnapshotCb?.({ docs: [{ data: () => op('op1') }, { data: () => op('op3') }] });
    });

    // Membership changed (op3 added) -> the effect legitimately reruns -> op1's prior listener is
    // torn down and a fresh one created; op3 gets its first listener.
    expect(firstOp1Unsub).toHaveBeenCalled();
    expect(calls['operators/op1/venues']).toBe(2);
    expect(calls['operators/op3/venues']).toBe(1);
  });
});
