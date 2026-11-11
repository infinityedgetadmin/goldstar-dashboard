import { METRIC_DEFINITIONS } from '@goldstar/platform';
import { StatTile } from '@/components/ui/stat-tile';
import { deltaPercent, formatMetricValue, metricValue, type VenueMetricsSummary } from './metric-value';

export interface KpiTilesProps {
  current: VenueMetricsSummary;
  previous: VenueMetricsSummary;
  currency: string;
}

/**
 * One tile per `METRIC_DEFINITIONS` entry (Task 7 brief: "KPI definitions come from
 * `METRIC_DEFINITIONS`") — value from `current`, trend vs. `previous` (the `analyticsSummary`
 * callable's own server-computed immediately-preceding period, same length). `StatTile.trend`
 * already renders the up/down arrow + "vs last period" copy (`src/components/ui/stat-tile.tsx`),
 * so this only needs to shape `{value, isPositive}` — `deltaPercent` returning `null` (no baseline,
 * or the metric itself is null) simply omits the `trend` prop rather than passing a fake 0%.
 */
export function KpiTiles({ current, previous, currency }: KpiTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {METRIC_DEFINITIONS.map((def) => {
        const value = metricValue(def.key, current);
        const delta = deltaPercent(value, metricValue(def.key, previous));
        return (
          <StatTile
            key={def.key}
            data-testid={`kpi-tile-${def.key}`}
            label={def.label}
            value={formatMetricValue(def.key, value, currency)}
            trend={delta === null ? undefined : { value: Math.round(Math.abs(delta) * 10) / 10, isPositive: delta >= 0 }}
          />
        );
      })}
    </div>
  );
}
