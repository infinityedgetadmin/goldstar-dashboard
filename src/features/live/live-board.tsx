'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Ticket, User, Venue } from '@goldstar/platform';
import { useLiveTickets } from './use-live-tickets';
import { useLiveLocations } from './use-live-locations';
import { VenueQueueColumn } from './venue-queue-column';
import { TicketDrawer } from './ticket-drawer';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';

/**
 * Loaded ONLY once actually rendered — `mapbox-gl` (plus its CSS) is a genuinely heavy dependency,
 * and this page is the ONLY place in the dashboard that needs it. Defined at module scope (not
 * inside the component body) so the lazy wrapper itself is stable across renders — `dynamic()`
 * called on every render would remount the map on every parent re-render, tearing down and
 * recreating the whole Mapbox instance. The actual `import('./live-map')` (and thus `mapbox-gl`)
 * only fires the first time `<LiveMap>` is actually rendered below, which only happens once a
 * `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` is configured — an operator running without one never pays
 * for this chunk at all.
 */
const LiveMap = dynamic(() => import('./live-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-64 items-center justify-center rounded-lg bg-bg-secondary">
      <Text size="sm" color="tertiary">
        Loading map…
      </Text>
    </div>
  ),
});

export interface LiveBoardProps {
  operatorId: string;
  venues: Venue[];
  staff: User[];
}

function jobHasRoute(t: Ticket): boolean {
  return Boolean(t.driveHome?.route || t.ride?.route);
}

/**
 * Live operations board (Plan 4b Task 3): a venue selector, one column per selected venue with
 * live active-ticket rows (`use-live-tickets.ts`), and a map (venue pins, driver markers, active
 * job routes) once `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` is configured. Clicking a row or a driver
 * marker opens the minimal `TicketDrawer`.
 */
