'use client';
import type { Ticket, User, Venue } from '@goldstar/platform';
import { Text } from '@/components/ui/typography';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TicketRow } from './ticket-row';

export interface VenueQueueColumnProps {
  operatorId: string;
  venue: Venue;
  tickets: Ticket[];
  staff: User[];
  staffByUid: Map<string, User>;
  onOpenTicket: (ticket: Ticket) => void;
}

/** One venue's column on the live-ops board: a header (name + active count) and its tickets,
 * oldest-first as `use-live-tickets.ts` sorts them, with completed jobs moved to the end. A
 * completed job stays listed until it closes (its driver's marker is still live) but needs no one,
 * so it doesn't count as active. */
export function VenueQueueColumn({ operatorId, venue, tickets, staff, staffByUid, onOpenTicket }: VenueQueueColumnProps) {
  const active = tickets.filter((t) => t.status !== 'completed');
  const ordered = [...active, ...tickets.filter((t) => t.status === 'completed')];
  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 rounded-lg bg-bg-secondary p-3">
      <div className="flex items-center justify-between gap-2">
        <Text size="sm" weight="semibold">
          {venue.name}
        </Text>
        <Badge variant="default" size="sm" aria-label={`${venue.name}: ${active.length} active`}>
          {active.length}
        </Badge>
      </div>
      {tickets.length === 0 ? (
        <EmptyState title="No active tickets" description="Nothing in progress at this venue right now." />
      ) : (
        <div className="flex flex-col gap-2">
          {ordered.map((ticket) => (
            <TicketRow
              key={ticket.id}
              operatorId={operatorId}
              ticket={ticket}
              venue={venue}
              staff={staff}
              staffByUid={staffByUid}
              onOpen={() => onOpenTicket(ticket)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
