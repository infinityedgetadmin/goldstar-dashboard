'use client';
import type { LiveLocation } from '@goldstar/platform';
import { useCollection, type LiveListResult } from '@/lib/firebase/hooks';

/** A live location doc with its id (`useCollection`'s standard `{ id: snap.id, ...data }` shape)
 * — the doc id under `firestore.rules`' `match /liveLocations/{uid}` IS the driver's uid. */
export interface LiveDriverLocation extends LiveLocation {
  id: string;
}

/**
 * Live-subscribes to every driver-on-an-active-job location for this operator (Plan 4b Task 3).
 *
 * Deliberately a bare, unconstrained `useCollection` — no `where()`. `firestore.rules`'
 * `liveLocations/{uid}` read rule (`isPlatformAdmin() || (inOperator(op) && (isManager() || ...))`)
 * grants a manager (owner/admin/lead — every viewer who can reach the `(operator)` shell at all,
 * per `OperatorLayout`'s gate) unconditional collection read with no per-doc venue check; adding a
 * client-side venue filter here would just be dead code the rule doesn't require, and this
 * operator-wide feed is exactly what the live map wants (driver markers regardless of which venue
 * column happens to be selected). `onSnapshot`-only, per this workspace's ledger constraint.
 */
export function useLiveLocations(operatorId: string | undefined): LiveListResult<LiveDriverLocation> {
  return useCollection<LiveDriverLocation>(operatorId ? `operators/${operatorId}/liveLocations` : undefined);
}
