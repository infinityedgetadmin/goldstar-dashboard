import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FleetVehicle, Ticket, User } from '@goldstar/platform';

const assign = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/firebase/callables', () => ({ callable: () => assign }));

import { AssignDialog } from '../assign-dialog';

function driver(uid: string, displayName: string, eligible: { driveHome: boolean; passengerRide: boolean }): User {
  return {
    uid,
    displayName,
    email: `${uid}@x.example.com`,
    operatorId: 'goldstar',
    roles: ['driver'],
    status: 'active',
    invitedAt: 'x',
    eligibility: { ...eligible, reasons: eligible.driveHome && eligible.passengerRide ? [] : ['license_expired'] },
  } as unknown as User;
}

const vehicle: FleetVehicle = {
  id: 'v1',
  operatorId: 'goldstar',
  plate: 'GS-100',
  make: 'Mercedes',
  model: 'Sprinter',
  color: 'White',
  capacity: 6,
  accessible: true,
  status: 'available',
} as unknown as FleetVehicle;

const driveHomeTicket = { id: 't1', jobType: 'drive_home' } as unknown as Ticket;
const rideTicket = { id: 't2', jobType: 'passenger_ride', ride: { accessible: false } } as unknown as Ticket;

describe('AssignDialog', () => {
  it('disables an ineligible driver, greying them out and blocking selection', () => {
    const eligible = driver('d1', 'Eligible Driver', { driveHome: true, passengerRide: true });
    const ineligible = driver('d2', 'Ineligible Driver', { driveHome: false, passengerRide: false });
    render(<AssignDialog open onOpenChange={() => {}} ticket={rideTicket} drivers={[eligible, ineligible]} vehicles={[vehicle]} />);

    expect(screen.getByRole('radio', { name: /ineligible driver/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^eligible driver/i })).not.toBeDisabled();
  });

  it('drive_home: distinct-driver enforcement — picking Driver A as primary disables Driver A (only) in the chase list', () => {
    const a = driver('d1', 'Driver A', { driveHome: true, passengerRide: true });
    const b = driver('d2', 'Driver B', { driveHome: true, passengerRide: true });
    render(<AssignDialog open onOpenChange={() => {}} ticket={driveHomeTicket} drivers={[a, b]} vehicles={[vehicle]} />);

    const primaryGroup = screen.getByRole('radiogroup', { name: 'Primary driver' });
    fireEvent.click(within(primaryGroup).getByRole('radio', { name: /driver a/i }));

    const chaseGroup = screen.getByRole('radiogroup', { name: 'Chase driver' });
    expect(within(chaseGroup).getByRole('radio', { name: /driver a/i })).toBeDisabled();
    expect(within(chaseGroup).getByRole('radio', { name: /driver b/i })).not.toBeDisabled();
  });

  it('drive_home: picking Driver B as chase disables Driver B (only) in the primary list', () => {
    const a = driver('d1', 'Driver A', { driveHome: true, passengerRide: true });
    const b = driver('d2', 'Driver B', { driveHome: true, passengerRide: true });
    render(<AssignDialog open onOpenChange={() => {}} ticket={driveHomeTicket} drivers={[a, b]} vehicles={[vehicle]} />);

    const chaseGroup = screen.getByRole('radiogroup', { name: 'Chase driver' });
    fireEvent.click(within(chaseGroup).getByRole('radio', { name: /driver b/i }));

    const primaryGroup = screen.getByRole('radiogroup', { name: 'Primary driver' });
    expect(within(primaryGroup).getByRole('radio', { name: /driver b/i })).toBeDisabled();
    expect(within(primaryGroup).getByRole('radio', { name: /driver a/i })).not.toBeDisabled();
  });

  it('ride: Assign stays disabled until both a driver and a vehicle are picked, then calls dispatchAssign with the ticket/driver/vehicle ids', async () => {
    const eligible = driver('d1', 'Eligible Driver', { driveHome: true, passengerRide: true });
    render(<AssignDialog open onOpenChange={() => {}} ticket={rideTicket} drivers={[eligible]} vehicles={[vehicle]} />);

    const assignButton = screen.getByRole('button', { name: 'Assign' });
    expect(assignButton).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /eligible driver/i }));
    expect(assignButton).toBeDisabled(); // driver picked, vehicle not yet

    fireEvent.click(screen.getByRole('radio', { name: /GS-100/i }));
    expect(assignButton).not.toBeDisabled();

    fireEvent.click(assignButton);
    await waitFor(() => expect(assign).toHaveBeenCalledWith({ ticketId: 't2', primaryDriverUid: 'd1', fleetVehicleId: 'v1' }));
  });

  it('drive_home: chase vehicle is optional — Assign enables with just primary + chase drivers picked, and omits fleetVehicleId', async () => {
    const a = driver('d1', 'Driver A', { driveHome: true, passengerRide: true });
    const b = driver('d2', 'Driver B', { driveHome: true, passengerRide: true });
    render(<AssignDialog open onOpenChange={() => {}} ticket={driveHomeTicket} drivers={[a, b]} vehicles={[vehicle]} />);

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Primary driver' })).getByRole('radio', { name: /driver a/i }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Chase driver' })).getByRole('radio', { name: /driver b/i }));

    const assignButton = screen.getByRole('button', { name: 'Assign' });
    expect(assignButton).not.toBeDisabled();
    fireEvent.click(assignButton);
    await waitFor(() => expect(assign).toHaveBeenCalledWith({ ticketId: 't1', primaryDriverUid: 'd1', chaseDriverUid: 'd2' }));
  });

  it('ride requiring an accessible vehicle greys out a non-accessible vehicle', () => {
    const eligible = driver('d1', 'Eligible Driver', { driveHome: true, passengerRide: true });
    const nonAccessible = { ...vehicle, id: 'v2', plate: 'GS-200', accessible: false } as unknown as FleetVehicle;
    const accessibleRide = { id: 't3', jobType: 'passenger_ride', ride: { accessible: true } } as unknown as Ticket;
    render(<AssignDialog open onOpenChange={() => {}} ticket={accessibleRide} drivers={[eligible]} vehicles={[vehicle, nonAccessible]} />);

    expect(screen.getByRole('radio', { name: /GS-200/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /GS-100/i })).not.toBeDisabled();
  });

  it('Cancel resets the picked selections (verified by reopening and checking Assign is disabled again)', () => {
    const eligible = driver('d1', 'Eligible Driver', { driveHome: true, passengerRide: true });
    const onOpenChange = vi.fn();
    const { rerender } = render(<AssignDialog open onOpenChange={onOpenChange} ticket={rideTicket} drivers={[eligible]} vehicles={[vehicle]} />);

    fireEvent.click(screen.getByRole('radio', { name: /eligible driver/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(<AssignDialog open onOpenChange={onOpenChange} ticket={rideTicket} drivers={[eligible]} vehicles={[vehicle]} />);
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
  });
});
