import type { Venue } from '@goldstar/platform';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';

export interface PnlRow {
  venueId: string;
  venueName: string;
  revenue: number;
  tips: number;
  labor: number;
  platformFees: number;
  /** Plan 8 Task 5 (contracts v0.4.9): money refunded out of the rows `revenue` counts. */
  refunded: number;
  net: number;
}

/**
 * Per-venue P&L row (Task 7 brief: "per-venue P&L rows (revenue, tips, labor, platform fees,
 * net)"). `net = revenue - refunded - labor - platformFees` — deliberately excludes `tips` (money the
 * operator collects and passes straight through to the delivering staff member; it never becomes
 * operator revenue in the first place, so subtracting it a second time from `net` would double-count
 * it as a cost). All 5 figures are exact sums from the rollup (`revenue`/`tips`/`laborCostTotal`/
 * `platformFees` — see `metricsDaily.ts`'s own comment on why the latter two were added as exact
 * totals rather than derived/estimated).
 */
export function pnlRow(venueId: string, venueName: string, vm: VenueMetricsSummary): PnlRow {
  // Plan 8 Task 5: `refunded` is the exact amount refunded out of the rows `revenue` counts
  // (partial refunds; a fully refunded row already left `revenue`), so net subtracts it. Before
  // v0.4.9 a partial refund silently inflated net by its full amount.
  return { venueId, venueName, revenue: vm.revenue, tips: vm.tips, labor: vm.laborCostTotal, platformFees: vm.platformFees, refunded: vm.refundedTotal, net: vm.revenue - vm.refundedTotal - vm.laborCostTotal - vm.platformFees };
}

/** Joins venues with their per-venue summary data into P&L rows, dropping a venue the summary has
 * no data for (matches `venue-comparison-table.tsx`'s `buildComparisonRows` convention). */
export function buildPnlRows(venues: Venue[], venuesData: Record<string, VenueMetricsSummary>): PnlRow[] {
  return venues.filter((v) => venuesData[v.id] !== undefined).map((v) => pnlRow(v.id, v.name, venuesData[v.id]!));
}
