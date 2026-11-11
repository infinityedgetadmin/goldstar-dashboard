'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { Incident, User, Venue } from '@goldstar/platform';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { venueName, venueTimezone } from '@/features/tickets/ticket-format';

export const INCIDENT_TYPE_LABEL: Record<Incident['type'], string> = {
  damage: 'Damage',
  injury: 'Injury',
  theft: 'Theft',
  altercation: 'Altercation',
  near_miss: 'Near miss',
  property: 'Property',
  other: 'Other',
};

export const INCIDENT_STATUS_LABEL: Record<Incident['status'], string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
};

export const INCIDENT_STATUS_TONE: Record<Incident['status'], StatusTone> = {
  open: 'warning',
  reviewing: 'info',
  resolved: 'positive',
};

function staffName(uid: string | undefined, staffByUid: Map<string, User>): string {
  if (!uid) return 'Unassigned';
  return staffByUid.get(uid)?.displayName ?? uid;
}

export interface IncidentsTableProps {
  incidents: Incident[];
  venues: Venue[];
  staffByUid: Map<string, User>;
  loading: boolean;
}

/** Incidents list (Task 6 brief): type, venue, reporter, ticket link, status, assigned — column
 * order matches the brief exactly. Mirrors `claims/claims-table.tsx` structurally (row click
 * navigates to detail). */
export function IncidentsTable({ incidents, venues, staffByUid, loading }: IncidentsTableProps) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<Incident>[]>(
    () => [
      { id: 'type', header: 'Type', cell: ({ row }) => <Text size="sm">{INCIDENT_TYPE_LABEL[row.original.type]}</Text> },
      { id: 'venue', header: 'Venue', cell: ({ row }) => <Text size="sm">{venueName(venues, row.original.venueId)}</Text> },
      {
        id: 'at',
        header: 'Reported',
        cell: ({ row }) => {
          const tz = venueTimezone(venues, row.original.venueId);
          return <Text size="sm">{formatInTimeZone(new Date(row.original.at), tz, 'MMM d, h:mm a')}</Text>;
        },
      },
      { id: 'reporter', header: 'Reporter', cell: ({ row }) => <Text size="sm">{staffName(row.original.reportedBy, staffByUid)}</Text> },
      {
        id: 'ticket',
        header: 'Ticket',
        cell: ({ row }) =>
          row.original.ticketId ? (
            <Link
              href={`/tickets/${row.original.ticketId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-body-sm font-medium text-text-primary hover:underline"
            >
              {row.original.ticketId.slice(0, 8)}
            </Link>
          ) : (
            <Text size="sm" color="tertiary">
              —
            </Text>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill label={INCIDENT_STATUS_LABEL[row.original.status]} tone={INCIDENT_STATUS_TONE[row.original.status]} />,
      },
      { id: 'assigned', header: 'Assigned', cell: ({ row }) => <Text size="sm">{staffName(row.original.assignedTo, staffByUid)}</Text> },
    ],
    [venues, staffByUid],
  );

  const table = useReactTable({ data: incidents, columns, getCoreRowModel: getCoreRowModel() });

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading…
      </Text>
    );
  }
  if (incidents.length === 0) {
    return <EmptyState title="No incidents reported" description="Incidents filed by staff will show up here." />;
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
              aria-label={`Open incident ${row.original.id}`}
              className="min-h-11 cursor-pointer"
              onClick={() => router.push(`/incidents/${row.original.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(`/incidents/${row.original.id}`);
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
