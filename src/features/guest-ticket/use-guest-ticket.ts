'use client';

import { useEffect, useState } from 'react';
import type { GuestTicket } from '@goldstar/platform';
import { subscribeGuestTicket } from '@/lib/public/firebase';

export type GuestTicketState = 'loading' | 'ready' | 'missing' | 'expired' | 'error';

/**
 * Subscribes to the live `guestTickets/{token}` doc and derives a small
 * state machine on top of it: `loading` until the first snapshot arrives,
 * `missing` when the doc doesn't exist (bad/rotated token), `expired` when
 * it exists but `expiresAt` has passed, `error` on a listener error, and
 * `ready` otherwise.
 *
 * `token` accepts `null` (Task 4 widening, disclosed in task-4-report.md):
 * `DriveHomeSheet`/`RideSheet` don't have a job token until
 * `guestRequestDriveHome`/`guestRequestRide` resolves, and need the SAME
 * live subscription (for both their own pay/tracking step routing AND the
 * driver-card tracking view) rather than two independent listeners on the
 * same doc — passing `null` before the job token exists just skips
 * subscribing, staying in `loading` rather than throwing on an empty
 * Firestore path segment.
 */
export function useGuestTicket(token: string | null) {
  const [ticket, setTicket] = useState<GuestTicket | null>(null);
  const [state, setState] = useState<GuestTicketState>('loading');

  useEffect(() => {
    if (!token) return;
    return subscribeGuestTicket(
      token,
      (t) => {
        if (!t) {
          setTicket(null);
          setState('missing');
          return;
        }
        setTicket(t);
        setState(Date.parse(t.expiresAt) < Date.now() ? 'expired' : 'ready');
      },
      () => setState('error')
    );
  }, [token]);

  return { ticket, state };
}
