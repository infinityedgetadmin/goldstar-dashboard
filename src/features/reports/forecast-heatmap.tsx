import type { VenueForecast } from '@goldstar/platform';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { WEEKDAY_LABELS } from './iso-week';

export interface ForecastHeatmapProps {
  forecast: VenueForecast;
}

const LIGHT = { r: 0xff, g: 0xf7, b: 0xdd }; // accent-100
const DARK = { r: 0x8e, g: 0x6b, b: 0x0a }; // accent-800

function toHex(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

/** Interpolates the brand accent (gold) ramp from `accent-100` (0 activity) to `accent-800` (peak
 * activity in this grid) — `max <= 0` (an all-zero venue) renders everything at the lightest shade
 * rather than dividing by zero. Exported standalone for testing without rendering the grid. */
export function heatmapColor(value: number, max: number): string {
  const t = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = LIGHT.r + (DARK.r - LIGHT.r) * t;
  const g = LIGHT.g + (DARK.g - LIGHT.g) * t;
  const b = LIGHT.b + (DARK.b - LIGHT.b) * t;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 7×24 CSS-grid heatmap of expected request volume (Task 7 brief: "heatmap (7×24 grid, CSS is
 * fine)") — each cell's fill comes from `heatmapColor`, its title/aria-label carries the exact
 * number for screen readers and hover, since color alone isn't an accessible encoding. Purely
 * visual; `StaffingTable` (same data, `suggestedAttendants`) is the numeric, fully-accessible
 * companion this page renders alongside it.
 */
export function ForecastHeatmap({ forecast }: ForecastHeatmapProps) {
  const max = Math.max(0, ...forecast.byWeekdayHour.flatMap((row) => row.hours));
  if (max === 0) {
    return <EmptyState title="No forecast data yet" description="Check back once a few weeks of rollups have run." />;
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[3rem_repeat(24,1fr)] gap-px" role="img" aria-label="Expected request volume by weekday and hour">
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <Text key={h} size="xs" color="tertiary" className="text-center">
            {h}
          </Text>
        ))}
        {forecast.byWeekdayHour.map((row) => (
          <div key={row.weekday} className="contents">
            <Text size="xs" color="tertiary" className="flex items-center">
              {WEEKDAY_LABELS[row.weekday]?.slice(0, 3)}
            </Text>
            {row.hours.map((value, h) => (
              <div
                key={h}
                title={`${WEEKDAY_LABELS[row.weekday]} ${h}:00 — ${value.toFixed(1)} expected requests`}
                aria-label={`${WEEKDAY_LABELS[row.weekday]} ${h}:00, ${value.toFixed(1)} expected requests`}
                className="aspect-square rounded-sm"
                style={{ backgroundColor: heatmapColor(value, max) }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
