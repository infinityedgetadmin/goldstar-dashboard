import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Ticket, User, FleetVehicle } from '@goldstar/platform';

vi.mock('@/lib/firebase/callables', () => ({ callable: () => vi.fn() }));

let jobsResult: { jobs: Ticket[]; loading: boolean } = { jobs: [], loading: false };
vi.mock('../use-jobs', () => ({ useJobs: () => jobsResult }));

const staff: User[] = [
  { uid: 'd1', displayName: 'Sam Driver', email: 'sam@x.example.com', operatorId: 'goldstar', roles: ['driver'], status: 'active', invitedAt: 'x', eligibility: { driveHome: true, passengerRide: true, reasons: [] } } as unknown as User,
];
const vehicles: FleetVehicle[] = [{ id: 'v1', operatorId: 'goldstar', plate: 'GS-100', make: 'Mercedes', model: 'Sprinter', color: 'White', capacity: 6, accessible: true, status: 'available' } as unknown as FleetVehicle];

vi.mock('@/lib/firebase/hooks', () => ({
  useCollection: (path: string | undefined) => {
    if (!path) return { data: [], loading: false, error: null };
    if (path.endsWith('/users')) return { data: staff, loading: false, error: null };
    if (path.endsWith('/fleetVehicles')) return { data: vehicles, loading: false, error: null };
    return { data: [], loading: false, error: null };
  },
}));

import { DispatchBoard } from '../dispatch-board';

function job(id: string, jobType: Ticket['jobType'], status: Ticket['status'], address: string): Ticket {
  const dest = jobType === 'drive_home' ? { driveHome: { destination: { address, geo: { lat: 1, lng: 1 } }, chase: { status: 'pending' } } } : { ride: { dropoff: { address, geo: { lat: 1, lng: 1 } }, accessible: false, pickup: { geo: { lat: 1, lng: 1 } }, passengers: 1, billTo: 'guest' } };
  return {
    id,
    jobType,
    status,
    attendants: {},
    vehicle: {},
    times: { checkedInAt: 'x', requestedAt: '2026-08-23T20:00:00.000Z' },
    ...dest,
  } as unknown as Ticket;
}

describe('DispatchBoard', () => {
  it('shows a loading state', () => {
    jobsResult = { jobs: [], loading: true };
    render(<DispatchBoard operatorId="goldstar" />);
    expect(screen.getByText('Loading dispatch board…')).toBeInTheDocument();
  });

  it('shows an empty state when there are no active jobs', () => {
    jobsResult = { jobs: [], loading: false };
    render(<DispatchBoard operatorId="goldstar" />);
    expect(screen.getByText('No active jobs')).toBeInTheDocument();
  });

  it('groups jobs into the five columns by status', () => {
    jobsResult = {
      loading: false,
      jobs: [
        job('j1', 'drive_home', 'requested', 'Requested Address'),
        job('j2', 'passenger_ride', 'confirmed', 'Confirmed Address'),
        job('j3', 'drive_home', 'assigned', 'Assigned Address'),
        job('j4', 'passenger_ride', 'in_transit', 'InTransit Address'),
        job('j5', 'drive_home', 'arrived', 'Arrived Address'),
      ],
    };
    render(<DispatchBoard operatorId="goldstar" />);

    expect(within(screen.getByTestId('dispatch-column-requested')).getByText('Requested Address')).toBeInTheDocument();
    expect(within(screen.getByTestId('dispatch-column-confirmed')).getByText('Confirmed Address')).toBeInTheDocument();
    expect(within(screen.getByTestId('dispatch-column-assigned')).getByText('Assigned Address')).toBeInTheDocument();
    expect(within(screen.getByTestId('dispatch-column-in_transit')).getByText('InTransit Address')).toBeInTheDocument();
    expect(within(screen.getByTestId('dispatch-column-arrived')).getByText('Arrived Address')).toBeInTheDocument();

    // Cross-check: a job never appears in a column it doesn't belong to.
    expect(within(screen.getByTestId('dispatch-column-requested')).queryByText('Confirmed Address')).toBeNull();
  });

  it('an empty column shows "None"', () => {
    jobsResult = { loading: false, jobs: [job('j1', 'drive_home', 'requested', 'Requested Address')] };
    render(<DispatchBoard operatorId="goldstar" />);
    expect(within(screen.getByTestId('dispatch-column-confirmed')).getByText('None')).toBeInTheDocument();
  });

  it('fits the five columns in the page width instead of fixed 288px columns that overflow it', () => {
    // Owner-demo capture: 5 x w-72 plus gaps is 1,504px, wider than the content area beside the
    // sidebar at 1440px, so "In transit" was cut off mid-card. The columns now share the width
    // (with a floor) and the board scrolls sideways only when even the floor doesn't fit.
    jobsResult = { loading: false, jobs: [job('j1', 'drive_home', 'requested', 'Requested Address')] };
    render(<DispatchBoard operatorId="goldstar" />);
    const column = screen.getByTestId('dispatch-column-requested');
    expect(column.className).not.toMatch(/\bw-72\b/);
    expect(column.parentElement?.className).toMatch(/\bgrid\b/);
    expect(column.parentElement?.className).toContain('grid-cols-[repeat(5,minmax(12rem,1fr))]');
  });
});
