import { renderHook, render, waitFor, act } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

const unsubDoc = vi.fn();
const unsubCollection = vi.fn();
let docSnapshotCb: ((s: unknown) => void) | undefined;
let collectionSnapshotCb: ((s: unknown) => void) | undefined;
let docErrorCb: ((e: Error) => void) | undefined;

vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, path: string) => ({ path }),
  collection: (_d: unknown, path: string) => ({ path }),
  query: (ref: { path: string }) => ref,
  onSnapshot: (
    ref: { path: string },
    onNext: (s: unknown) => void,
    onError?: (e: Error) => void
  ) => {
    if (ref.path === 'operators/goldstar') {
      docSnapshotCb = onNext;
      docErrorCb = onError;
      return unsubDoc;
    }
    collectionSnapshotCb = onNext;
    return unsubCollection;
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

import type { DocumentData, Query, QueryConstraint } from 'firebase/firestore';
import { useDoc, useCollection, useQuery, type LiveDocResult } from '../hooks';

describe('useDoc', () => {
  it('skips subscribing when path is undefined', () => {
    const { result } = renderHook(() => useDoc(undefined));
    expect(result.current).toEqual({ data: undefined, loading: false, error: null });
  });

  it('subscribes, resolves data, and unsubscribes on unmount', async () => {
    const { result, unmount } = renderHook(() => useDoc<{ id: string; name: string }>('operators/goldstar'));
    expect(result.current.loading).toBe(true);

    await act(async () => {
      docSnapshotCb?.({ id: 'goldstar', exists: () => true, data: () => ({ name: 'Goldstar' }) });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ id: 'goldstar', name: 'Goldstar' });
    expect(result.current.error).toBeNull();

    unmount();
    expect(unsubDoc).toHaveBeenCalled();
  });

  it('returns undefined data when the document does not exist', async () => {
    const { result } = renderHook(() => useDoc('operators/goldstar'));
    await act(async () => {
      docSnapshotCb?.({ exists: () => false });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it("final-wave item 13: switching to a DIFFERENT path never COMMITS a frame with the old path's stale settled data — no one-frame stale-absent flash", async () => {
    // `result.current` from `renderHook` alone can't distinguish this: testing-library's `act()`
    // flushes the passive effect synchronously in the SAME batch as the render, so by the time
    // `rerender()` returns, a stale committed frame (if one happened) is already overwritten —
    // exactly the race a real browser doesn't collapse (one committed/painted frame, THEN the
    // effect runs on the next tick). `useLayoutEffect` only fires for a render that actually
    // COMMITS — React's "adjust state during render" pattern (what the fix uses) discards the
    // stale intermediate render before it ever reaches a layout effect, so logging every
    // `useLayoutEffect` firing directly observes what this bug is about: did a stale frame commit.
    const commits: LiveDocResult<{ id: string; name: string }>[] = [];
    function Harness({ path }: { path: string }) {
      const result = useDoc<{ id: string; name: string }>(path);
      useLayoutEffect(() => {
        commits.push(result);
      });
      return null;
    }

    const { rerender } = render(<Harness path="operators/goldstar" />);
    await act(async () => {
      docSnapshotCb?.({ id: 'goldstar', exists: () => true, data: () => ({ name: 'Goldstar' }) });
    });
    await waitFor(() => expect(commits.at(-1)?.loading).toBe(false));
    expect(commits.at(-1)?.data).toEqual({ id: 'goldstar', name: 'Goldstar' });
    commits.length = 0; // only the path-CHANGE transition matters from here

    rerender(<Harness path="operators/other" />);
    // No committed frame ever shows the OLD path's settled data alongside loading:false — that
    // would be indistinguishable from "confirmed: operators/other doesn't exist." (The render-time
    // reset and the effect's own reset can both commit — same shape, so no visible flash; this
    // asserts every commit during the transition already has the correct reset shape, not that
    // there's exactly one.)
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.every((c) => c.data === undefined && c.loading === true && c.error === null)).toBe(true);
  });

  it('surfaces the Firestore error without throwing', async () => {
    const { result } = renderHook(() => useDoc('operators/goldstar'));
    const err = new Error('permission-denied');
    await act(async () => {
      docErrorCb?.(err);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(err);
    expect(result.current.data).toBeUndefined();
  });
});

describe('useCollection', () => {
  it('skips subscribing when collectionPath is undefined', () => {
    const { result } = renderHook(() => useCollection(undefined));
    expect(result.current).toEqual({ data: [], loading: false, error: null });
  });

  it('subscribes and maps each doc with its id', async () => {
    const { result, unmount } = renderHook(() => useCollection<{ id: string; name: string }>('venues'));
    expect(result.current.loading).toBe(true);

    await act(async () => {
      collectionSnapshotCb?.({
        docs: [
          { id: 'v1', data: () => ({ name: 'Downtown' }) },
          { id: 'v2', data: () => ({ name: 'Airport' }) },
        ],
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([
      { id: 'v1', name: 'Downtown' },
      { id: 'v2', name: 'Airport' },
    ]);

    unmount();
    expect(unsubCollection).toHaveBeenCalled();
  });
});

describe('useCollection: render-phase reset on a constraints change (T1b fix round, MAJOR-1)', () => {
  it('never COMMITS a frame pairing the OLD constraints\' settled rows with the new target — the venue-switch bug', async () => {
    // Same `useLayoutEffect` commit-observation technique as useDoc's item-13 test above: a
    // layout effect only fires for renders that actually COMMIT, so this directly observes
    // whether a stale frame (old venue's rows under the new venue's label) ever paints. The
    // venue portal's switcher is the first control in the app that changes CONSTRAINTS while
    // the PATH stays the same, which is exactly the axis the old in-effect-only reset missed.
    const commits: { rows: string[]; loading: boolean }[] = [];
    const constraintsA = [] as never[];
    const constraintsB = [] as never[];
    function Harness({ constraints }: { constraints: never[] }) {
      const { data, loading } = useCollection<{ id: string }>('operators/op1/invoices', constraints);
      useLayoutEffect(() => {
        commits.push({ rows: data.map((d) => d.id), loading });
      });
      return null;
    }

    const { rerender } = render(<Harness constraints={constraintsA} />);
    await act(async () => {
      collectionSnapshotCb?.({ docs: [{ id: 'INV-V1', data: () => ({}) }] });
    });
    await waitFor(() => expect(commits.at(-1)?.rows).toEqual(['INV-V1']));
    commits.length = 0; // only the switch transition matters from here

    rerender(<Harness constraints={constraintsB} />);

    // Every commit between the switch and the new snapshot must already be reset — no frame may
    // carry INV-V1 (the diagnostic frame review-t1b.md recorded was exactly that: the new
    // venue's label over the old venue's row).
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.every((c) => c.rows.length === 0 && c.loading === true)).toBe(true);

    await act(async () => {
      collectionSnapshotCb?.({ docs: [{ id: 'INV-V2', data: () => ({}) }] });
    });
    await waitFor(() => expect(commits.at(-1)?.rows).toEqual(['INV-V2']));
  });

  it('resets to a non-loading empty state when the path becomes undefined', async () => {
    const { result, rerender } = renderHook(({ path }: { path: string | undefined }) => useCollection(path), {
      initialProps: { path: 'venues' as string | undefined },
    });
    await act(async () => {
      collectionSnapshotCb?.({ docs: [{ id: 'v1', data: () => ({}) }] });
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    rerender({ path: undefined });
    expect(result.current).toEqual({ data: [], loading: false, error: null });
  });
});

describe('useQuery', () => {
  it('skips subscribing when the query is undefined', () => {
    const { result } = renderHook(() => useQuery(undefined));
    expect(result.current).toEqual({ data: [], loading: false, error: null });
  });

  it('resets during render when the query identity changes — no stale committed frame (T1b fix round, MAJOR-1)', async () => {
    const commits: { rows: string[]; loading: boolean }[] = [];
    const queryA = { path: 'venues' } as never;
    const queryB = { path: 'venues' } as never;
    function Harness({ q }: { q: never }) {
      const { data, loading } = useQuery<{ id: string }>(q);
      useLayoutEffect(() => {
        commits.push({ rows: data.map((d) => d.id), loading });
      });
      return null;
    }

    const { rerender } = render(<Harness q={queryA} />);
    await act(async () => {
      collectionSnapshotCb?.({ docs: [{ id: 'v1', data: () => ({}) }] });
    });
    await waitFor(() => expect(commits.at(-1)?.rows).toEqual(['v1']));
    commits.length = 0;

    rerender(<Harness q={queryB} />);
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.every((c) => c.rows.length === 0 && c.loading === true)).toBe(true);
  });

  it('subscribes to an already-constructed query and maps results', async () => {
    const fakeQuery = { path: 'venues' } as never;
    const { result } = renderHook(() => useQuery<{ id: string; name: string }>(fakeQuery));
    await act(async () => {
      collectionSnapshotCb?.({ docs: [{ id: 'v1', data: () => ({ name: 'Downtown' }) }] });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 'v1', name: 'Downtown' }]);
  });
});

describe('carry #46: a stale callback from a replaced subscription cannot write state', () => {
  /**
   * `onSnapshot`'s unsubscribe stops FUTURE deliveries; it does not retroactively cancel a callback
   * the SDK has already dispatched. So between a target change and the old listener's teardown, a
   * snapshot belonging to the previous target can still arrive and call `setState` — writing the
   * OLD document's data under the NEW target, with `loading: false`, which reads as a settled,
   * correct answer. The render-phase reset does not help: it has already run.
   *
   * `session-provider.tsx` solved this with an epoch (`myEpoch !== epochRef.current`); these hooks
   * now carry the same guard. Each test below drives the real hook, keeps the FIRST subscription's
   * callback, switches the target, and then fires the kept callback — the exact interleaving.
   */

  it('useDoc: a snapshot from the previous PATH is dropped', async () => {
    const { result, rerender } = renderHook(({ path }) => useDoc<{ id: string; name: string }>(path), {
      initialProps: { path: 'operators/goldstar' },
    });
    const stale = docSnapshotCb!;
    rerender({ path: 'operators/other' });

    await act(async () => {
      stale({ id: 'goldstar', exists: () => true, data: () => ({ name: 'STALE' }) });
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
  });

  it('useDoc: an ERROR from the previous path is dropped too', async () => {
    // The error path writes `loading:false` as well, so an unguarded stale error settles the hook
    // into a failure state that belongs to a document the caller has already navigated away from.
    const { result, rerender } = renderHook(({ path }) => useDoc(path), {
      initialProps: { path: 'operators/goldstar' },
    });
    const staleErr = docErrorCb!;
    rerender({ path: 'operators/other' });

    await act(async () => {
      staleErr(new Error('permission-denied on the OLD path'));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('useCollection: a snapshot from the previous CONSTRAINTS is dropped', async () => {
    const a: QueryConstraint[] = [];
    const b: QueryConstraint[] = [];
    const { result, rerender } = renderHook(({ c }) => useCollection<{ id: string }>('operators/goldstar/venues', c), {
      initialProps: { c: a },
    });
    const stale = collectionSnapshotCb!;
    rerender({ c: b });

    await act(async () => {
      stale({ docs: [{ id: 'stale-venue', data: () => ({}) }] });
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('useQuery: a snapshot from the previous QUERY identity is dropped', async () => {
    const q1 = { path: 'operators/goldstar/tickets' } as unknown as Query<DocumentData>;
    const q2 = { path: 'operators/goldstar/tickets' } as unknown as Query<DocumentData>;
    const { result, rerender } = renderHook(({ q }) => useQuery<{ id: string }>(q), { initialProps: { q: q1 } });
    const stale = collectionSnapshotCb!;
    rerender({ q: q2 });

    await act(async () => {
      stale({ docs: [{ id: 'stale-ticket', data: () => ({}) }] });
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('the CURRENT subscription still writes normally — the guard drops stale, not everything', async () => {
    const { result, rerender } = renderHook(({ path }) => useDoc<{ id: string; name: string }>(path), {
      initialProps: { path: 'operators/goldstar' },
    });
    rerender({ path: 'operators/other' });
    const live = collectionSnapshotCb!; // the mock routes any non-`operators/goldstar` path here

    await act(async () => {
      live({ id: 'other', exists: () => true, data: () => ({ name: 'Other' }) });
    });

    expect(result.current.data).toEqual({ id: 'other', name: 'Other' });
    expect(result.current.loading).toBe(false);
  });
});
