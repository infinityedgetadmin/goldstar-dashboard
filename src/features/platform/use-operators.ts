'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import type { Operator } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';

export interface OperatorRow extends Operator {
  venueCount: number;
}

interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Lists every operator, live, with each operator's venue count — also
 * live. Deliberately built on bare `onSnapshot(collection(db, ...))`
 * listeners (client-side sort by `createdAt`, one listener per operator
 * for its venue count) rather than `getDocs`/`query`/`orderBy`/
 * `getCountFromServer`, and deliberately NOT `@tanstack/react-query`.
 *
 * Found empirically while implementing this (task-3-report.md): the
 * `check:guest-bundle` gate budgets `/t/[token]`'s first-load JS at
 * 300 KB, and the pre-existing baseline already measured 299.28 KB —
 * only 0.72 KB of headroom. `doc()` + `onSnapshot()` cost nothing extra
 * (already bundled via `session-provider.tsx`'s own listeners), and bare
 * `collection()` + `onSnapshot()` is equally free — but `query()` and
 * `orderBy()` (Firestore's query-constraint builders) and the one-shot
 * `getDoc`/`getDocs`/`getCountFromServer` functions are each a genuinely
 * separate, previously-unbundled code path that alone exceeds the entire
 * remaining margin (`getDoc` alone: +0.63 KB; `collection`+`query`+
 * `orderBy` together: +2.71 KB) — confirmed by building with each added
 * one at a time and re-running `check:guest-bundle`. This is also a
 * genuine improvement, not just a workaround: an operator's status/venue
 * count now updates live in the table the instant `platformSetOperator
 * Status` (suspend/reactivate) or a venue create/delete lands, with no
 * manual refetch/invalidation needed at the call sites.
 */
export function useOperators(): QueryState<OperatorRow[]> {
  const [operators, setOperators] = useState<Operator[] | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    const { db } = firebase();
    return onSnapshot(
      collection(db, 'operators'),
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as Operator);
        rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
        setOperators(rows);
      },
      () => setError(true)
    );
  }, []);

  const [venueCounts, setVenueCounts] = useState<Record<string, number>>({});

  // F8b (final-review.md T3-parked item): every operators-collection snapshot above produces a
  // BRAND NEW `operators` array reference, even when nothing but a field (branding, status, ...)
  // changed on one existing operator — no membership change at all. Depending directly on
  // `[operators]` tore down and recreated all N venue-count listeners on every such snapshot.
  // `operatorIdsKey` is a stable primitive that only changes when the actual SET of operator ids
  // changes (an operator created/deleted), so unrelated field-level updates leave the listeners
  // alone. `operatorsRef` keeps the effect's closure on the CURRENT `operators` array (which the
  // key-only dependency would otherwise leave stale) for the renders where it does need to re-run.
  const operatorIdsKey = useMemo(() => (operators ? JSON.stringify(operators.map((op) => op.id).sort()) : ''), [operators]);
  const operatorsRef = useRef(operators);
  // Kept fresh in its own effect (not a direct render-body assignment) — refs must only be written
  // outside of render (React Compiler's react-hooks/refs rule). No dependency array: runs after
  // EVERY render, in declaration order before the listeners effect below on the same commit, so
  // that effect always reads the current `operators` even on a commit where `operatorIdsKey` itself
  // didn't change.
  useEffect(() => {
    operatorsRef.current = operators;
  });

  useEffect(() => {
    const current = operatorsRef.current;
    if (!current || current.length === 0) return;
    const { db } = firebase();
    const unsubs = current.map((op) =>
      onSnapshot(collection(db, `operators/${op.id}/venues`), (snap) => {
        setVenueCounts((prev) => ({ ...prev, [op.id]: snap.size }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [operatorIdsKey]);

  const data = operators?.map((op) => ({ ...op, venueCount: venueCounts[op.id] ?? 0 }));
  return { data, isLoading: operators === undefined, isError: error };
}

export function useOperator(operatorId: string | undefined): QueryState<Operator | null> {
  const [data, setData] = useState<Operator | null | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!operatorId) return;
    const { db } = firebase();
    return onSnapshot(
      doc(db, `operators/${operatorId}`),
      (snap) => setData(snap.exists() ? (snap.data() as Operator) : null),
      () => setError(true)
    );
  }, [operatorId]);

  return { data: operatorId ? data : null, isLoading: !!operatorId && data === undefined, isError: error };
}
