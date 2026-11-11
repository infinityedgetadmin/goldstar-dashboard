'use client';
import { useState } from 'react';
import { BedDouble } from 'lucide-react';
import type { CallableOutput, Venue } from '@goldstar/platform';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';

/**
 * One row of `pmsLookup`'s output, DERIVED from the contract rather than restated (review N1). The
 * hand-written interface this replaces carried a comment promising to mirror the contract — the
 * same promise-to-stay-in-sync that keeps going stale elsewhere. Deriving it means a field added,
 * renamed, or made optional in `@goldstar/platform` reaches every consumer of this type as a
 * compile error instead of as a lie in a comment.
 */
export type FoundReservation = CallableOutput<'pmsLookup'>['reservations'][number];

export interface PmsLookupDialogProps {
  venue: Venue;
  onClose: () => void;
  /** Hands the chosen reservation to the caller, which holds it in COMPONENT STATE — see below. */
  onSelect: (reservation: FoundReservation) => void;
}

/**
 * Finds a hotel guest's reservation by name or room (Plan 7 T2, Ruling AS).
 *
 * NO LINK STEP, DELIBERATELY. The original brief had this dialog write the chosen reservation onto
 * the ticket (`tickets.guest.reservationRef/room`). Scoping found that a `venue_user` cannot write
 * those fields — `firestore.rules`' only venue_user tickets-update branch is
 * `checked_in -> requested` with `onlyChanged(['status','times','hostRequest'])`, and the branch
 * that does permit guest edits is gated on `staffOf(op)`, which excludes `venue_user`. Ruling AS
 * resolved that by having `pmsPostRoomCharge` persist the link SERVER-side, which also closes an
 * audit gap: a room charge previously recorded only its posting reference, so a hotel disputing a
 * charge could not be told which reservation it was against.
 *
 * So this dialog is pure search. The selected reservation lives in the caller's state only long
 * enough to hand `reservationRef` and `room` to the charge dialog; nothing is written from here.
 *
 * The result shape is EXACTLY the contract's — `{reservationRef, guestName, room, noPost}`. There
 * are no arrival or departure dates because `pmsLookup`'s output does not carry them (the port
 * declares them; the callable does not), which is also why there is no arrivals/departures screen.
 */
export function PmsLookupDialog({ venue, onClose, onSelect }: PmsLookupDialogProps) {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [results, setResults] = useState<FoundReservation[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const search = async () => {
    // `pmsLookup`'s input has BOTH `name` and `room` optional, so an empty search is contractually
    // valid and would ask the PMS for everything. Required here instead of relying on the server.
    if (!name.trim() && !room.trim()) {
      setError('Enter a guest name or a room number.');
      return;
    }
    setError(undefined);
    setSearching(true);
    try {
      const res = await callable('pmsLookup')({
        venueId: venue.id,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(room.trim() ? { room: room.trim() } : {}),
      });
      setResults(res.reservations);
    } catch (e) {
      toast.error(e);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>Find a reservation</DialogTitle>
          <DialogDescription>
            Search {venue.name}&apos;s property management system by guest name or room number.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Guest name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(undefined);
              }}
              fullWidth
            />
            <Input
              label="Room"
              value={room}
              onChange={(e) => {
                setRoom(e.target.value);
                setError(undefined);
              }}
              error={error}
              fullWidth
            />
          </div>
          <Button variant="secondary" onClick={() => void search()} loading={searching} disabled={searching}>
            Search
          </Button>

          {results !== null && results.length === 0 ? (
            <EmptyState
              icon={<BedDouble />}
              title="No matching reservation"
              description="Check the spelling or the room number — the guest may have checked out already."
            />
          ) : null}

          {results !== null && results.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.map((r) => (
                <li key={r.reservationRef} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Text size="sm" weight="medium" className="truncate">
                      {r.guestName}
                    </Text>
                    <Text size="xs" color="tertiary">
                      Room {r.room}
                    </Text>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* A no-post reservation is flagged HERE as well as at charge time, so the host
                        sees it before choosing rather than only after being refused. */}
                    {r.noPost ? <StatusPill label="No post" tone="warning" /> : null}
                    <Button size="sm" variant="secondary" onClick={() => onSelect(r)}>
                      Charge room
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
