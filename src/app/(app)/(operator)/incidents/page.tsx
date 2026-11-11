'use client';
import { useMemo } from 'react';
import { orderBy, type QueryConstraint } from 'firebase/firestore';
import type { Incident, User, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { IncidentsTable } from '@/features/incidents/incidents-table';

const INCIDENTS_CONSTRAINTS: QueryConstraint[] = [orderBy('at', 'desc')];

/**
 * Incidents list (Plan 4b Task 6). Deliberately a single, UNCONSTRAINED `onSnapshot` over
 * `operators/{op}/incidents` — not a per-venue fan-out like `use-live-tickets.ts`'s own
 * live-board pattern (which the brief anticipated might be needed here too).
 *
 * Verified, not assumed: `(operator)/layout.tsx`'s `OperatorGate` already restricts EVERY route
 * under this shell to owner/admin/lead/platform_admin (`hasOperatorAccess` checks
 * `MANAGER_ROLE_SET`) — an attendant/driver/venue_user can never even reach this page.
 * `firestore.rules`' `incidents/{incidentId}` read rule grants `isManager()` (owner/admin/lead)
 * unconditional read of EVERY incident in the operator, with no venue filter required — so every
 * actual viewer of this page already satisfies that branch unconditionally, and a plain
 * collection-wide listener (no `where` clause) needs no registered index either. Disclosed in
 * task-6-report.md as a simplification over the brief's suggested fallback.
 */
export default function IncidentsPage() {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;

  const { data: incidents, loading: incidentsLoading } = useCollection<Incident>(
    operatorId ? `operators/${operatorId}/incidents` : undefined,
    INCIDENTS_CONSTRAINTS,
  );
  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const { data: staff, loading: staffLoading } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);
  const staffByUid = useMemo(() => new Map(staff.map((u) => [u.uid, u])), [staff]);

  if (!operatorId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Incidents" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Incidents" description="Damage, injury, theft, and other incidents reported by staff." />
      <IncidentsTable incidents={incidents} venues={venues} staffByUid={staffByUid} loading={incidentsLoading || venuesLoading || staffLoading} />
    </div>
  );
}
