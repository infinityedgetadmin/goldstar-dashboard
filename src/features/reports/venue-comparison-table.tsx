'use client';
import { useMemo } from 'react';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { METRIC_DEFINITIONS, type Venue } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { formatMetricValue, metricValue, type VenueMetricsSummary } from './metric-value';

export interface VenueComparisonRow {
  venueId: string;
  venueName: string;
  metrics: VenueMetricsSummary;
}

/** Joins `venues` with the per-venue `analyticsSummary` output, dropping any venue the summary
 * has no data for (e.g. created after the selected range, or inactive with zero activity). Exported
 * standalone (used by `VenueComparisonTable` below) so this join/filter logic is independently
 * testable without needing to render the table. */
export function buildComparisonRows(venues: Venue[], venuesData: Record<string, VenueMetricsSummary>): VenueComparisonRow[] {
  return venues.filter((v) => venuesData[v.id] !== undefined).map((v) => ({ venueId: v.id, venueName: v.name, metrics: venuesData[v.id]! }));
}

export interface VenueComparisonTableProps {
  venues: Venue[];
  venuesData: Record<string, VenueMetricsSummary>;
  currency: string;
}

/**
 * Sortable venue comparison (Task 7 brief). Composes the existing `DataTable` (built-in
 * click-to-sort headers, column show/hide, search) rather than reimplementing sorting UI — every
 * `METRIC_DEFINITIONS` key gets its own toggleable column via `DataTable`'s "Columns" dropdown, so
 * this stays complete (every metric available) without forcing all 17 onto screen at once.
 *
 * Null values sort as the lowest possible number (`-Infinity`, sort-only — the CELL always renders
 * the real value via `formatMetricValue`, never `-Infinity`) — a common "nulls first when
 * ascending, last when descending" BI convention, not "nulls pinned to one end regardless of
 * direction" (which `@tanstack/react-table`'s stock sort model doesn't support without a custom
 * direction-aware comparator; not worth the complexity for this table). Disclosed in
 * task-7-report.md.
 */
export function VenueComparisonTable({ venues, venuesData, currency }: VenueComparisonTableProps) {
  const rows = useMemo(() => buildComparisonRows(venues, venuesData), [venues, venuesData]);

  const columns = useMemo<ColumnDef<VenueComparisonRow>[]>(
    () => [
      { accessorKey: 'venueName', header: 'Venue' },
      ...METRIC_DEFINITIONS.map(
        (def): ColumnDef<VenueComparisonRow> => ({
          id: def.key,
          header: def.label,
          accessorFn: (row: VenueComparisonRow) => metricValue(def.key, row.metrics) ?? -Infinity,
          cell: (ctx: CellContext<VenueComparisonRow, unknown>) => formatMetricValue(def.key, metricValue(def.key, ctx.row.original.metrics), currency),
        }),
      ),
    ],
    [currency],
  );

  return <DataTable columns={columns} data={rows} showColumnVisibility showPagination={false} searchPlaceholder="Filter venues..." />;
}
