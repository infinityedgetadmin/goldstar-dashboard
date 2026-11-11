import type { Ticket, User, Venue } from '@goldstar/platform';

/** Resolves a ticket's assigned attendant/driver uid, in the same priority order as
 * `ticket-drawer.tsx` (Task 3): claimant first, then the primary driver. */
export function attendantUid(t: Ticket): string | undefined {
  return t.attendants.claimedBy || t.attendants.primaryDriverUid;
}

/** Display name for a ticket's assigned attendant/driver, falling back to the raw uid (matches
 * `ticket-drawer.tsx`) when the staff list hasn't loaded that user, and "Unassigned" when nobody's
 * claimed it yet. */
export function attendantName(t: Ticket, staffByUid: Map<string, User>): string {
  const uid = attendantUid(t);
  if (!uid) return 'Unassigned';
  return staffByUid.get(uid)?.displayName ?? uid;
}

export function venueName(venues: Venue[], venueId: string): string {
  return venues.find((v) => v.id === venueId)?.name ?? venueId;
}

export function venueTimezone(venues: Venue[], venueId: string | undefined): string {
  return venues.find((v) => v.id === venueId)?.timezone || 'UTC';
}

/** `metrics.retrievalSec` (check-in to delivery/ready, computed server-side by
 * `ticket.handler.ts`) formatted as e.g. "6m 30s". Undefined until the ticket reaches the point
 * that metric is computed. */
export function retrievalLabel(t: Ticket): string {
  const sec = t.metrics?.retrievalSec;
  if (sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
