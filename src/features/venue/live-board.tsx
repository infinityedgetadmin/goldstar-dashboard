'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Radio } from 'lucide-react';
import type { Ticket } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { useSession } from '@/features/auth/use-session';
import { STATUS_LABEL, STATUS_TONE, ticketSummary } from '@/features/live/status-copy';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { useVenue } from './venue-context';
import { useVenueTickets } from './use-venue-tickets';

/**
 * How long a car has been on the stand, from `times.checkedInAt` (Task 1b brief: wait time MUST
 * derive from check-in, not request time — the host cares how long the guest's car has been with
 * the valet overall). Exported for its own unit test.
 */
export function waitSince(checkedInAt: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(checkedInAt)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Venue-portal live board (Plan 7 Task 1b): every active car at the selected venue — status,
 * vehicle, wait time — read-only except a per-row "Request car" (on `checked_in` rows, the only
 * status where a host request is actionable) and a view of the assistance/accessible flags.
 *
 * "Request car" goes through the `venueHostRequest` callable (kind `car`, matched server-side by
 * the ticket's own `phoneLast4`) rather than any client write — the venue portal never writes a
 * ticket. Matched vs. unmatched result copy is the brief's exact pair.
 */
export function LiveBoard() {
  const session = useSession();
  const { venue } = useVenue();
  const operatorId = session.claims?.operatorId;
  const { tickets, loading, error, retry } = useVenueTickets(operatorId, venue?.id);

  // One shared minute tick for every row's wait-time cell — coarse on purpose (the value only
  // changes once a minute); `sla-timer.tsx` uses the same interval-in-component shape.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);

  const [requestingIds, setRequestingIds] = useState<ReadonlySet<string>>(new Set());

  const requestCar = async (ticket: Ticket) => {
    if (!venue) return;
    setRequestingIds((prev) => new Set(prev).add(ticket.id));
    try {
      const res = await callable('venueHostRequest')({
        venueId: venue.id,
        kind: 'car',
        phoneLast4: ticket.guest.phoneLast4,
        ...(ticket.guest.name ? { name: ticket.guest.name } : {}),
      });
      if (res.ticketId) toast.success('Car requested');
      else toast.info('No ticket found — the valet stand has been notified');
    } catch (e) {
      toast.error(e);
    } finally {
      setRequestingIds((prev) => {
        const next = new Set(prev);
        next.delete(ticket.id);
        return next;
      });
    }
  };

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        id: 'vehicle',
        header: 'Vehicle',
        accessorFn: (t) => `${ticketSummary(t)} ${t.vehicle.plate ?? ''}`,
        cell: ({ row }) => (
          <div>
            <Text size="sm" weight="medium">
              {ticketSummary(row.original)}
            </Text>
            {row.original.vehicle.plate ? (
              <Text size="xs" color="tertiary" className="font-mono uppercase">
                {row.original.vehicle.plate}
              </Text>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (t) => STATUS_LABEL[t.status],
        cell: ({ row }) => <StatusPill label={STATUS_LABEL[row.original.status]} tone={STATUS_TONE[row.original.status]} />,
      },
      {
        id: 'wait',
        header: 'On the stand',
        accessorFn: (t) => t.times.checkedInAt,
        cell: ({ row }) => (
          <Text as="span" size="sm" color="secondary">
            {waitSince(row.original.times.checkedInAt, now)}
          </Text>
        ),
      },
      {
        id: 'flags',
        header: 'Flags',
        enableSorting: false,
        cell: ({ row }) => {
          const { assistance, accessibleVehicle } = row.original.flags;
          if (!assistance && !accessibleVehicle) return null;
          return (
            <div className="flex flex-wrap gap-1">
              {assistance ? <StatusPill label="Needs assistance" tone="warning" /> : null}
              {accessibleVehicle ? <StatusPill label="Accessible" tone="info" /> : null}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const t = row.original;
          if (t.status !== 'checked_in') return null;
          return (
            <Button
              size="sm"
              variant="secondary"
              loading={requestingIds.has(t.id)}
              disabled={requestingIds.has(t.id)}
              onClick={() => void requestCar(t)}
              aria-label={`Request car: ${ticketSummary(t)}`}
            >
              Request car
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestCar closes over venue/requestingIds, both already deps
    [now, requestingIds, venue]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live board"
        description={venue ? `${venue.name} — cars on the stand right now.` : 'Cars on the stand right now.'}
      />
      {error ? (
        <EmptyState
          icon={<Radio />}
          title="Something went wrong"
          description="We couldn't load the live board. Check your connection and try again."
          action={<Button variant="secondary" onClick={retry}>Retry</Button>}
        />
      ) : loading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : tickets.length === 0 ? (
        <EmptyState icon={<Radio />} title="No cars right now" description="Vehicles checked in at this venue will appear here as guests arrive." />
      ) : (
        <DataTable columns={columns} data={tickets} searchPlaceholder="Filter vehicles…" showColumnVisibility={false} pageSize={25} />
      )}
    </div>
  );
}
