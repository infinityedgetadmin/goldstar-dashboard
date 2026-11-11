import type { GuestTicket } from '@goldstar/platform';
import type { GuestTicketState } from './use-guest-ticket';
import { StatusTimeline } from './status-timeline';
import { formatTime } from './vehicle-card';
import { Heading, Text } from '@/components/ui/typography';

/**
 * Static driver-location thumbnail, Mapbox Static Images API — same pattern as
 * `src/features/tickets/photo-gallery.tsx`'s `mapThumbnailUrl` (task-45-brief.md's named
 * precedent): a plain `<img src>`, no `mapbox-gl` JS bundle, so the guest (public) bundle pays
 * nothing for it beyond a URL string. Token-gated: `undefined` when
 * `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` isn't configured, same graceful-degrade contract as
 * `live-board.tsx`/`photo-gallery.tsx`. `pin-l` (large) + the brand bronze (`ab6034`, matching
 * `photo-gallery.tsx`'s own pin color) at zoom 14 — a single driver marker, not a route: the
 * `GuestTicket` projection carries no polyline (see this file's own header comment on the
 * destination gap below for the same "projection doesn't carry it" class of finding).
 */
function driverMapUrl(geo: { lat: number; lng: number }): string | undefined {
  const token = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
  if (!token) return undefined;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-l+ab6034(${geo.lng},${geo.lat})/${geo.lng},${geo.lat},14,0/320x160@2x?access_token=${token}`;
}

function DriverAvatar({ firstName, photoUrl }: { firstName: string; photoUrl?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- Storage-hosted, per-driver dynamic URL; matches photo-gallery.tsx's own <img> usage
    return <img src={photoUrl} alt={`${firstName}, your driver`} className="h-12 w-12 rounded-full object-cover" />;
  }
  // Graceful fallback (Task 5 brief: "photoUrl may be absent") — an initials circle rather than a
  // broken image or an empty gap.
  return (
    <div
      aria-hidden="true"
      className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-body-sm font-semibold text-primary-700"
    >
      {firstName.slice(0, 1).toUpperCase()}
    </div>
  );
}

export interface JobTrackingViewProps {
  ticket: GuestTicket | null;
  state: GuestTicketState;
}

/**
 * Job tracking view (Plan 5 Task 5, destination added in the v0.3.9 addendum round): status
 * steps, the destination, an ETA banner, a driver card (photo/name/vehicle), and a static
 * driver-location map — everything the `GuestTicket` projection for a drive_home/passenger_ride
 * job actually carries.
 *
 * Supersedes `src/features/guest-requests/tracking-view.tsx`'s `TrackingView` (deleted alongside
 * this file, task-45-report.md): same `{ ticket, state }` prop shape (drop-in for
 * `DriveHomeSheet`/`RideSheet`'s own tracking step) plus the map/ETA-banner/photo additions this
 * task adds, and now also used directly by `ticket-view.tsx`'s `linkedJobs` switcher.
 *
 * P3-R1 carry — RESOLVED (v0.3.9): the guest-facing `GuestTicket` projection previously carried no
 * destination field at all (disclosed as a gap in task-45-report.md); v0.3.9 adds
 * `driveHome.destination`/`ride.dropoff` to the projection (`guestTicketSchema`, populated by
 * `buildProjection` from `t.driveHome`/`t.ride` whenever a quote exists — i.e. from 'quoted'
 * onward for the job's whole lifecycle, so it's reliably present by the time this component is
 * ever actually shown for a tracking-worthy status). Read below as `destination`.
 */
export function JobTrackingView({ ticket, state }: JobTrackingViewProps) {
  if (state === 'loading' || !ticket) {
    return <div aria-busy="true" className="h-24 w-full animate-pulse rounded-2xl bg-bg-tertiary" />;
  }

  const destination = ticket.jobType === 'drive_home' ? ticket.driveHome?.destination.address : ticket.jobType === 'passenger_ride' ? ticket.ride?.dropoff.address : undefined;
  const eta = ticket.driver?.etaAt ? formatTime(ticket.driver.etaAt) : null;
  const map = ticket.driver?.geo ? driverMapUrl(ticket.driver.geo) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <StatusTimeline jobType={ticket.jobType} status={ticket.status} />

      {destination ? (
        <div>
          <Text size="xs" color="tertiary" className="uppercase tracking-wide">
            Going to
          </Text>
          <Text size="sm" weight="medium">
            {destination}
          </Text>
        </div>
      ) : null}

      {eta ? (
        <div className="rounded-2xl bg-primary-50 p-4" role="status">
          <Text size="xs" color="tertiary" className="uppercase tracking-wide">
            Estimated arrival
          </Text>
          <Heading level={3} variant="heading-xs" className="mt-0.5">
            {eta}
          </Heading>
        </div>
      ) : null}

      {ticket.driver ? (
        <div className="rounded-2xl border border-border bg-bg-primary p-4">
          <div className="flex items-center gap-3">
            <DriverAvatar firstName={ticket.driver.firstName} photoUrl={ticket.driver.photoUrl} />
            <div>
              <Text size="xs" color="tertiary" className="uppercase tracking-wide">
                Your driver
              </Text>
              <Heading level={3} variant="heading-xs" className="mt-0.5">
                {ticket.driver.firstName}
              </Heading>
              {ticket.driver.vehicle ? (
                <Text size="sm" color="secondary">
                  {ticket.driver.vehicle}
                </Text>
              ) : null}
            </div>
          </div>
          {map ? (
            // eslint-disable-next-line @next/next/no-img-element -- external static-map thumbnail, not a local asset
            <img src={map} alt={`${ticket.driver.firstName}'s current location`} className="mt-3 h-32 w-full rounded-lg object-cover" />
          ) : ticket.driver.geo ? (
            <Text size="xs" color="tertiary" className="mt-3">
              {ticket.driver.geo.lat.toFixed(4)}, {ticket.driver.geo.lng.toFixed(4)}
            </Text>
          ) : null}
        </div>
      ) : (
        <Text color="secondary">We&rsquo;ll assign a driver shortly.</Text>
      )}
    </div>
  );
}
