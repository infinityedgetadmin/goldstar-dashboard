'use client';
import { useEffect, useRef, useState } from 'react';
import {
  doc,
  collection,
  query as buildQuery,
  onSnapshot,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import { firebase } from './client';

export interface LiveDocResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

export interface LiveListResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

/**
 * Carry #46 — why all three hooks below carry an epoch.
 *
 * `onSnapshot`'s unsubscribe stops FUTURE deliveries; it does not retroactively cancel a callback
 * the SDK has already dispatched. Between a target change and the previous listener's teardown, a
 * snapshot belonging to the OLD target can still arrive and call `setState` — writing the old
 * document's data under the new target with `loading: false`, which is indistinguishable from a
 * settled, correct answer. The render-phase resets each hook already has cannot help: they run
 * during the render that changes the target, before the stale callback lands.
 *
 * The guard is the one `session-provider.tsx` uses: bump a ref on every subscribe, capture the
 * value in the effect's closure, and have every callback bail when the two no longer agree. A
 * counter rather than a token because it is monotonic — no allocation, no identity comparison, and
 * the "is this the newest subscription" question is exactly a >= on a number.
 */

/**
 * Live-subscribes to a single Firestore document. Pass `undefined` for
 * `path` to skip subscribing (e.g. while a dependency like `operatorId`
 * isn't resolved yet) — returns `{ data: undefined, loading: false }` in
 * that case rather than an indefinite loading state.
 */
export function useDoc<T = DocumentData>(path: string | undefined): LiveDocResult<T> {
  const [state, setState] = useState<LiveDocResult<T>>({ data: undefined, loading: Boolean(path), error: null });
  // Final whole-branch review, final-wave item 13 (loading-vs-absent one-frame flash): tracks which
  // `path` `state` actually belongs to, so a `path` change can be caught and reset DURING this
  // render — not only in the effect below, which doesn't run until AFTER this render commits. Without
  // this, the render triggered by a `path` change would return the PREVIOUS path's already-settled
  // `{ data, loading: false }` for one frame, indistinguishable from "confirmed: this document
  // doesn't exist" — a caller switching between two docs (e.g. TicketDrawer's `ticket` prop) can't
  // tell "stale answer for the OLD path" from "real answer for the NEW path." Calling `setState`
  // conditionally here, mid-render, is React's documented pattern for resetting state when a prop
  // changes — React discards this render's output and re-renders immediately with the reset state
  // before anything commits to the DOM, so no flash is ever painted.
  const [subscribedPath, setSubscribedPath] = useState(path);
  if (path !== subscribedPath) {
    setSubscribedPath(path);
    setState({ data: undefined, loading: Boolean(path), error: null });
  }

  const epochRef = useRef(0);

  useEffect(() => {
    // Carry #47: the two in-effect `setState` resets that used to open this effect are gone. They
    // duplicated the render-phase reset above — which already produces exactly these two shapes,
    // one render EARLIER — and made this the only one of the three hooks resetting twice.
    // `useCollection` dropped its equivalent in the T1b fix round; this is that same change, and
    // it clears the standing `react-hooks/set-state-in-effect` warning that marked the asymmetry.
    const myEpoch = ++epochRef.current;
    if (!path) return;
    const { db } = firebase();
    const unsub = onSnapshot(
      doc(db, path),
      (snap) => {
        if (myEpoch !== epochRef.current) return;
        setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : undefined, loading: false, error: null });
      },
      (error) => {
        if (myEpoch !== epochRef.current) return;
        setState({ data: undefined, loading: false, error });
      }
    );
    return unsub;
  }, [path]);

  return state;
}

/**
 * Module-level (not per-call) default so callers who omit `constraints`
 * get a referentially-stable empty array across renders. A `= []` default
 * parameter is a NEW array on every call, which would make the effect
 * below re-subscribe (and re-`setState`) on every render — an infinite
 * render loop, confirmed by an early version of this hook's own test
 * suite OOM-crashing Vitest's worker.
 */
