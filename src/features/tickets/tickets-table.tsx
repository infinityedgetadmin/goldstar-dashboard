'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { Ticket, User, Venue } from '@goldstar/platform';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE, ticketSummary } from '@/features/live/status-copy';
import { attendantName, retrievalLabel, venueName, venueTimezone } from './ticket-format';

export interface TicketsTableProps {
  tickets: Ticket[];
  venues: Venue[];
  staffByUid: Map<string, User>;
  loading: boolean;
  hasSearched: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/**
 * Explorer results table (Plan 4b Task 4): time, venue, vehicle, plate, status, attendant,
 * retrieval time, payment, tip — columns per the brief, in that order. TanStack's
 * `getCoreRowModel` only: sorting/pagination/filtering are NOT delegated to the table (unlike
 * `data-table.tsx`'s generic `DataTable`) because the rows here are a server-paginated,
 * server-filtered result set via `ticketsSearch`, not a full local dataset — the "Load more"
 * button drives the next page through the callable, and re-sorting a partial result set
 * client-side would be misleading.
 */
export function TicketsTable({ tickets, venues, staffByUid, loading, hasSearched, hasMore, loadingMore, onLoadMore }: TicketsTableProps) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        id: 'time',
        header: 'Time',
        cell: ({ row }) => {
          const t = row.original;
          const tz = venueTimezone(venues, t.venueId);
          return <Text size="sm">{formatInTimeZone(new Date(t.times.checkedInAt), tz, 'MMM d, h:mm a')}</Text>;
        },
      },
      { id: 'venue', header: 'Venue', cell: ({ row }) => <Text size="sm">{venueName(venues, row.original.venueId)}</Text> },
      { id: 'vehicle', header: 'Vehicle', cell: ({ row }) => <Text size="sm">{ticketSummary(row.original)}</Text> },
      { id: 'plate', header: 'Plate', cell: ({ row }) => <Text size="sm">{row.original.vehicle.plate ?? '—'}</Text> },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill label={STATUS_LABEL[row.original.status]} tone={STATUS_TONE[row.original.status]} />,
      },
      { id: 'attendant', header: 'Attendant', cell: ({ row }) => <Text size="sm">{attendantName(row.original, staffByUid)}</Text> },
      { id: 'retrieval', header: 'Retrieval time', cell: ({ row }) => <Text size="sm">{retrievalLabel(row.original)}</Text> },
      {
        id: 'payment',
        header: 'Payment',
        cell: ({ row }) => <Text size="sm">{row.original.payment ? formatMoney(row.original.payment.total) : '—'}</Text>,
      },
      { id: 'tip', header: 'Tip', cell: ({ row }) => <Text size="sm">{row.original.payment ? formatMoney(row.original.payment.tip) : '—'}</Text> },
    ],
    [venues, staffByUid],
  );

  const table = useReactTable({ data: tickets, columns, getCoreRowModel: getCoreRowModel() });

  if (!hasSearched) {
    return <EmptyState title="Search for tickets" description="Choose a date range (and any filters) above, then Search." />;
  }
  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Searching…
      </Text>
    );
  }
  if (tickets.length === 0) {
    return <EmptyState title="No tickets match" description="Try widening the date range or clearing a filter." />;
  }

  return (
    <div className="space-y-4">
      <div className="border-border overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                role="link"
                tabIndex={0}
                aria-label={`Open ticket ${ticketSummary(row.original)}`}
                className="min-h-11 cursor-pointer"
                onClick={() => router.push(`/tickets/${row.original.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/tickets/${row.original.id}`);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={onLoadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
