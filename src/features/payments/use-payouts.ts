'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import type { PayoutAllocation } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';

export interface PayoutRow extends PayoutAllocation {
  uid: string;
}

export interface UsePayoutsResult {
  payouts: PayoutRow[];
  loading: boolean;
}

/** Bounded fan-out cap — same precedent as `claims/page.tsx`'s `FIRESTORE_IN_LIMIT` (30): an
 * operator with more staff than this only sees the first 30's individual payout rows here,
 * disclosed as an accepted edge case (task-6-report.md) rather than an unbounded listener count. */
const MAX_STAFF_FANOUT = 30;

/**
 * Per-staff-uid fan-out over `operators/{op}/users/{uid}/payouts` — mirrors `use-live-tickets.ts`'s
 * own per-venue fan-out (Task 3) for the same structural reason: `firestore.rules`'
 * `users/{uid}/payouts/{payoutId}` read rule (`inOperator(op) && (request.auth.uid == uid ||
 * isAdmin())`) has NO collectionGroup-wide or lead-scoped branch, so there is no single query that
 * returns every staff member's payouts at once — the caller decides WHICH uids to watch (an
 * owner/admin passes every staff uid; a lead, who can only read their own subcollection per that
 * same rule, passes only their own uid) and this hook subscribes to each one individually.
 *
 * `uids` does NOT need to be caller-memoized — subscriptions key on `idsKey` (the sorted id list,
 * order-independent), same idiom as `use-live-tickets.ts`'s `venueKey`.
 */
export function usePayouts(operatorId: string | undefined, uids: string[]): UsePayoutsResult {
  const idsKey = useMemo(() => [...uids].sort().join(','), [uids]);
  const idsRef = useRef(uids);
  useEffect(() => {
    idsRef.current = uids;
  });

  const [byUid, setByUid] = useState<Record<string, PayoutRow[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = idsRef.current.slice(0, MAX_STAFF_FANOUT);
    if (!operatorId || ids.length === 0) {
      setByUid({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { db } = firebase();
    const pending = new Set(ids);
    const unsubs: Unsubscribe[] = [];

    ids.forEach((uid) => {
      const col = collection(db, `operators/${operatorId}/users/${uid}/payouts`);
      const q = query(col, orderBy('createdAt', 'desc'));
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            pending.delete(uid);
            setByUid((prev) => ({ ...prev, [uid]: snap.docs.map((d) => ({ uid, ...(d.data() as PayoutAllocation) })) }));
            setLoading(pending.size > 0);
          },
          () => {
            // Defensive only, by design every caller-supplied uid should already be rules-permitted
            // (see header comment) — a permission error here (e.g. a lead's uid list was built
            // wrong) drops just that one uid's rows rather than crashing every other listener.
            pending.delete(uid);
            setByUid((prev) => ({ ...prev, [uid]: [] }));
            setLoading(pending.size > 0);
          },
        ),
      );
    });

    return () => unsubs.forEach((u) => u());
  }, [operatorId, idsKey]);

  const payouts = useMemo(() => {
    // Reads `uids` (this render's own parameter), NOT `idsRef.current` — a ref must never be read
    // during render (`react-hooks/refs`); the ref exists only so the subscription EFFECT above can
    // see the latest ids without depending on the array's identity. Mirrors `use-live-tickets.ts`'s
    // own `ticketsByVenue` memo, which iterates its `venueIds` parameter directly for the same reason.
    const all = uids.slice(0, MAX_STAFF_FANOUT).flatMap((uid) => byUid[uid] ?? []);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uids content captured via idsKey
  }, [byUid, idsKey]);

  return { payouts, loading };
}