const EMPTY_CONSTRAINTS: QueryConstraint[] = [];

/**
 * Live-subscribes to a Firestore collection, optionally constrained
 * (`where`, `orderBy`, `limit`, ...). If passed explicitly, `constraints`
 * must be a referentially-stable array (wrap the call site in `useMemo`)
 * — like any React hook dependency, a fresh array every render would
 * resubscribe on every render.
 */
export function useCollection<T = DocumentData>(
  collectionPath: string | undefined,
  constraints: QueryConstraint[] = EMPTY_CONSTRAINTS
): LiveListResult<T> {
  const [state, setState] = useState<LiveListResult<T>>({ data: [], loading: Boolean(collectionPath), error: null });

  // Plan 7 T1b fix round, MAJOR-1: the reset must happen DURING the render that changes the
  // subscription target — not in the effect below, which only runs AFTER that render commits.
  // `useDoc` directly above has carried this render-phase reset (its `subscribedPath`) since
  // final-wave item 13; this hook only ever reset in-effect, so the render following a target
  // change COMMITTED one frame of the PREVIOUS target's settled rows under the new caller
  // context. Nothing exercised it until the venue portal's switcher became the first control to
  // change query CONSTRAINTS while the collection PATH stays the same — a venue switch painted
  // venue A's invoices under venue B's page header (review-t1b.md's recorded diagnostic frame).
  // The key is the (path, constraints) pair: `constraints` is caller-memoized (this hook's own
  // contract above), so its identity changing IS the subscription changing.
  const [subscribed, setSubscribed] = useState({ path: collectionPath, constraints });
  if (collectionPath !== subscribed.path || constraints !== subscribed.constraints) {
    setSubscribed({ path: collectionPath, constraints });
    setState({ data: [], loading: Boolean(collectionPath), error: null });
  }

  const epochRef = useRef(0);

  useEffect(() => {
    // State for this target was already set by the initializer / the render-phase reset above —
    // no synchronous setState here (also what `react-hooks/set-state-in-effect` flagged before).
    const myEpoch = ++epochRef.current;
    if (!collectionPath) return;
    const { db } = firebase();
    const q = buildQuery(collection(db, collectionPath), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (myEpoch !== epochRef.current) return;
        setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null });
      },
      (error) => {
        if (myEpoch !== epochRef.current) return;
        setState({ data: [], loading: false, error });
      }
    );
    return unsub;
  }, [collectionPath, constraints]);

  return state;
}

/**
 * Live-subscribes to an already-constructed Firestore `Query` — for
 * queries that need composite constraints beyond `useCollection`'s
 * flat list (e.g. `@goldstar/platform`'s `QUERIES` registry combined with
 * `query()`/`where()`/`orderBy()` at the call site). Memoize `q`.
 */
export function useQuery<T = DocumentData>(q: Query<DocumentData> | undefined): LiveListResult<T> {
  const [state, setState] = useState<LiveListResult<T>>({ data: [], loading: Boolean(q), error: null });

  // Same render-phase reset as `useCollection` above (Plan 7 T1b fix round, MAJOR-1), keyed on
  // the memoized query's identity — without it a `q` change commits one frame of the previous
  // query's settled rows before the effect's reset lands.
  const [subscribedQ, setSubscribedQ] = useState(q);
  if (q !== subscribedQ) {
    setSubscribedQ(q);
    setState({ data: [], loading: Boolean(q), error: null });
  }

  const epochRef = useRef(0);

  useEffect(() => {
    const myEpoch = ++epochRef.current;
    if (!q) return;
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (myEpoch !== epochRef.current) return;
        setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null });
      },
      (error) => {
        if (myEpoch !== epochRef.current) return;
        setState({ data: [], loading: false, error });
      }
    );
    return unsub;
  }, [q]);

  return state;
}
