import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@goldstar/platform';
import { DriverPicker } from '../driver-picker';

function driver(uid: string, name: string, driveHome: boolean, passengerRide: boolean): User {
  return { uid, displayName: name, email: `${uid}@x.example.com`, operatorId: 'goldstar', roles: ['driver'], status: 'active', invitedAt: 'x', eligibility: { driveHome, passengerRide, reasons: driveHome && passengerRide ? [] : ['license_expired'] } } as unknown as User;
}

describe('DriverPicker', () => {
  it('shows "No drivers available" when the list is empty', () => {
    render(<DriverPicker label="Primary driver" drivers={[]} requiredField="driveHome" value={undefined} onChange={() => {}} />);
    expect(screen.getByText('No drivers available.')).toBeInTheDocument();
  });

  it('gates on the requiredField, not the other eligibility flag', () => {
    const rideOnlyEligible = driver('d1', 'Ride Only', false, true);
    render(<DriverPicker label="Driver" drivers={[rideOnlyEligible]} requiredField="passengerRide" value={undefined} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /ride only/i })).not.toBeDisabled();
  });

  it('disables a driver ineligible for the requiredField even though the other flag is true', () => {
    const driveHomeOnlyEligible = driver('d1', 'Drive Home Only', true, false);
    render(<DriverPicker label="Driver" drivers={[driveHomeOnlyEligible]} requiredField="passengerRide" value={undefined} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /drive home only/i })).toBeDisabled();
  });

  it('calls onChange with the uid when an eligible driver is clicked', () => {
    const onChange = vi.fn();
    render(<DriverPicker label="Driver" drivers={[driver('d1', 'Sam', true, true)]} requiredField="driveHome" value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /sam/i }));
    expect(onChange).toHaveBeenCalledWith('d1');
  });

  it('excludeUid greys out the matching driver with the given reason, even if otherwise eligible', () => {
    render(<DriverPicker label="Chase driver" drivers={[driver('d1', 'Sam', true, true)]} requiredField="driveHome" value={undefined} onChange={() => {}} excludeUid="d1" excludeReason="Already the primary driver" />);
    const row = screen.getByRole('radio', { name: /sam/i });
    expect(row).toBeDisabled();
    expect(screen.getByText('Already the primary driver')).toBeInTheDocument();
  });

  it('marks the selected driver aria-checked', () => {
    render(<DriverPicker label="Driver" drivers={[driver('d1', 'Sam', true, true), driver('d2', 'Alex', true, true)]} requiredField="driveHome" value="d2" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /sam/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /alex/i })).toHaveAttribute('aria-checked', 'true');
  });
});
