import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VehicleCard } from '../vehicle-card';

const AT = '2026-08-23T21:00:00.000Z';

describe('VehicleCard', () => {
  it('shows a valet guest their own car and when it was checked in', () => {
    render(<VehicleCard jobType="valet" status="checked_in" summary="Blue Honda Civic" checkedInAt={AT} />);
    expect(screen.getByRole('region', { name: 'Your vehicle' })).toBeInTheDocument();
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument();
    expect(screen.getByText(/^Checked in at /)).toBeInTheDocument();
  });

  it('shows a drive-home guest their own car, booked rather than checked in', () => {
    render(<VehicleCard jobType="drive_home" status="in_transit" summary="Red Audi Q5" checkedInAt={AT} />);
    expect(screen.getByText('Red Audi Q5')).toBeInTheDocument();
    expect(screen.getByText(/^Booked at /)).toBeInTheDocument();
    expect(screen.queryByText(/Checked in/)).not.toBeInTheDocument();
  });

  // Owner-demo capture: a ride's `vehicle` is the operator's fleet car, so the page told the guest
  // "YOUR VEHICLE · Black Lincoln Navigator · Checked in at 10:47 AM" (and "Your vehicle" as the
  // heading before a car was assigned).
  it('shows a ride as the ride, with the assigned fleet car', () => {
    render(
      <VehicleCard
        jobType="passenger_ride"
        status="en_route_to_pickup"
        summary="Black Lincoln Navigator"
        checkedInAt={AT}
        driver={{ firstName: 'Luis', vehicle: 'Black Lincoln Navigator' }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Your ride' })).toBeInTheDocument();
    expect(screen.queryByText('Your vehicle')).not.toBeInTheDocument();
    expect(screen.getByText('Black Lincoln Navigator')).toBeInTheDocument();
    expect(screen.getByText(/^Booked at /)).toBeInTheDocument();
  });

  it('says the car is not assigned yet for a ride without a driver', () => {
    render(<VehicleCard jobType="passenger_ride" status="confirmed" summary="Your vehicle" checkedInAt={AT} />);
    expect(screen.getByText('Car not assigned yet')).toBeInTheDocument();
    expect(screen.queryByText('Your vehicle')).not.toBeInTheDocument();
  });

  it('just says "Ride" for a closed or cancelled ride, which no longer has a driver', () => {
    render(<VehicleCard jobType="passenger_ride" status="cancelled" summary="Your vehicle" checkedInAt={AT} />);
    expect(screen.getByRole('heading', { name: 'Ride' })).toBeInTheDocument();
  });
});
