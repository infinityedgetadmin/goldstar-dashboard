import type { JobType, TicketStatus } from '@goldstar/platform';
import type { StatusTone } from '@/components/ui/status-pill';

/**
 * Ticket-status copy/tone for the live ops board and ticket drawer — mirrors goldstar-mobile's
 * `src/components/ui/status-pill.tsx` `STATUS_LABEL`/`STATUS_TONE` maps exactly (same wording,
 * same semantic grouping) so a status reads identically on the dashboard as it does on a staff
 * member's phone. Not imported directly — the mobile app is a separate React Native package with
 * its own `Tone`/CSS-class scheme (`bg-*-100`/`text-*-700` NativeWind classes) that doesn't map
 * onto this repo's `StatusPill` (`tone: StatusTone` -> `Badge` variant), so the maps are kept in
 * lockstep by hand rather than shared.
 */
export const STATUS_LABEL: Record<TicketStatus, string> = {
  checked_in: 'Parked',
  requested: 'Requested',
  claimed: 'Claimed',
  retrieving: 'Retrieving',
  staged: 'Staged',
  ready: 'Ready',
  delivered: 'Delivered',
  closed: 'Closed',
  cancelled: 'Cancelled',
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  en_route_to_guest: 'En route',
  pre_drive_inspection: 'Inspection',
  in_transit: 'In transit',
  arrived: 'Arrived',
  completed: 'Completed',
  en_route_to_pickup: 'En route',
  arrived_pickup: 'Arrived',
};

export const STATUS_TONE: Record<TicketStatus, StatusTone> = {
  checked_in: 'neutral',
  requested: 'info',
  quoted: 'info',
  confirmed: 'info',
  claimed: 'positive',
  assigned: 'positive',
  en_route_to_guest: 'positive',
  en_route_to_pickup: 'positive',
  retrieving: 'positive',
  pre_drive_inspection: 'warning',
  staged: 'positive',
  in_transit: 'positive',
  arrived: 'positive',
  arrived_pickup: 'positive',
  ready: 'info',
  delivered: 'positive',
  completed: 'positive',
  closed: 'neutral',
  cancelled: 'negative',
};

/** A ticket's title. For valet and drive-home it is the guest's car (`color make model`, mirroring
 * goldstar-mobile's `ticket-card.tsx` `summary()`). A ride's `vehicle` is the operator's fleet car,
 * often not assigned yet, so a ride is titled "Ride", plus that car once there is one. */
export function ticketSummary(t: { jobType?: JobType; vehicle: { color?: string; make?: string; model?: string } }): string {
  const car = [t.vehicle.color, t.vehicle.make, t.vehicle.model].filter(Boolean).join(' ');
  if (t.jobType === 'passenger_ride') return car ? `Ride · ${car}` : 'Ride';
  return car || 'Vehicle';
}
