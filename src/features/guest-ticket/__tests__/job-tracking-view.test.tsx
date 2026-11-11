import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GuestTicket } from '@goldstar/platform';
import { JobTrackingView } from '../job-tracking-view';

const base = {
  operatorId: 'goldstar',
  ticketId: 'job1',
  venueName: 'St. Elmo',
  jobType: 'drive_home',
  status: 'en_route_to_guest',
  branding: { primaryColor: '#ab6034', accentColor: '#ffc30c', displayName: 'Goldstar' },
  vehicleSummary: 'Blue Honda Civic',
  times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
  payment: { status: 'authorized', base: 4500, tip: 0, tax: 0, fees: 0, total: 4500, currency: 'USD', tipPresets: [] },
  features: { driveHome: false, passengerRides: false },
  expiresAt: '2099-01-01T00:00:00.000Z',
  updatedAt: 'x',
} as unknown as GuestTicket;

describe('JobTrackingView', () => {
  // Same convention as live-board.test.tsx's own NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN handling — a
  // plain process.env mutation, not vi.stubEnv, matching what's already proven to work with this
  // repo's Next.js env-var read pattern under Vitest.
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
  });

  it('shows a loading skeleton while state is loading', () => {
    const { container } = render(<JobTrackingView ticket={null} state="loading" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders the status timeline and driver name/vehicle', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam', vehicle: 'White Sprinter Van' } }} state="ready" />);
    expect(screen.getByRole('list', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('White Sprinter Van')).toBeInTheDocument();
  });

  it('renders an ETA banner when driver.etaAt is set', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam', etaAt: '2026-08-23T21:20:00.000Z' } }} state="ready" />);
    expect(screen.getByRole('status')).toHaveTextContent('Estimated arrival');
  });

  it('renders no ETA banner when driver.etaAt is absent', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam' } }} state="ready" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('falls back to an initials avatar when driver.photoUrl is absent (graceful)', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam' } }} state="ready" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('renders a photo avatar when driver.photoUrl is present', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam', photoUrl: 'https://storage.example/sam.jpg' } }} state="ready" />);
    expect(screen.getByRole('img', { name: /sam, your driver/i })).toHaveAttribute('src', 'https://storage.example/sam.jpg');
  });

  it('shows an unassigned message when there is no driver yet', () => {
    render(<JobTrackingView ticket={{ ...base, status: 'confirmed' }} state="ready" />);
    expect(screen.getByText(/assign a driver shortly/i)).toBeInTheDocument();
  });

  it('renders a static driver-location map when driver.geo and NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN are both present', () => {
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test';
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam', geo: { lat: 39.7, lng: -86.1 } } }} state="ready" />);
    const img = screen.getByRole('img', { name: "Sam's current location" });
    expect(img).toHaveAttribute('src', expect.stringContaining('api.mapbox.com/styles/v1/mapbox/streets-v11/static'));
    expect(img).toHaveAttribute('src', expect.stringContaining('access_token=pk.test'));
  });

  it('degrades to plain coordinates text when driver.geo is present but no Mapbox token is configured', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam', geo: { lat: 39.7, lng: -86.1 } } }} state="ready" />);
    expect(screen.queryByRole('img', { name: "Sam's current location" })).toBeNull();
    expect(screen.getByText('39.7000, -86.1000')).toBeInTheDocument();
  });

  it('renders nothing (not even the coordinates fallback) when driver.geo is absent', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam' } }} state="ready" />);
    expect(screen.queryByText(/\d+\.\d+, -?\d+\.\d+/)).toBeNull();
  });

  // Addendum round (v0.3.9, P3-R1 carry resolved): the projection now carries
  // driveHome.destination/ride.dropoff — resolved from the previously-disclosed gap.
  it('renders the drive_home destination from driveHome.destination.address', () => {
    render(
      <JobTrackingView
        ticket={{ ...base, driver: { firstName: 'Sam' }, driveHome: { quote: { base: 2500, distanceMeters: 1, durationSec: 1, amount: 4500, breakdown: [] }, destination: { address: '123 Elm St, Indianapolis', geo: { lat: 39.7, lng: -86.1 } } } }}
        state="ready"
      />
    );
    expect(screen.getByText('Going to')).toBeInTheDocument();
    expect(screen.getByText('123 Elm St, Indianapolis')).toBeInTheDocument();
  });

  it('renders the passenger_ride destination from ride.dropoff.address', () => {
    render(
      <JobTrackingView
        ticket={{
          ...base,
          jobType: 'passenger_ride',
          status: 'en_route_to_pickup',
          driver: { firstName: 'Jamie' },
          ride: { quote: { base: 1200, distanceMeters: 1, durationSec: 1, amount: 1800, breakdown: [] }, dropoff: { address: '200 S Meridian St, Indianapolis', geo: { lat: 39.77, lng: -86.16 } }, passengers: 2 },
        }}
        state="ready"
      />
    );
    expect(screen.getByText('200 S Meridian St, Indianapolis')).toBeInTheDocument();
  });

  it('renders no destination section when neither driveHome nor ride carries one', () => {
    render(<JobTrackingView ticket={{ ...base, driver: { firstName: 'Sam' } }} state="ready" />);
    expect(screen.queryByText('Going to')).toBeNull();
  });
});
