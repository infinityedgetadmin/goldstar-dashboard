import { StatTile } from '@/components/ui/stat-tile';
import { formatMoney } from '@/lib/format';
import type { VenueMetricsSummary } from '@/features/reports/metric-value';

export interface PortfolioTilesProps {
  operator: VenueMetricsSummary;
  /** Number of days in the selected range (inclusive), for the utilization denominator. */
  rangeDays: number;
  currency: string;
}

/**
 * Portfolio-level tiles (Task 7 brief: "portfolio revenue/margin (revenue − labor cost),
 * utilization (tickets per venue-hour)"). `margin` is exactly the brief's given formula (excludes
 * platform fees, unlike `pnl.ts`'s `net` — the brief names these as two DIFFERENT figures:
 * portfolio "margin" here vs. per-venue "net" on the P&L table).
 *
 * "Utilization (tickets per venue-hour)" has no single obvious denominator in the given contract —
 * neither a venue's operating-hours nor its clocked-staff-hours total is exposed on
 * `VenueMetricsSummary`. Interpreted here as tickets per WALL-CLOCK hour of the reporting period
 * itself (`tickets / (rangeDays * 24)`) — a portfolio-wide volume-intensity figure, not a
 * staffing-efficiency one (that's already `throughputPerAttendantHour`, its own KPI tile). Disclosed
 * judgment call in task-7-report.md.
 */
export function PortfolioTiles({ operator, rangeDays, currency }: PortfolioTilesProps) {
  const margin = operator.revenue - operator.laborCostTotal;
  const utilization = rangeDays > 0 ? operator.tickets / (rangeDays * 24) : 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile label="Portfolio revenue" value={formatMoney(operator.revenue, currency)} />
      <StatTile label="Margin" value={formatMoney(margin, currency)} subtitle="Revenue − labor cost" />
      <StatTile label="Utilization" value={`${utilization.toFixed(2)} / venue-hour`} subtitle="Tickets per hour across the range" />
    </div>
  );
}
