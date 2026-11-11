import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RatesEditor } from '../rates-editor';
describe('RatesEditor', () => {
  it('tiered model shows computed example prices from the contracts pricing', () => {
    const onChange = vi.fn();
    render(<RatesEditor value={{ valet: { model: 'tiered', items: [{ id: 't1', label: '0-2h', amount: 1000, upToMinutes: 120 }, { id: 't2', label: 'Day', amount: 3000 }], taxRateBps: 700, fees: [] }, driveHome: { base: 2500, perMile: 250, perMinute: 50, minimum: 3900 }, passengerRide: { base: 1000, perMile: 200, perMinute: 40, minimum: 1500 }, validations: { allowPartial: true, maxAmount: 1500 } }} onChange={onChange} currency="USD" />);
    expect(screen.getByText('1 h stay → $10.70')).toBeInTheDocument(); expect(screen.getByText('5 h stay → $32.10')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tax rate (%)'), { target: { value: '8' } }); expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ valet: expect.objectContaining({ taxRateBps: 800 }) }));
  });
});