export function LiveBoard({ operatorId, venues, staff }: LiveBoardProps) {
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>(() => venues.map((v) => v.id));
  // Bug fix (task-89-report.md): `live/page.tsx` mounts `LiveBoard` as soon as `operatorId` is known
  // from claims (near-instant) — NOT once `useCollection<Venue>`'s async Firestore listener has
  // delivered its first snapshot. `venues` is therefore `[]` on the very first render essentially
  // always, and the lazy `useState` initializer above only ever runs ONCE, at that first render —
  // it captures `[]` and never re-runs when `venues` later updates to the real list. Net effect: the
  // live board silently showed zero venues selected (and therefore zero tickets, "No venues
  // selected") for every operator, every time, until a staff member manually re-checked a venue —
  // caught by `dashboard.spec.ts`'s "a seeded live ticket appears on the live board" step, which a
  // fresh operator with exactly one venue hit unconditionally. This effect seeds the selection
  // exactly once, the first time `venues` actually has data — `seededRef` stops it from re-running
  // (and stomping a staff member's own deliberate deselection) on every subsequent `venues` update.
  // Final whole-branch review, final-wave item 16: the original one-shot "seeded" flag above never
  // re-armed once an operator's venues had been seeded — fine for the single-operator lifetime of
  // a normal mount, but this component has ALWAYS relied on `OperatorGate` remounting the whole
  // `(operator)` subtree (a fresh component instance, fresh state) whenever the signed-in operator
  // changes (a platform_admin "assume operator" switch). That's an incidental consequence of
  // `OperatorGate`'s own implementation, not a contract this component enforces itself — if
  // `OperatorGate` (or anything upstream) ever stopped remounting on an operatorId change,
  // `LiveBoard` would silently keep the PREVIOUS operator's venue selection (or an empty one, if
  // seeding hadn't happened yet) and never reseed for the new operator.
  //
  // Explicit fix: `seedTracker` records which `operatorId` the current seed state belongs to, plus
  // whether seeding has completed for it. Both the operatorId-change reset AND the "venues arrived
  // late" catch-up (the ORIGINAL bug this whole block exists to fix — `venues` is `[]` on the very
  // first render essentially always) are handled in ONE render-time check — React's documented
  // "adjust state when a prop changes" pattern, same as `useDoc`'s own final-wave fix — rather than
  // a `useEffect`, which would (a) let one render commit with stale/empty data first, and (b) is
  // exactly the shape `react-hooks/set-state-in-effect` flags as an anti-pattern when it's really
  // just derived-state synchronization. Deliberately `useState`, not a `useRef` boolean like the
  // very first version of this fix: mutating a ref's `.current` during RENDER (rather than in an
  // effect/event handler) violates the Rules of React — this repo's `react-hooks/refs` lint rule
  // catches exactly that (a real regression an earlier version of this fix introduced and had to be
  // corrected out of).
  const [seedTracker, setSeedTracker] = useState<{ operatorId: string; seeded: boolean }>({ operatorId, seeded: venues.length > 0 });
  if (seedTracker.operatorId !== operatorId) {
    const seeded = venues.length > 0;
    setSeedTracker({ operatorId, seeded });
    setSelectedVenueIds(seeded ? venues.map((v) => v.id) : []);
  } else if (!seedTracker.seeded && venues.length > 0) {
    // Same operator, `venues` just arrived on a later render (the async listener finally
    // delivered) — catch up without waiting for an effect.
    setSeedTracker((prev) => ({ ...prev, seeded: true }));
    setSelectedVenueIds(venues.map((v) => v.id));
  }
  const [openTicketId, setOpenTicketId] = useState<string | undefined>(undefined);

  const venueById = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);
  const staffByUid = useMemo(() => new Map(staff.map((u) => [u.uid, u])), [staff]);

  const { ticketsByVenue } = useLiveTickets(operatorId, selectedVenueIds);
  const { data: liveLocations } = useLiveLocations(operatorId);

  const allTickets = useMemo(() => Object.values(ticketsByVenue).flat(), [ticketsByVenue]);
  const activeJobs = useMemo(() => allTickets.filter(jobHasRoute), [allTickets]);
  const openTicket = openTicketId ? allTickets.find((t) => t.id === openTicketId) : undefined;
  const openTicketVenue = openTicket ? venueById.get(openTicket.venueId) : undefined;

  // Fix round 1 (Minor, task-3-review.md): `liveLocations` (from `useLiveLocations`) is
  // operator-wide by design — the rules' `isManager()` read branch has no per-doc venue
  // constraint — but `activeJobs`/`ticketsByVenue` are scoped to `selectedVenueIds` (only selected
  // venues are even subscribed). Passing the RAW `liveLocations` straight to `<LiveMap>` used to
  // leave a driver's marker on the map after deselecting its venue, and clicking it was a silent
  // no-op (`openTicket` couldn't resolve a ticket the board wasn't tracking). Filtering markers to
  // tickets the board is actually tracking makes "deselect a venue" behave the same way for
  // markers as it already does for pins/columns/polylines — every remaining visible marker is
  // guaranteed clickable.
  const visibleTicketIds = useMemo(() => new Set(allTickets.map((t) => t.id)), [allTickets]);
  const visibleLiveLocations = useMemo(() => liveLocations.filter((loc) => visibleTicketIds.has(loc.ticketId)), [liveLocations, visibleTicketIds]);

  const toggleVenue = (venueId: string, checked: boolean) => {
    setSelectedVenueIds((prev) => (checked ? [...prev, venueId] : prev.filter((id) => id !== venueId)));
  };

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;

  const openTicketById = (ticketId: string) => setOpenTicketId(ticketId);

  if (venues.length === 0) {
    return <EmptyState title="No venues yet" description="Add a venue to start tracking live tickets." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {venues.map((venue) => {
          const id = `live-venue-${venue.id}`;
          return (
            <div key={venue.id} className="flex items-center gap-2">
              <Checkbox id={id} checked={selectedVenueIds.includes(venue.id)} onCheckedChange={(v) => toggleVenue(venue.id, v === true)} />
              <label htmlFor={id} className="cursor-pointer text-body-sm text-text-primary">
                {venue.name}
              </label>
            </div>
          );
        })}
      </div>

      <div className="h-96 overflow-hidden rounded-lg border border-border">
        {mapboxToken ? (
          <LiveMap
            token={mapboxToken}
            venues={venues.filter((v) => selectedVenueIds.includes(v.id))}
            liveLocations={visibleLiveLocations}
            activeJobs={activeJobs}
            onSelectTicket={openTicketById}
          />
        ) : (
          <EmptyState
            title="Map unavailable"
            description="Set NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN to show venue pins and live driver locations here."
          />
        )}
      </div>

      {selectedVenueIds.length === 0 ? (
        <EmptyState title="No venues selected" description="Check a venue above to see its live queue." />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {selectedVenueIds.map((venueId) => {
            const venue = venueById.get(venueId);
            if (!venue) return null;
            return (
              <VenueQueueColumn
                key={venueId}
                operatorId={operatorId}
                venue={venue}
                tickets={ticketsByVenue[venueId] ?? []}
                staff={staff}
                staffByUid={staffByUid}
                onOpenTicket={(ticket) => setOpenTicketId(ticket.id)}
              />
            );
          })}
        </div>
      )}

      <TicketDrawer
        operatorId={operatorId}
        ticket={openTicket}
        venue={openTicketVenue}
        staff={staff}
        staffByUid={staffByUid}
        onOpenChange={(open) => !open && setOpenTicketId(undefined)}
      />
    </div>
  );
}
