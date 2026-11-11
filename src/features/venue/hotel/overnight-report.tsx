'use client';
import { useEffect, useMemo, useState } from 'react';
import { Moon } from 'lucide-react';
import type { Ticket } from '@goldstar/platform';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionTitle } from '@/components/ui/section-title';
import { StatTile } from '@/components/ui/stat-tile';
import { Text } from '@/components/ui/typography';
import { useSession } from '@/features/auth/use-session';
import { formatDateTime } from '@/lib/format';
import { useVenue } from '../venue-context';
import { useVenueTickets } from '../use-venue-tickets';

/** A car is "overnight" once it has been on the stand longer than this. */
export const OVERNIGHT_HOURS = 12;

/**
 * Cars checked in more than `OVERNIGHT_HOURS` ago. Exported for its own unit test.
 *
 * Keyed off `times.checkedInAt` — how long the car has been in the operator's custody — not off
 * status. A car that has been requested and is being retrieved has still been here overnight, and
 * the hotel still owes for it.
 */
export function overnightTickets(tickets: Ticket[], nowMs: number): Ticket[] {
  const cutoff = nowMs - OVERNIGHT_HOURS * 3600_000;
  return tickets
    .filter((t) => {
      const at = Date.parse(t.times.checkedInAt);
      return Number.isFinite(at) && at < cutoff;
    })
    .sort((a, b) => a.times.checkedInAt.localeCompare(b.times.checkedInAt));
}

/** "1d 3h" / "14h" — coarse on purpose, and exported for its own test. */
export function stayLength(checkedInAt: string, nowMs: number): string {
  const hours = Math.max(0, Math.floor((nowMs - Date.parse(checkedInAt)) / 3600_000));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Overnight report (Plan 7 T2, Ruling AS): which cars have been on the stand more than half a day.
 *
 * NEEDS NO PMS. It reads the venue's own live ticket feed and `times.checkedInAt` — nothing else.
 * That is why it is real on day one while the rest of the hotel portal runs against a mock: Ruling
 * H's "no Oracle adapter" constraint does not touch this screen at all.
 *
 * The feed is `useVenueTickets`, the same claim-scoped subscription the live board uses, so the
 * venue id comes from `useVenue()` and never from a prop or URL.
 */
export function OvernightReport() {
  const session = useSession();
  const { venue } = useVenue();
  const { tickets, loading, error } = useVenueTickets(session.claims?.operatorId, venue?.id);

  // One shared hourly tick: stay length is displayed in whole hours, so a faster interval would
  // re-render for no visible change. Same shape as the live board's minute tick.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60 * 60_000);
    return () => clearInterval(i);
  }, []);

  const rows = useMemo(() => overnightTickets(tickets, now), [tickets, now]);

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        id: 'vehicle',
        header: 'Vehicle',
        accessorFn: (t) => [t.vehicle.color, t.vehicle.make, t.vehicle.model].filter(Boolean).join(' '),
        cell: ({ row }) => (
          <div>
            <Text size="sm" weight="medium">
              {[row.original.vehicle.color, row.original.vehicle.make, row.original.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
            </Text>
            {row.original.vehicle.plate ? (
              <Text size="xs" color="tertiary">
                {row.original.vehicle.plate}
              </Text>
            ) : null}
          </div>
        ),
      },
      {
        id: 'room',
        header: 'Room',
        accessorFn: (t) => t.guest.room ?? '',
        cell: ({ row }) => (
          <Text as="span" size="sm" color={row.original.guest.room ? 'primary' : 'tertiary'}>
            {/* Populated by `pmsPostRoomCharge` when the car has been charged to a room (Ruling AS
                has the handler persist it). Blank until then — this portal cannot write it. */}
            {row.original.guest.room ?? '—'}
          </Text>
        ),
      },
      {
        id: 'checkedIn',
        header: 'Checked in',
        accessorFn: (t) => t.times.checkedInAt,
        cell: ({ row }) => <Text as="span" size="sm" color="secondary">{formatDateTime(row.original.times.checkedInAt)}</Text>,
      },
      {
        id: 'stay',
        header: 'On the stand',
        accessorFn: (t) => t.times.checkedInAt,
        cell: ({ row }) => (
          <Text as="span" size="sm" weight="medium">
            {stayLength(row.original.times.checkedInAt, now)}
          </Text>
        ),
      },
    ],
    [now]
  );

  return (
    <div className="space-y-3">
      <SectionTitle title="Overnight" />
      <Text size="sm" color="secondary">
        Cars on the stand longer than {OVERNIGHT_HOURS} hours.
      </Text>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile label="Overnight cars" value={loading ? '…' : rows.length} />
        <StatTile
          label="Longest stay"
          value={loading || rows.length === 0 ? '—' : stayLength(rows[0]!.times.checkedInAt, now)}
          subtitle="Oldest check-in still on the stand"
        />
      </div>
      {error ? (
        <EmptyState icon={<Moon />} title="Something went wrong" description="We couldn't load the stand's cars. Check your connection and try again." />
      ) : loading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Moon />} title="Nothing overnight" description={`No car has been on the stand longer than ${OVERNIGHT_HOURS} hours.`} />
      ) : (
        <DataTable columns={columns} data={rows} showColumnVisibility={false} showPagination={rows.length > 12} pageSize={12} searchPlaceholder="Filter…" />
      )}
    </div>
  );
}
