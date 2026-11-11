'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isUuid, type Ticket } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useDoc } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { ClaimIntakeDialog } from '@/features/claims/claim-intake-dialog';

/**
 * `/claims/new?ticketId=` — `ticket-actions.tsx`'s "Open claim" button target (that file's own
 * comment: "the link is wired now so it's a 404, not a dead end... Task 5 builds it"). Page-level
 * admin+ gate mirrors `venues/new/page.tsx` exactly, for the same reason: `firestore.rules`' claims
 * create rule requires `isAdmin()` (owner/admin) or `isPlatformAdmin()` — NOT `isManager()`'s wider
 * lead-inclusive set the rest of the `(operator)` shell admits — so a lead who URL-navigates here
 * would otherwise fill out the whole form only to have the write denied by rules on submit.
 */
export default function NewClaimPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketId = searchParams.get('ticketId');
  const { claims, uid, status } = useSession();
  const operatorId = claims?.operatorId;
  const canAccess = claims?.roles.some((r) => r === 'owner' || r === 'admin' || r === 'platform_admin') ?? false;

  useEffect(() => {
    if (status === 'signed_in' && !canAccess) {
      router.replace('/no-access');
    }
  }, [status, canAccess, router]);

  const { data: ticket, loading: ticketLoading } = useDoc<Ticket>(operatorId && ticketId ? `operators/${operatorId}/tickets/${ticketId}` : undefined);

  if (!ticketId) {
    return (
      <EmptyState
        title="No ticket selected"
        description="Open a claim from a ticket's Actions panel — this page needs a ?ticketId= to file against."
      />
    );
  }

  // Final whole-branch review, final-wave item 14: a malformed/hand-edited `?ticketId=` (not a
  // real uuid) used to sail straight through to `useDoc` — the query would just never resolve a
  // doc, `ticketLoading` would settle `false`, and `ClaimIntakeDialog` would render anyway,
  // letting an admin fill out and submit a claim against a ticketId that can never be a real
  // ticket. `isUuid` is the same shape check `firestore.rules`' own ticket validation uses.
  if (!isUuid(ticketId)) {
    return <EmptyState title="Invalid ticket" description={`"${ticketId}" isn't a valid ticket id — open a claim from a ticket's Actions panel instead.`} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New claim" description={ticket ? `${ticket.vehicle.plate ?? ticket.id} · ticket ${ticket.id}` : `Ticket ${ticketId}`} />
      {canAccess && operatorId && !ticketLoading ? (
        <ClaimIntakeDialog
          operatorId={operatorId}
          ticketId={ticketId}
          createdByUid={uid ?? ''}
          guestName={ticket?.guest.name}
          onCreated={(claimId) => router.push(`/claims/${claimId}`)}
          onCancel={() => router.push(`/tickets/${ticketId}`)}
        />
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
