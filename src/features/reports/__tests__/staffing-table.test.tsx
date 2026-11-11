import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VenueForecast } from '@goldstar/platform';
import { StaffingTable } from '../staffing-table';

function emptyForecast(): VenueForecast {
  return {
    byWeekdayHour: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: Array.from({ length: 24 }, () => 0) })),
    suggestedAttendants: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: Array.from({ length: 24 }, () => 0) })),
  };
}

describe('StaffingTable', () => {
  it('shows an empty state when every suggestion is zero', () => {
    render(<StaffingTable forecast={emptyForecast()} />);
    expect(screen.getByText('No staffing suggestions yet')).toBeInTheDocument();
  });

  it('renders one row per weekday and the exact suggested count per hour', () => {
    const forecast = emptyForecast();
    forecast.suggestedAttendants[6]!.hours[9] = 3; // Saturday, 9am
    render(<StaffingTable forecast={forecast} />);
    expect(screen.getByText('Sunday')).toBeInTheDocument();
    const saturdayRow = screen.getByText('Saturday').closest('tr');
    expect(saturdayRow).not.toBeNull();
    expect(within(saturdayRow!).getByText('3')).toBeInTheDocument();
  });
});
