'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { Claim, Ticket } from '@goldstar/platform';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/format';

export const CLAIM_STATUS_LABEL: Record<Claim['status'], string> = {
  intake: 'Intake',
  under_review: 'Under review',
  accepted: 'Accepted',
  denied: 'Denied',
  settled: 'Settled',
};

export const CLAIM_STATUS_TONE: Record<Claim['status'], StatusTone> = {
  intake: 'neutral',
  under_review: 'info',
  accepted: 'positive',
  denied: 'negative',
  settled: 'positive',
};

export interface ClaimsTableProps {
  claims: Claim[];
  /** Joined by the caller (`claims/page.tsx`) — ticketId -> Ticket, for the "Ticket" column's plate
   * label and the venue-tz `reportedAt` formatting. A claim whose ticket isn't in this map (a stale
   * join, or the ticket was archived — `firestore.rules`' `archive/{rest=**}` has no client read
   * path) falls back to a short ticket-id label and UTC formatting rather than blocking the row. */
  ticketsById: Map<string, Ticket>;
  timezoneForVenue: (venueId: string | undefined) => string;
  loading: boolean;
}

/** Claims list table (Task 5 brief): ticket, status, reportedAt, amount, insurer fields. */
export function ClaimsTable({ claims, ticketsById, timezoneForVenue, loading }: ClaimsTableProps) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<Claim>[]>(
    () => [
      {
        id: 'ticket',
        header: 'Ticket',
        cell: ({ row }) => {
          const t = ticketsById.get(row.original.ticketId);
          return <Text size="sm">{t?.vehicle.plate ?? row.original.ticketId.slice(0, 8)}</Text>;
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill label={CLAIM_STATUS_LABEL[row.original.status]} tone={CLAIM_STATUS_TONE[row.original.status]} />,
      },
      {
        id: 'reportedAt',
        header: 'Reported',
        cell: ({ row }) => {
          const t = ticketsById.get(row.original.ticketId);
          const tz = timezoneForVenue(t?.venueId);
          return <Text size="sm">{formatInTimeZone(new Date(row.original.reportedAt), tz, 'MMM d, yyyy h:mm a')}</Text>;
        },
      },
      {
        id: 'amount',
        header: 'Amount',
        cell: ({ row }) => <Text size="sm">{row.original.adjudication?.amount !== undefined ? formatMoney(row.original.adjudication.amount) : '—'}</Text>,
      },
      { id: 'insurer', header: 'Insurer', cell: ({ row }) => <Text size="sm">{row.original.insurer?.carrier ?? '—'}</Text> },
      { id: 'insurerClaimNumber', header: 'Insurer claim #', cell: ({ row }) => <Text size="sm">{row.original.insurer?.claimNumber ?? '—'}</Text> },
    ],
    [ticketsById, timezoneForVenue],
  );

  const table = useReactTable({ data: claims, columns, getCoreRowModel: getCoreRowModel() });

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading…
      </Text>
    );
  }
  if (claims.length === 0) {
    return <EmptyState title="No claims yet" description="Damage claims filed from a ticket's Actions panel will show up here." />;
  }

  return (
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
              aria-label={`Open claim ${row.original.id}`}
              className="min-h-11 cursor-pointer"
              onClick={() => router.push(`/claims/${row.original.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(`/claims/${row.original.id}`);
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
  );
}
