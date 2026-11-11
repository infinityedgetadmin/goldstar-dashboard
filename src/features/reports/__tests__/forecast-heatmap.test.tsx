import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VenueForecast } from '@goldstar/platform';
import { ForecastHeatmap, heatmapColor } from '../forecast-heatmap';

function emptyForecast(): VenueForecast {
  return {
    byWeekdayHour: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: Array.from({ length: 24 }, () => 0) })),
    suggestedAttendants: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: Array.from({ length: 24 }, () => 0) })),
  };
}

describe('heatmapColor', () => {
  it('renders the lightest shade at zero activity', () => {
    expect(heatmapColor(0, 10)).toBe('#fff7dd');
  });
  it('renders the darkest shade at peak activity', () => {
    expect(heatmapColor(10, 10)).toBe('#8e6b0a');
  });
  it('clamps a value above max to the darkest shade, never overshooting', () => {
    expect(heatmapColor(999, 10)).toBe('#8e6b0a');
  });
  it('does not divide by zero when max is 0 (an all-zero grid)', () => {
    expect(heatmapColor(0, 0)).toBe('#fff7dd');
  });
});

describe('ForecastHeatmap', () => {
  it('shows an empty state when every cell is zero, rather than a blank grid', () => {
    render(<ForecastHeatmap forecast={emptyForecast()} />);
    expect(screen.getByText('No forecast data yet')).toBeInTheDocument();
  });

  it('renders the 7x24 grid with an accessible label once there is real data', () => {
    const forecast = emptyForecast();
    forecast.byWeekdayHour[0]!.hours[10] = 5;
    render(<ForecastHeatmap forecast={forecast} />);
    expect(screen.getByRole('img', { name: 'Expected request volume by weekday and hour' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sunday 10:00, 5.0 expected requests')).toBeInTheDocument();
  });
});
