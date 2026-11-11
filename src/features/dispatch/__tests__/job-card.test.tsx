import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FleetVehicle, Ticket, User } from '@goldstar/platform';

const calls: Record<string, ReturnType<typeof vi.fn>> = {
  dispatchQuote: vi.fn(async () => ({ quote: { base: 2500, distanceMeters: 1, durationSec: 1, amount: 2500, breakdown: [] } })),
  staffCancelTicket: vi.fn(async () => ({ ok: true as const })),
  dispatchAssign: vi.fn(async () => ({ ok: true as const })),
};
vi.mock('@/lib/firebase/callables', () => ({ callable: (n: string) => calls[n] }));

import { JobCard } from '../job-card';

const driver: User = { uid: 'd1', displayName: 'Sam Driver', email: 'sam@x.example.com', operatorId: 'goldstar', roles: ['driver'], status: 'active', invitedAt: 'x', eligibility: { driveHome: true, passengerRide: true, reasons: [] } } as unknown as User;
const vehicle: FleetVehicle = { id: 'v1', operatorId: 'goldstar', plate: 'GS-100', make: 'Mercedes', model: 'Sprinter', color: 'White', capacity: 6, accessible: true, status: 'available' } as unknown as FleetVehicle;
const staffByUid = new Map([[driver.uid, driver]]);

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 't1',
    jobType: 'drive_home',
    status: 'requested',
    attendants: {},
    vehicle: {},
    times: { checkedInAt: 'x', requestedAt: '2026-08-23T20:00:00.000Z' },
    driveHome: { destination: { address: '123 Elm St', geo: { lat: 1, lng: 1 } }, chase: { status: 'pending' } },
    ...overrides,
  } as unknown as Ticket;
}

describe('JobCard', () => {
  // Owner-demo capture: every card read "Nm waiting" in red, completed jobs included (148m on a
  // finished drive home). The timer is for jobs waiting on the operator before a driver is out.
  it.each(['requested', 'confirmed'] as const)('shows the wait timer while the job waits on the office (%s)', (status) => {
    render(<JobCard ticket={ticket({ status })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.getByTestId('sla-timer')).toBeInTheDocument();
  });

  it.each(['quoted', 'assigned', 'en_route_to_guest', 'in_transit', 'arrived', 'completed'] as const)(
    'shows no wait timer once the job is with the guest or under way (%s)',
    (status) => {
      render(<JobCard ticket={ticket({ status, attendants: { primaryDriverUid: 'd1' } })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
      expect(screen.queryByTestId('sla-timer')).not.toBeInTheDocument();
    },
  );

  it('renders the destination, status pill, and SLA timer', () => {
    render(<JobCard ticket={ticket({})} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.getByText('123 Elm St')).toBeInTheDocument();
    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.getByTestId('sla-timer')).toBeInTheDocument();
  });

  it('shows "Unassigned" with no driver, and the primary (+ chase) name once assigned', () => {
    const { rerender } = render(<JobCard ticket={ticket({})} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();

    const chase: User = { ...driver, uid: 'd2', displayName: 'Chase Driver' };
    const map = new Map([[driver.uid, driver], [chase.uid, chase]]);
    rerender(
      <JobCard
        ticket={ticket({ status: 'assigned', attendants: { primaryDriverUid: 'd1', chaseDriverUid: 'd2' } })}
        drivers={[driver, chase]}
        vehicles={[vehicle]}
        staffByUid={map}
      />
    );
    expect(screen.getByText('Assigned to Sam Driver (chase: Chase Driver)')).toBeInTheDocument();
  });

  it('re-quote button appears only for a quoted job, and calls dispatchQuote with the ticket id', async () => {
    const { rerender } = render(<JobCard ticket={ticket({ status: 'requested' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.queryByRole('button', { name: 'Re-quote' })).toBeNull();

    rerender(<JobCard ticket={ticket({ status: 'quoted' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-quote' }));
    await waitFor(() => expect(calls.dispatchQuote).toHaveBeenCalledWith({ ticketId: 't1' }));
  });

  it('assign button appears only for a confirmed job, and opens the assign dialog', () => {
    const { rerender } = render(<JobCard ticket={ticket({ status: 'requested' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.queryByRole('button', { name: 'Assign driver' })).toBeNull();

    rerender(<JobCard ticket={ticket({ status: 'confirmed' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign driver' }));
    expect(screen.getByRole('dialog', { name: 'Assign driver' })).toBeInTheDocument();
  });

  // Fix round (Major #1, task-45-review.md): `in_transit`/`arrived` ARE cancellable, per a SECOND
  // cancel-transition group in the platform's own driveHome.ts/ride.ts (staff-only, owner/admin/
  // lead — no guest self-cancel — exactly the shape a dispatch-board action should have). The
  // original version of this test asserted the opposite and locked in a real gap; `completed` is
  // the actual non-cancellable boundary for a drive_home/ride job.
  it('cancel button appears for a cancellable status (including in_transit and arrived) and disappears for the true non-cancellable boundary (completed)', () => {
    const { rerender } = render(<JobCard ticket={ticket({ status: 'confirmed' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    rerender(<JobCard ticket={ticket({ status: 'in_transit' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    rerender(<JobCard ticket={ticket({ status: 'arrived' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    rerender(<JobCard ticket={ticket({ status: 'completed' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('cancel button opens the cancel dialog and submits through staffCancelTicket', async () => {
    render(<JobCard ticket={ticket({ status: 'requested' })} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Guest changed plans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel ticket' }));
    await waitFor(() => expect(calls.staffCancelTicket).toHaveBeenCalledWith({ ticketId: 't1', reason: 'Guest changed plans' }));
  });

  // Title fixed (Major #1, task-45-review.md): the original title's comparative claim ("not
  // cancellable for drive_home") was wrong — in_transit IS cancellable for drive_home too (see the
  // test above). This test only actually asserts the ride side; kept as its own case since it
  // exercises the ride jobType's shape (dropoff/accessible) rather than duplicating drive_home's.
  it('arrived_pickup is cancellable for a ride', () => {
    const rideTicket = { id: 't2', jobType: 'passenger_ride', status: 'arrived_pickup', attendants: {}, vehicle: {}, times: { checkedInAt: 'x', requestedAt: 'x' }, ride: { dropoff: { address: '1 Main St' }, accessible: false } } as unknown as Ticket;
    render(<JobCard ticket={rideTicket} drivers={[driver]} vehicles={[vehicle]} staffByUid={staffByUid} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
