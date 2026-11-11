'use client';
import { useRouter } from 'next/navigation';
import type { Ticket, User, Venue } from '@goldstar/platform';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { Button } from '@/components/ui/buttons';
import { STATUS_LABEL, STATUS_TONE, ticketSummary } from './status-copy';
import { TicketQuickActions } from './ticket-quick-actions';

export interface TicketDrawerProps {
  operatorId: string;
  ticket: Ticket | undefined;
  venue: Venue | undefined;
  staff: User[];
  staffByUid: Map<string, User>;
  onOpenChange: (open: boolean) => void;
}

/**
 * Minimal ticket detail drawer opened from a board row or a map marker: status, vehicle, and the
 * same manager quick actions the row offers — deliberately NOT a full ticket detail view (custody
 * timeline, photos, payment) — that's Task 4's scope per the controller's ruling; an "Open full
 * ticket" link routes to Task 4's `/tickets/[ticketId]` detail page for the rest, rather than
 * duplicating it here.
 *
 * `SheetDescription` (Fix round 1, task-3-review.md Minor): this is the only place in the whole
 * app that renders a `Sheet` at all, so there was no existing pattern to follow — added to match
 * `ReassignDialog`/`CancelTicketDialog`'s own `DialogDescription`, and to clear Radix's dev-console
 * a11y warning ("Missing `Description` or `aria-describedby={undefined}`") for real, not just
 * silence it.
 */
export function TicketDrawer({ operatorId, ticket, venue, staff, staffByUid, onOpenChange }: TicketDrawerProps) {
  const router = useRouter();
  const assigneeUid = ticket ? ticket.attendants.claimedBy || ticket.attendants.primaryDriverUid : undefined;
  const assignee = assigneeUid ? (staffByUid.get(assigneeUid)?.displayName ?? assigneeUid) : undefined;

  return (
    <Sheet open={!!ticket} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {ticket && (
          <div className="space-y-4">
            <SheetHeader>
              <SheetTitle>{ticketSummary(ticket)}</SheetTitle>
              <SheetDescription>Ticket status, vehicle, and quick actions.</SheetDescription>
            </SheetHeader>
            <StatusPill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
            <div className="space-y-1">
              <Text size="sm" weight="medium">
                Vehicle
              </Text>
              <Text size="sm" color="secondary">
                {[ticket.vehicle.color, ticket.vehicle.make, ticket.vehicle.model].filter(Boolean).join(' ') || '—'}
                {ticket.vehicle.plate ? ` · ${ticket.vehicle.plate}` : ''}
              </Text>
              {(ticket.zoneId || ticket.spotLabel) && (
                <Text size="xs" color="tertiary">
                  {[ticket.zoneId, ticket.spotLabel].filter(Boolean).join(' ')}
                </Text>
              )}
            </div>
            <Text size="sm" color="secondary">
              {assignee ? `Assigned to ${assignee}` : 'Unassigned'}
            </Text>
            <TicketQuickActions operatorId={operatorId} ticket={ticket} venue={venue} staff={staff} />
            <Button variant="ghost" size="sm" onClick={() => router.push(`/tickets/${ticket.id}`)}>
              Open full ticket
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
