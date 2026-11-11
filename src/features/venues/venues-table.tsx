'use client';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { Venue } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { useCollection } from '@/lib/firebase/hooks';

export interface VenuesTableProps {
  operatorId: string;
}

const STATUS_TONE: Record<Venue['status'], StatusTone> = { active: 'positive', inactive: 'neutral' };

const columns: ColumnDef<Venue>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link href={`/venues/${row.original.id}`} className="text-body-sm font-medium text-text-primary hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Text size="sm" className="capitalize">{row.original.type}</Text> },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusPill label={row.original.status} tone={STATUS_TONE[row.original.status]} />,
  },
  {
    id: 'city',
    header: 'City',
    cell: ({ row }) => (
      <Text size="sm">
        {row.original.address.city}, {row.original.address.region}
      </Text>
    ),
  },
  {
    id: 'pricing',
    header: 'Pricing model',
    cell: ({ row }) => (
      <Text size="sm" className="capitalize">
        {row.original.rates.valet.model}
      </Text>
    ),
  },
  {
    id: 'staticQr',
    header: 'Static QR',
    cell: ({ row }) => (
      <StatusPill label={row.original.qr.staticCheckoutEnabled ? 'On' : 'Off'} tone={row.original.qr.staticCheckoutEnabled ? 'positive' : 'neutral'} />
    ),
  },
];

/** Live venues list (`onSnapshot`-only, per this workspace's ledger constraint — no one-shot
 * `getDocs` read introduced here). */
export function VenuesTable({ operatorId }: VenuesTableProps) {
  const { data, loading, error } = useCollection<Venue>(`operators/${operatorId}/venues`);

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading venues…
      </Text>
    );
  }

  if (error) {
    return <EmptyState title="Couldn't load venues" description="Something went wrong. Please try again." />;
  }

  if (data.length === 0) {
    return <EmptyState title="No venues yet" description="Add your first venue to start taking tickets." />;
  }

  return <DataTable columns={columns} data={data} searchPlaceholder="Filter venues..." />;
}
