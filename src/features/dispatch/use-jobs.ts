'use client';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import type { Ticket, TicketStatus } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';

const JOB_TYPES_ACTIVE = ['drive_home', 'passenger_ride'] as const;

/** Every non-terminal drive_home/passenger_ride status — the full active-jobs feed for the
 * dispatch board (Plan 5 Task 4). Mirrors `DRIVE_HOME_STATUSES`/`RIDE_STATUSES` minus
 * `closed`/`cancelled`. */
export const ACTIVE_JOB_STATUSES: readonly TicketStatus[] = [
  'requested',
  'quoted',
  'confirmed',
  'assigned',
  'en_route_to_guest',
  'en_route_to_pickup',
  'arrived_pickup',
  'pre_drive_inspection',
  'in_transit',
  'arrived',
  'completed',
];

export interface UseJobsResult {
  jobs: Ticket[];
  loading: boolean;
}

/**
 * Live active-jobs feed for the dispatch board (Plan 5 Task 4): every drive_home/passenger_ride
 * ticket in a non-terminal status, operator-wide — no venue scoping. `@goldstar/platform`'s
 * registered `jobsActive` query (`{ collection: 'tickets', fields: ['jobType', 'status',
 * 'times.assignedAt'] }`, `src/queries.ts` in the platform repo) has no `venueId` field at all,
 * unlike `venueQueue` (`use-live-tickets.ts`) — confirmed this is deliberate, not an oversight:
 * dispatch is a cross-venue operator function (one driver/vehicle pool serves every venue), unlike
 * the per-venue live-ops queue.
 *
 * Verified against `firestore.indexes.json` in the platform repo: the registered composite index is
 * `(jobType ASC, status ASC, times.assignedAt ASC)` — but this hook deliberately does NOT add an
 * `orderBy('times.assignedAt')` clause. Why: Firestore excludes any document missing the `orderBy`
 * field from the result set entirely, and a pre-assignment job (status `requested`/`quoted`/
 * `confirmed`) has no `times.assignedAt` yet — ordering by it would silently drop the board's first
 * two columns (exactly the ones dispatchers most need to see). This query instead uses the SAME
 * registered index as an equality-only PREFIX match (`jobType in [...]` AND `status in [...]`, the
 * index's two leading fields — Firestore composite indexes serve prefix-only equality queries
 * without requiring the trailing orderBy field to be present on every doc) and sorts client-side by
 * `times.requestedAt`, which every job ticket has from creation — same "small operator-scoped feed,
 * sort in memory" approach `use-live-tickets.ts` already uses for its own per-venue grouping.
 *
 * `onSnapshot`-only, per this workspace's ledger constraint — no `getDocs` anywhere in this hook.
 */
export function useJobs(operatorId: string | undefined): UseJobsResult {
  const [jobs, setJobs] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!operatorId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { db } = firebase();
    const col = collection(db, `operators/${operatorId}/tickets`);
    const q = query(col, where('jobType', 'in', [...JOB_TYPES_ACTIVE]), where('status', 'in', [...ACTIVE_JOB_STATUSES]));
    const unsub: Unsubscribe = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket);
      rows.sort((a, b) => (a.times.requestedAt ?? '').localeCompare(b.times.requestedAt ?? ''));
      setJobs(rows);
      setLoading(false);
    });
    return unsub;
  }, [operatorId]);

  return { jobs, loading };
}
