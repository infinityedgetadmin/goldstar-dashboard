'use client';
import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Venue } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { formatMoney } from '@/lib/format';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';
import { buildPnlRows, type PnlRow } from './pnl';

export interface VenuePnlTableProps {
  venues: Venue[];
  venuesData: Record<string, VenueMetricsSummary>;
  currency: string;
}

function money(cents: number, currency: string) {
  return formatMoney(cents, currency);
}

/** Per-venue P&L (Task 7 brief). Composes `DataTable` (sortable, same as `VenueComparisonTable`). */
export function VenuePnlTable({ venues, venuesData, currency }: VenuePnlTableProps) {
  const rows = useMemo(() => buildPnlRows(venues, venuesData), [venues, venuesData]);

  const columns = useMemo<ColumnDef<PnlRow>[]>(
    () => [
      { accessorKey: 'venueName', header: 'Venue' },
      { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => money(getValue<number>(), currency) },
      { accessorKey: 'tips', header: 'Tips', cell: ({ getValue }) => money(getValue<number>(), currency) },
      { accessorKey: 'labor', header: 'Labor', cell: ({ getValue }) => money(getValue<number>(), currency) },
      { accessorKey: 'platformFees', header: 'Platform fees', cell: ({ getValue }) => money(getValue<number>(), currency) },
      { accessorKey: 'refunded', header: 'Refunded', cell: ({ getValue }) => money(getValue<number>(), currency) },
      {
        accessorKey: 'net',
        header: 'Net',
        cell: ({ getValue }) => {
          const value = getValue<number>();
          return (
            <Text size="sm" weight="medium" className={cn(value < 0 ? 'text-error-600' : 'text-success-600')}>
              {money(value, currency)}
            </Text>
          );
        },
      },
    ],
    [currency],
  );

  return <DataTable columns={columns} data={rows} showColumnVisibility={false} showPagination={false} searchPlaceholder="Filter venues..." />;
}
