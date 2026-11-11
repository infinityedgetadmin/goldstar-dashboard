'use client';
import type { Ticket, User, Venue } from '@goldstar/platform';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { SlaTimer } from './sla-timer';
import { STATUS_LABEL, STATUS_TONE, ticketSummary } from './status-copy';
import { TicketQuickActions } from './ticket-quick-actions';

export interface TicketRowProps {
  operatorId: string;
  ticket: Ticket;
  venue: Venue | undefined;
  staff: User[];
  /** uid -> display name, built once by `live-board.tsx` from the same `staff` list (mirrors
   * `clock-audit-panel.tsx`'s `staffByUid` idiom — no dedicated "use-user-names" hook exists in
   * this codebase to reuse; every other staff-lookup call site builds this same `Map` by hand). */
  staffByUid: Map<string, User>;
  onOpen: () => void;
}

function assigneeLabel(ticket: Ticket, staffByUid: Map<string, User>): string | undefined {
  const uid = ticket.attendants.claimedBy || ticket.attendants.primaryDriverUid;
  if (!uid) return undefined;
  return staffByUid.get(uid)?.displayName ?? uid;
}

/** One live-ops board row: vehicle summary, status, SLA wait timer, assignee, and the manager
 * quick actions. The wait timer is for valet tickets only: its 4/7-minute thresholds are the
 * retrieval SLA, and a drive-home or ride job's `requestedAt` is when the job was booked, so it
 * read as hours late for the whole trip. A completed job (kept on the board until it closes, so
 * its driver's map marker stays live) is muted and says it will close on its own. */
export function TicketRow({ operatorId, ticket, venue, staff, staffByUid, onOpen }: TicketRowProps) {
  const assignee = assigneeLabel(ticket, staffByUid);
  const done = ticket.status === 'completed';

  return (
    <Card variant="outlined" padding="sm" className={done ? 'space-y-2 opacity-70' : 'space-y-2'}>
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open ${ticketSummary(ticket)}`}>
        <div className="flex items-center justify-between gap-2">
          <Text size="sm" weight="semibold">
            {ticketSummary(ticket)}
          </Text>
          <StatusPill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {ticket.vehicle.plate && (
            <Text size="xs" color="secondary">
              {ticket.vehicle.plate}
            </Text>
          )}
          {(ticket.zoneId || ticket.spotLabel) && (
            <Text size="xs" color="secondary">
              {[ticket.zoneId, ticket.spotLabel].filter(Boolean).join(' ')}
            </Text>
          )}
          {ticket.jobType === 'valet' && ticket.times.requestedAt && <SlaTimer since={ticket.times.requestedAt} />}
          {done && (
            <Text size="xs" color="secondary">
              Done · closes automatically
            </Text>
          )}
        </div>
        <Text size="xs" color="tertiary">
          {assignee ? `Assigned to ${assignee}` : 'Unassigned'}
        </Text>
      </button>
      <TicketQuickActions operatorId={operatorId} ticket={ticket} venue={venue} staff={staff} />
    </Card>
  );
}
