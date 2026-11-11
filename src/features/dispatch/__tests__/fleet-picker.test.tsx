import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FleetVehicle } from '@goldstar/platform';
import { FleetPicker } from '../fleet-picker';

function vehicle(id: string, plate: string, status: FleetVehicle['status'], accessible: boolean): FleetVehicle {
  return { id, operatorId: 'goldstar', plate, make: 'Mercedes', model: 'Sprinter', color: 'White', capacity: 6, accessible, status } as unknown as FleetVehicle;
}

describe('FleetPicker', () => {
  it('shows "No vehicles in the fleet" when the list is empty', () => {
    render(<FleetPicker label="Vehicle" vehicles={[]} value={undefined} onChange={() => {}} />);
    expect(screen.getByText('No vehicles in the fleet.')).toBeInTheDocument();
  });

  it('disables a vehicle that is not available, showing its status as the reason', () => {
    render(<FleetPicker label="Vehicle" vehicles={[vehicle('v1', 'GS-100', 'maintenance', true)]} value={undefined} onChange={() => {}} />);
    const row = screen.getByRole('radio', { name: /gs-100/i });
    expect(row).toBeDisabled();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });

  it('accessibleOnly disables an available-but-non-accessible vehicle', () => {
    render(<FleetPicker label="Vehicle" vehicles={[vehicle('v1', 'GS-100', 'available', false)]} value={undefined} onChange={() => {}} accessibleOnly />);
    const row = screen.getByRole('radio', { name: /gs-100/i });
    expect(row).toBeDisabled();
    expect(screen.getByText('Not accessible')).toBeInTheDocument();
  });

  it('does not gate on accessible when accessibleOnly is false', () => {
    render(<FleetPicker label="Vehicle" vehicles={[vehicle('v1', 'GS-100', 'available', false)]} value={undefined} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /gs-100/i })).not.toBeDisabled();
  });

  it('calls onChange with the vehicle id when an available vehicle is clicked', () => {
    const onChange = vi.fn();
    render(<FleetPicker label="Vehicle" vehicles={[vehicle('v1', 'GS-100', 'available', true)]} value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /gs-100/i }));
    expect(onChange).toHaveBeenCalledWith('v1');
  });

  it('allowNone renders a "No chase vehicle" option that calls onChange(undefined)', () => {
    const onChange = vi.fn();
    render(<FleetPicker label="Chase vehicle" vehicles={[vehicle('v1', 'GS-100', 'available', true)]} value="v1" onChange={onChange} allowNone />);
    fireEvent.click(screen.getByRole('radio', { name: 'No chase vehicle' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('omits the "No chase vehicle" option when allowNone is false', () => {
    render(<FleetPicker label="Vehicle" vehicles={[vehicle('v1', 'GS-100', 'available', true)]} value={undefined} onChange={() => {}} />);
    expect(screen.queryByRole('radio', { name: 'No chase vehicle' })).toBeNull();
  });
});
