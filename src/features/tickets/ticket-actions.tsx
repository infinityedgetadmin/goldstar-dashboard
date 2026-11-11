'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ticket, User, Venue } from '@goldstar/platform';
import { Button } from '@/components/ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { ReassignDialog } from '@/features/live/reassign-dialog';
import { CancelTicketDialog } from '@/features/live/cancel-ticket-dialog';

const NOT_CANCELLABLE = new Set<Ticket['status']>(['closed', 'cancelled', 'delivered', 'completed']);

export interface TicketActionsProps {
  operatorId: string;
  ticket: Ticket;
  venue: Venue | undefined;
  staff: User[];
}

/**
 * Detail-page actions: Cancel and Reassign reuse Task 3's `CancelTicketDialog`/`ReassignDialog`
 * verbatim (DRY, per the house rule) rather than re-implementing the same `staffCancelTicket`/
 * `attendants.claimedBy` write here. "Open claim" routes to `/claims/new?ticketId=` even though
 * that page doesn't exist yet — Task 5 builds it (controller carry, task-4-brief.md); the link is
 * wired now so it's a 404, not a dead end with no path forward once Task 5 lands.
 */
export function TicketActions({ operatorId, ticket, venue, staff }: TicketActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'reassign' | 'cancel' | null>(null);
  const canReassign = ticket.jobType === 'valet';
  const cancellable = !NOT_CANCELLABLE.has(ticket.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {canReassign ? (
          <Button variant="secondary" onClick={() => setDialog('reassign')}>
            Reassign
          </Button>
        ) : (
          <Text size="xs" color="tertiary">
            Driver assignments are managed from Dispatch.
          </Text>
        )}
        {cancellable && (
          <Button variant="danger" onClick={() => setDialog('cancel')}>
            Cancel ticket
          </Button>
        )}
        <Button variant="secondary" onClick={() => router.push(`/claims/new?ticketId=${ticket.id}`)}>
          Open claim
        </Button>
      </CardContent>
      {dialog === 'reassign' && <ReassignDialog operatorId={operatorId} ticket={ticket} venue={venue} staff={staff} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && <CancelTicketDialog ticket={ticket} onClose={() => setDialog(null)} />}
    </Card>
  );
}
