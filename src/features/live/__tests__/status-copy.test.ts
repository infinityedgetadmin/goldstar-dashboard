import { describe, expect, it } from 'vitest';
import { ticketSummary } from '../status-copy';

describe('ticketSummary', () => {
  it('names a guest car by color, make and model', () => {
    expect(ticketSummary({ jobType: 'valet', vehicle: { color: 'Blue', make: 'Honda', model: 'Civic' } })).toBe('Blue Honda Civic');
    expect(ticketSummary({ jobType: 'drive_home', vehicle: { color: 'Red', make: 'Audi', model: 'Q5' } })).toBe('Red Audi Q5');
  });

  it('falls back to "Vehicle" for a guest car with no details yet', () => {
    expect(ticketSummary({ jobType: 'valet', vehicle: {} })).toBe('Vehicle');
  });

  it('names a ride "Ride", adding the fleet car once one is assigned', () => {
    // A ride's `vehicle` is the operator's car, not the guest's, so it never stands alone as the title.
    expect(ticketSummary({ jobType: 'passenger_ride', vehicle: {} })).toBe('Ride');
    expect(ticketSummary({ jobType: 'passenger_ride', vehicle: { color: 'Black', make: 'Lincoln', model: 'Navigator' } })).toBe('Ride · Black Lincoln Navigator');
  });
});
