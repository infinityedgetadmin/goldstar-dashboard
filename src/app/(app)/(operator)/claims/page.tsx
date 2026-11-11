'use client';
import { useMemo } from 'react';
import { documentId, orderBy, where, type QueryConstraint } from 'firebase/firestore';
import type { Claim, Ticket, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { ClaimsTable } from '@/features/claims/claims-table';

// Firestore's `in` operator caps at 30 values per query.
const FIRESTORE_IN_LIMIT = 30;

/**
 * Claims list (Task 5 brief). `'use client'` — `operatorId` only exists via `useSession()`, same
 * shape as `(operator)/tickets/page.tsx`.
 *
 * `ticketsById` is joined here (not inside `ClaimsTable`) via a single chunked `where(documentId(),
 * 'in', ticketIds)` query scoped to exactly the currently-loaded claims' own ticket ids — NOT the
 * whole `tickets` collection (which, unlike `venues`/`staff`, can be an unbounded, multi-thousand-row
 * history for an established operator). Capped at Firestore's 30-value `in` limit: damage claims are
 * expected to be far rarer than tickets themselves, so 30+ simultaneously-visible claims is an
 * accepted, disclosed edge case (a claim beyond the cap still renders — `ClaimsTable` falls back to a
 * short ticket-id label and UTC time for any claim whose ticket isn't in the map).
 */
export default function ClaimsPage() {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;

  const claimsConstraints = useMemo<QueryConstraint[]>(() => [orderBy('reportedAt', 'desc')], []);
  const { data: claimsList, loading: claimsLoading } = useCollection<Claim>(operatorId ? `operators/${operatorId}/claims` : undefined, claimsConstraints);

  const ticketIds = useMemo(() => [...new Set(claimsList.map((c) => c.ticketId))].slice(0, FIRESTORE_IN_LIMIT), [claimsList]);
  const ticketsConstraints = useMemo<QueryConstraint[]>(() => (ticketIds.length > 0 ? [where(documentId(), 'in', ticketIds)] : []), [ticketIds]);
  const { data: ticketsList } = useCollection<Ticket>(operatorId && ticketIds.length > 0 ? `operators/${operatorId}/tickets` : undefined, ticketsConstraints);
  const ticketsById = useMemo(() => new Map(ticketsList.map((t) => [t.id, t])), [ticketsList]);

  const { data: venues } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const timezoneForVenue = (venueId: string | undefined) => venues.find((v) => v.id === venueId)?.timezone || 'UTC';

  if (!operatorId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Damage claims" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Damage claims" description="Every damage claim filed from a ticket's Actions panel." />
      <ClaimsTable claims={claimsList} ticketsById={ticketsById} timezoneForVenue={timezoneForVenue} loading={claimsLoading} />
    </div>
  );
}
