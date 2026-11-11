'use client';
import { useState } from 'react';
import { BedDouble } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { useVenue } from '../venue-context';
import { PmsLookupDialog, type FoundReservation } from './pms-lookup-dialog';
import { RoomChargeDialog } from './room-charge-dialog';
import { OvernightReport } from './overnight-report';

/**
 * Hotel portal (Plan 7 T2, Ruling AS): find a guest's reservation, charge their car to the room,
 * and see what has been on the stand overnight.
 *
 * The two dialogs are chained through COMPONENT STATE only — the lookup hands a reservation to the
 * charge dialog and nothing is written in between. That is not a simplification: a `venue_user`
 * has no rules path to write `guest.reservationRef`/`guest.room`, and Ruling AS moved that write
 * into `pmsPostRoomCharge` server-side, where it also closes an audit gap (a room charge used to
 * record only its posting reference, so a disputed charge could not be traced to a reservation).
 *
 * NOT BUILT, both deferred with reasons rather than stubbed:
 * - Arrivals/departures — `pmsLookup`'s output carries no arrival or departure dates (the port
 *   declares them, the callable does not), and its input is a per-guest lookup rather than a date
 *   range, so there is nothing to enumerate from.
 * - The in-and-out toggle — `flags.inAndOut` has exactly one reference in the whole codebase, its
 *   own schema declaration. Nothing reads or writes it, and no client role may.
 */
export function HotelView() {
  const { venue } = useVenue();
  const [looking, setLooking] = useState(false);
  const [reservation, setReservation] = useState<FoundReservation | null>(null);

  // The Hotel nav item only appears for a PMS venue (`venueNav`), but the route is directly
  // reachable — a bookmark, or a two-venue host switching to their restaurant with this page open.
  // An honest explanation beats a search box wired to a callable with no PMS behind it.
  if (venue && !venue.pms) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hotel" description="Room charges and overnight cars." />
        <EmptyState
          icon={<BedDouble />}
          title="No hotel system connected"
          description={`${venue.name} isn't connected to a property management system, so there are no rooms to look up or charge. Ask your valet operator if this should be set up.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hotel"
        description={venue ? `${venue.name} — room charges and overnight cars.` : 'Room charges and overnight cars.'}
        actions={
          <Button onClick={() => setLooking(true)} disabled={!venue}>
            Find a reservation
          </Button>
        }
      />

      <Text size="sm" color="secondary">
        Look a guest up by name or room, then charge their car to the room. The valet stand works
        out what&apos;s owed.
      </Text>

      <OvernightReport />

      {looking && venue ? (
        <PmsLookupDialog
          venue={venue}
          onClose={() => setLooking(false)}
          onSelect={(r) => {
            setLooking(false);
            setReservation(r);
          }}
        />
      ) : null}

      {reservation && venue ? (
        <RoomChargeDialog
          venue={venue}
          reservation={reservation}
          onClose={() => setReservation(null)}
          onCharged={() => setReservation(null)}
        />
      ) : null}
    </div>
  );
}
