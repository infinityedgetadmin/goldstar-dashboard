import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RangePicker } from '../range-picker';
import { RANGE_PRESETS } from '../date-range';

const TZ = 'America/Indiana/Indianapolis';

describe('RangePicker', () => {
  it('calls onChange with the preset range when a preset button is clicked', () => {
    const onChange = vi.fn();
    render(<RangePicker value={{ from: '2020-01-01', to: '2020-01-01' }} onChange={onChange} timezone={TZ} />);
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    const expected = RANGE_PRESETS.find((p) => p.key === '30d')!.range(TZ);
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('opens the custom range inputs and applies a valid custom range', () => {
    const onChange = vi.fn();
    // Starts on a value that MATCHES a preset (`customOpen` therefore starts closed) so clicking
    // "Custom" reliably OPENS it — a value that matches no preset starts already-open instead.
    const initial = RANGE_PRESETS.find((p) => p.key === '30d')!.range(TZ);
    render(<RangePicker value={initial} onChange={onChange} timezone={TZ} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Range start date'), { target: { value: '2026-07-01' } });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-07-01', to: initial.to });
  });

  it('rejects an inverted custom range (end before start) without calling onChange', () => {
    const onChange = vi.fn();
    const initial = RANGE_PRESETS.find((p) => p.key === '30d')!.range(TZ);
    render(<RangePicker value={initial} onChange={onChange} timezone={TZ} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Range end date'), { target: { value: '2000-01-01' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('End date must be on or after the start date.')).toBeInTheDocument();
  });

  it('highlights the preset button matching the current value', () => {
    const range = RANGE_PRESETS.find((p) => p.key === 'today')!.range(TZ);
    render(<RangePicker value={range} onChange={vi.fn()} timezone={TZ} />);
    expect(screen.getByRole('button', { name: 'Today' })).toHaveClass('bg-primary-500');
  });
});
