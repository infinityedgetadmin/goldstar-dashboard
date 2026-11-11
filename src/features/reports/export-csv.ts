import { METRIC_DEFINITIONS } from '@goldstar/platform';
import { formatMetricValue, metricValue } from './metric-value';
import type { VenueComparisonRow } from './venue-comparison-table';

export { downloadCsv } from '@/lib/download-csv';

const HEADER = ['Venue', ...METRIC_DEFINITIONS.map((d) => d.label)];

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Builds a CSV string from the CURRENTLY-loaded venue comparison rows (Task 7 brief: "CSV export
 * of the range") — no extra fetch, same convention as `payments/csv-export.ts`. One row per venue,
 * one column per `METRIC_DEFINITIONS` entry, in the same order the KPI tiles/comparison table use. */
export function comparisonRowsToCsv(rows: VenueComparisonRow[], currency: string): string {
  const dataRows = rows.map((row) => [row.venueName, ...METRIC_DEFINITIONS.map((def) => formatMetricValue(def.key, metricValue(def.key, row.metrics), currency))]);
  return [HEADER, ...dataRows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
