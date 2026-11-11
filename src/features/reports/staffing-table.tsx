import type { VenueForecast } from '@goldstar/platform';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { WEEKDAY_LABELS } from './iso-week';

export interface StaffingTableProps {
  forecast: VenueForecast;
}

/**
 * Numeric staffing-suggestion table (Task 7 brief: "a staffing-suggestion table per upcoming
 * shift") — same 7×24 grid as `ForecastHeatmap`, rendered as `suggestedAttendants` counts rather
 * than a color ramp, so the recommendation is available without relying on color perception.
 */
export function StaffingTable({ forecast }: StaffingTableProps) {
  const total = forecast.suggestedAttendants.reduce((sum, row) => sum + row.hours.reduce((s, v) => s + v, 0), 0);
  if (total === 0) {
    return <EmptyState title="No staffing suggestions yet" description="Check back once a few weeks of rollups have run." />;
  }
  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          {Array.from({ length: 24 }, (_, h) => (
            <TableHead key={h} className="text-center">
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {forecast.suggestedAttendants.map((row) => (
          <TableRow key={row.weekday}>
            <TableCell className="font-medium">{WEEKDAY_LABELS[row.weekday]}</TableCell>
            {row.hours.map((value, h) => (
              <TableCell key={h} className="text-center">
                {value}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
