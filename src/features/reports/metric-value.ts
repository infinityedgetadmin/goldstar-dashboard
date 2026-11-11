import { METRIC_DEFINITIONS, type CallableOutput, type MetricKey } from '@goldstar/platform';
import { formatMoney } from '@/lib/format';

/** The shape `analyticsSummary` returns for `operator`/each entry of `venues` — `venueMetricsSchema`
 * minus `hourly` (the contract's own `venueMetricsSummary`, not separately exported by name). */
export type VenueMetricsSummary = CallableOutput<'analyticsSummary'>['operator'];

/**
 * Extracts one `METRIC_DEFINITIONS` key's value from a `VenueMetricsSummary` — most keys map
 * straight to a field, three are nested under `driveHome`/`rides`, and `claimsPer1000` is DERIVED
 * (the contract stores raw `claims`/`tickets` counts, not the pre-computed rate, matching
 * `METRIC_DEFINITIONS`' own `{key:'claimsPer1000', unit:'ratio'}` — "claims per 1,000 vehicles").
 * Null when the underlying field is null OR (for `claimsPer1000`) when there are zero tickets to
 * rate against — never a misleading 0.
 */
export function metricValue(key: MetricKey, vm: VenueMetricsSummary): number | null {
  switch (key) {
    case 'retrievalP50':
      return vm.retrievalP50;
    case 'retrievalP90':
      return vm.retrievalP90;
    case 'tickets':
      return vm.tickets;
    case 'throughputPerAttendantHour':
      return vm.throughputPerAttendantHour;
    case 'tipRate':
      return vm.tipRate;
    case 'avgTip':
      return vm.avgTip;
    case 'tips':
      return vm.tips;
    case 'revenue':
      return vm.revenue;
    case 'damageReports':
      return vm.damageReports;
    case 'claimsPer1000':
      return vm.tickets > 0 ? (vm.claims / vm.tickets) * 1000 : null;
    case 'laborCostPerVehicle':
      return vm.laborCostPerVehicle;
    case 'driveHomeJobs':
      return vm.driveHome.jobs;
    case 'driveHomeCompletionSec':
      return vm.driveHome.completionSec;
    case 'chaseUtilization':
      return vm.driveHome.chaseUtilization;
    case 'rides':
      return vm.rides.jobs;
    case 'credentialCompliance':
      return vm.credentialCompliance;
    case 'offlineSyncSuccess':
      return vm.offlineSyncSuccess;
  }
}

function formatSeconds(sec: number): string {
  const totalSec = Math.round(sec);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Renders one metric value per its `METRIC_DEFINITIONS` unit. `—` (em dash) for `null`, never a
 * misleading `0` or `NaN` — matches this dashboard's "never show a raw/undefined value" convention. */
export function formatMetricValue(key: MetricKey, value: number | null, currency: string): string {
  if (value === null) return '—';
  const unit = METRIC_DEFINITIONS.find((d) => d.key === key)?.unit;
  switch (unit) {
    case 'money':
      return formatMoney(Math.round(value), currency);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'sec':
      return formatSeconds(value);
    case 'ratio':
      return value.toFixed(2);
    case 'count':
    default:
      return Math.round(value).toLocaleString();
  }
}

/** Percent change of `current` vs `previous`, for a KPI tile's trend indicator. `null` when there's
 * no meaningful baseline (either side is null, or `previous` is 0 — a 0-to-anything "change" isn't a
 * percentage). */
export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
