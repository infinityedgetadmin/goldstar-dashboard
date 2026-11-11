'use client';
import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';
import type { Ticket, TicketStatus } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';

/**
 * The in-motion half of the venue live board — identical value list to
 * `features/live/use-live-tickets.ts`'s `ACTIVE_VALET_STATUSES` (same board, host's-eye view).
 * Deliberately valet-only: a restaurant host's live board is about cars on their stand, not
 * drive_home/ride dispatch (the operator's live-ops board owns those), and `checked_in` cars —
 * this board's main content — are fetched by the second query below.
 */
const ACTIVE_VALET_STATUSES: readonly TicketStatus[] = ['requested', 'claimed', 'retrieving', 'staged', 'ready'];

/** Mirrors goldstar-mobile's `use-venue-queue.ts` parked-cars cap on the same registered query. */
const PARKED_LIMIT = 100;

export interface UseVenueTicketsResult {
  /** In-motion tickets first (oldest request first), then parked cars (newest check-in first). */
  tickets: Ticket[];
  loading: boolean;
  error: boolean;
  /** Re-attaches both subscriptions — the only recovery from a listener error. */
  retry: () => void;
}

/**
 * Live active-ticket feed for ONE venue — the venue portal's live board (Plan 7 Task 1b).
 *
 * SECURITY: `venueId` must come from `useVenue()` (the claim-derived context), never a URL param
 * or user input — both queries filter `venueId == <claimed venue>`, which is exactly what
 * `firestore.rules`' venue_user tickets `list` branch (`resource.data.venueId in venueIds()`)
 * requires to prove the query. Rules are not filters: an unclaimed venue id here wouldn't leak
 * data, it would fail the whole listen.
 *
 * Two subscriptions, each matching a registered `@goldstar/platform` `QUERIES` shape exactly (the
 * emulator doesn't enforce composite indexes, so only registered shapes are known-indexed —
 * the `guestTicketsByUidOrdered` lesson):
 * - `venueQueue`  — `venueId ==` + `status in [active valet]` + `orderBy times.requestedAt asc`,
 *   the same shape the operator live-ops board (`use-live-tickets.ts`) already runs in production.
 * - `venueParked` — `venueId ==` + `status == 'checked_in'` + `orderBy times.checkedInAt desc`,
 *   capped at 100 like goldstar-mobile's queue.
 *
 * Job tickets (drive_home/passenger_ride) can share the `requested` status value with valet, so
 * the in-motion result is additionally filtered to `jobType === 'valet'` client-side.
 */
export function useVenueTickets(operatorId: string | undefined, venueId: string | undefined): UseVenueTicketsResult {
  const [attempt, setAttempt] = useState(0);
  const [inMotion, setInMotion] = useState<Ticket[] | null>(null);
  const [parked, setParked] = useState<Ticket[] | null>(null);
  const [error, setError] = useState(false);

  // Resets DURING render when the subscription target changes, not synchronously inside the
  // effect (`react-hooks/set-state-in-effect`) — the same reset-state-on-prop-change idiom, for
  // the same one-frame-stale-answer reason, as `useDoc`'s `subscribedPath` in
  // `src/lib/firebase/hooks.ts` and `use-claim-venues.ts`'s `subscribedTarget`.
  const target = `${operatorId ?? ''}#${venueId ?? ''}#${attempt}`;
  const [subscribedTarget, setSubscribedTarget] = useState(target);
  if (target !== subscribedTarget) {
    setSubscribedTarget(target);
    setInMotion(null);
    setParked(null);
    setError(false);
  }

  useEffect(() => {
    if (!operatorId || !venueId) return;

    const { db } = firebase();
    const col = collection(db, `operators/${operatorId}/tickets`);
    const onError = () => setError(true);

    const unsubs: Unsubscribe[] = [
      onSnapshot(
        query(col, where('venueId', '==', venueId), where('status', 'in', [...ACTIVE_VALET_STATUSES]), orderBy('times.requestedAt', 'asc')),
        (snap) => setInMotion(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket).filter((t) => t.jobType === 'valet')),
        onError
      ),
      onSnapshot(
        query(col, where('venueId', '==', venueId), where('status', '==', 'checked_in'), orderBy('times.checkedInAt', 'desc'), limit(PARKED_LIMIT)),
        (snap) => setParked(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket)),
        onError
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [operatorId, venueId, attempt]);

  const tickets = useMemo(() => [...(inMotion ?? []), ...(parked ?? [])], [inMotion, parked]);

  return {
    tickets,
    loading: !error && Boolean(operatorId && venueId) && (inMotion === null || parked === null),
    error,
    retry: () => setAttempt((a) => a + 1),
  };
}
