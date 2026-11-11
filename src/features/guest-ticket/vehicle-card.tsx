import { TERMINAL_STATUSES, type GuestTicket, type JobType, type TicketStatus } from '@goldstar/platform';
import { Heading, Text } from '@/components/ui/typography';

/** Formats an ISO timestamp as a local time string, or `null` if it doesn't parse. */
export function formatTime(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(ms);
}

export interface VehicleCardProps {
  jobType: JobType;
  status: TicketStatus;
  /** The ticket's `vehicleSummary`: the guest's own car for valet and drive-home. */
  summary: string;
  checkedInAt: string;
  /** The projection's assigned-driver info; for a ride, `vehicle` is the fleet car. */
  driver?: Pick<NonNullable<GuestTicket['driver']>, 'firstName' | 'vehicle'> | undefined;
}

/**
 * The card at the top of the guest page. Valet and drive-home show the guest's own car. A ride's
 * `vehicle` is the operator's fleet car (the projection's placeholder is "Your vehicle" until one
 * is assigned), so a ride shows "Your ride" with the driver's car instead. Only a valet ticket was
 * "checked in"; a job was booked.
 */
export function VehicleCard({ jobType, status, summary, checkedInAt, driver }: VehicleCardProps) {
  const time = formatTime(checkedInAt);
  const ride = jobType === 'passenger_ride';
  const label = ride ? 'Your ride' : 'Your vehicle';
  const heading = ride ? (driver?.vehicle ?? (TERMINAL_STATUSES.includes(status) ? 'Ride' : 'Car not assigned yet')) : summary;
  return (
    <section aria-label={label} className="rounded-2xl border border-border bg-bg-primary p-5">
      <Text size="xs" color="tertiary" className="uppercase tracking-wide">
        {label}
      </Text>
      <Heading level={2} variant="heading-sm" className="mt-1">
        {heading}
      </Heading>
      {time ? (
        <Text size="sm" color="secondary" className="mt-1">
          {jobType === 'valet' ? 'Checked in at' : 'Booked at'} {time}
        </Text>
      ) : null}
    </section>
  );
}
