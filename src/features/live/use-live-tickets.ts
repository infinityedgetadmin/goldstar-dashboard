'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';
import type { Ticket, TicketStatus } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';

/**
 * The two status groups a venue's live-ops column needs, both served by `@goldstar/platform`'s
 * registered `venueQueue` query (`{ collection: 'tickets', fields: ['venueId', 'status',
 * 'times.requestedAt'] }`) — Firestore composite-index selection is structural (which fields, in
 * which order/direction), not bound to which VALUES appear in a `status in [...]` clause, so BOTH
 * lists below are served by that one registered index. No new `QUERIES` entry needed.
 *
 * Split into two lists (rather than one combined `in`, which would also work) because valet
 * statuses and drive_home/ride job statuses never share a value except `requested` (owned by the
 * valet list here) — so the two listeners per venue can never emit the same ticket id twice, and
 * `ticketsByVenue` below can simply concatenate them.
 */
const ACTIVE_VALET_STATUSES: readonly TicketStatus[] = ['requested', 'claimed', 'retrieving', 'staged', 'ready'];
// Fix round 1 (task-3-review.md, surfaced while fixing the liveLocations-consistency Minor):
// `'completed'` is not a TERMINAL_STATUSES value (only `closed`/`cancelled` are) — a drive_home/
// ride job sits here after the trip finishes but before it's formally closed/invoiced, and
// `firestore.rules`' `liveLocationWriteOk()` still allows the driver's location doc to be written
// during it (`!(t.status in ['closed', 'cancelled'])`). Omitting it here would mean the board's own
// `live-board.tsx` (which now filters `liveLocations` markers to tickets THIS list is actually
// tracking) hides a still-live driver marker for a completed-but-unclosed job even in a selected
// venue — not merely "not shown until you scroll," but silently absent with no explanation.
const ACTIVE_JOB_STATUSES: readonly TicketStatus[] = [
  'quoted',
  'confirmed',
  'assigned',
  'en_route_to_guest',
  'en_route_to_pickup',
  'pre_drive_inspection',
  'in_transit',
  'arrived',
  'arrived_pickup',
  'completed',
];

export interface UseLiveTicketsResult {
  /** Active tickets per venue, sorted oldest-`times.requestedAt`-first — the same ordering the
   * `venueQueue` index enforces server-side (mirrors goldstar-mobile's `useVenueQueue`). A venue
   * with no active tickets still gets a `[]` entry (not omitted) once loaded. */
  ticketsByVenue: Record<string, Ticket[]>;
  loading: boolean;
}

/**
 * Live per-venue active-ticket feed for the live-ops board (Plan 4b Task 3): `status in
 * [requested, claimed, retrieving, staged, ready]` (valet) plus every non-terminal drive_home/ride
 * job status, grouped and sorted per venue. `onSnapshot`-only, per this workspace's ledger
 * constraint — no `getDocs` anywhere in this hook.
 *
 * `venueIds` does NOT need to be caller-memoized: subscriptions are keyed on `venueKey` (the
 * sorted id list, order-independent) rather than the array's identity, so a fresh array with the
 * same ids on every render does not tear down and recreate listeners — mirrors
 * `use-operators.ts`'s `operatorIdsKey`/ref idiom (see that file's header comment for the full
 * rationale: listener churn on every render would be its own real cost).
 */
export function useLiveTickets(operatorId: string | undefined, venueIds: string[]): UseLiveTicketsResult {
  const venueKey = useMemo(() => [...venueIds].sort().join(','), [venueIds]);
  const venueIdsRef = useRef(venueIds);
  useEffect(() => {
    venueIdsRef.current = venueIds;
  });

  const [byGroup, setByGroup] = useState<Record<string, Ticket[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = venueIdsRef.current;
    if (!operatorId || ids.length === 0) {
      setByGroup({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { db } = firebase();
    const col = collection(db, `operators/${operatorId}/tickets`);
    const pending = new Set<string>();
    const unsubs: Unsubscribe[] = [];

    ids.forEach((venueId) => {
      (
        [
          [`${venueId}:valet`, ACTIVE_VALET_STATUSES],
          [`${venueId}:job`, ACTIVE_JOB_STATUSES],
        ] as const
      ).forEach(([groupKey, statuses]) => {
        pending.add(groupKey);
        const q = query(col, where('venueId', '==', venueId), where('status', 'in', [...statuses]), orderBy('times.requestedAt', 'asc'));
        unsubs.push(
          onSnapshot(q, (snap) => {
            pending.delete(groupKey);
            setByGroup((prev) => ({ ...prev, [groupKey]: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket) }));
            setLoading(pending.size > 0);
          }),
        );
      });
    });

    return () => unsubs.forEach((u) => u());
  }, [operatorId, venueKey]);

  const ticketsByVenue = useMemo(() => {
    const out: Record<string, Ticket[]> = {};
    for (const venueId of venueIds) {
      const merged = [...(byGroup[`${venueId}:valet`] ?? []), ...(byGroup[`${venueId}:job`] ?? [])];
      merged.sort((a, b) => (a.times.requestedAt ?? '').localeCompare(b.times.requestedAt ?? ''));
      out[venueId] = merged;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- venueIds content captured via venueKey
  }, [byGroup, venueKey]);

  return { ticketsByVenue, loading };
}
