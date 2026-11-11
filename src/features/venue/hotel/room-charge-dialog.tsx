'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PlatformError, type Venue } from '@goldstar/platform';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Select } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { useSession } from '@/features/auth/use-session';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { useVenueTickets } from '../use-venue-tickets';
import type { FoundReservation } from './pms-lookup-dialog';

export interface RoomChargeDialogProps {
  venue: Venue;
  reservation: FoundReservation;
  onClose: () => void;
  onCharged: () => void;
}

/**
 * A no-post reservation is INFORMATION, not a fault. The hotel has marked this folio as unable to
 * accept charges — the PMS is doing its job and so is `venue.pms.noPostBehavior`. Under `block`
 * the handler refuses with `failed_precondition`; the host needs to know what to do next, not that
 * something broke. Same shape as the already-redeemed validation copy.
 *
 * WHY THIS DOES NOT MATCH ON THE ERROR MESSAGE (review M1). The first version keyed on
 * `err.code === 'failed_precondition'` alone, which was wrong: `pmsPostRoomCharge` also throws
 * that code for `'operator suspended'` (`requireActiveOperator`) and
 * `'pms not configured for this venue'`, both reachable from this dialog — so a suspended operator
 * told the front desk that EVERY room was flagged no-post, a specific untruth that sends staff to
 * argue with a guest about a folio restriction nobody set.
 *
 * The obvious repair — also require `err.message === 'no_post'` — is not available: the platform's
 * `toHttpsError` builds every failure as `new HttpsError(MAP[e.code], e.code, …)`, putting the
 * CODE on the wire as the message and discarding the handler's. `err('failed_precondition',
 * 'no_post')` therefore reaches this client as message `'failed_precondition'`, and gating on
 * `'no_post'` would make this branch dead code in production while still passing a test whose
 * fixture invents the message. (The exact fix belongs server-side: carry the reason in `details`,
 * which `toHttpsError` DOES forward — flagged to the platform half, not assumed here.)
 *
 * So this gates on what the client CAN determine: `noPost` from the lookup it was handed, and
 * `noPostBehavior` from the venue document. Together those are a NECESSARY condition for the
 * server's `no_post` throw — not a sufficient one (review N1; the first version of this comment
 * claimed "the condition the server actually tests", which overstated it). Two residuals, both
 * disclosed rather than papered over:
 *
 * - FALSE NEGATIVE: a folio flagged no-post BETWEEN the lookup and the charge. `noPost` is false
 *   here, so it falls through to the generic sanitized error — vague, but not false.
 * - FALSE POSITIVE: `requireActiveOperator` throws `failed_precondition` BEFORE the handler ever
 *   looks the reservation up, so a suspended operator charging an already-no-post reservation at a
 *   `block` venue still gets the no-post copy. Far narrower than the original bug — which hit
 *   EVERY room — and the advice the copy gives (take payment at the stand) stays correct even when
 *   the cause it names does not. Closing it needs the server-side `details.reason` (above); this
 *   comment is the honest account until then, not a claim of exactness.
 *
 * Under `fallback_card`, separately, a no-post reservation RESOLVES with `{fallback:'card'}` and
 * never reaches this catch at all — which is why `block` is part of the gate.
 */
function noPostCopy(err: unknown, reservation: FoundReservation, venue: Venue): string | null {
  if (!(err instanceof PlatformError) || err.code !== 'failed_precondition') return null;
  if (!reservation.noPost || venue.pms?.noPostBehavior !== 'block') return null;
  return "This room can't accept charges — the hotel has it marked no-post. Take payment from the guest at the stand instead.";
}

/**
 * Charges a valet ticket to a hotel room (Plan 7 T2, Ruling AS).
 *
 * `pmsPostRoomCharge { ticketId, reservationRef, room }` needs nothing persisted first — the
 * reservation is held in the caller's component state, straight from the lookup dialog. Ruling AS
 * has the handler persist `guest.reservationRef`/`guest.room` server-side, so this dialog performs
 * no ticket write of its own and could not do one if it wanted to (`venue_user` has no rules path
 * to those fields — see `pms-lookup-dialog.tsx`).
 *
 * NO AMOUNT IS SENT OR SHOWN. The contract carries none: the server prices the ticket and posts
 * what it computes. Displaying a figure here would promise a number this client did not calculate,
 * the same discipline as the POS validation dialog.
 *
 * BOTH `noPostBehavior` BRANCHES ARE HANDLED, and they are genuinely different outcomes:
 * - `block`   -> the handler refuses; the host is told to take card payment at the stand.
 * - `fallback_card` -> the handler RESOLVES with `{ fallback: 'card' }`; the charge did not
 *   happen and the guest must pay by card. The venue portal has no payment surface of its own —
 *   a hotel front-desk user cannot take a valet payment — so "route to card payment" here means
 *   telling the host plainly. Inventing a payment UI in this portal would be worse than saying so.
 *
 * NEITHER OUTCOME CLOSES THE DIALOG (review L1). `fallback_card` used to call `onCharged()` — the
 * same close as a real charge — leaving a few seconds of toast as the only thing separating "money
 * moved" from "nothing was posted"; a host who glanced away saw identical outcomes for opposite
 * results. Both no-post outcomes now hold the dialog open with the copy rendered inline and the
 * footer collapsed to a single Close, so the result survives being looked away from. Retry is
 * removed with it deliberately: no-post is terminal for this reservation, and re-pressing Charge
 * would only reproduce it. A TRANSIENT failure keeps the picker and the button, because retrying
 * that one is exactly the right move.
 */
export function RoomChargeDialog({ venue, reservation, onClose, onCharged }: RoomChargeDialogProps) {
  const session = useSession();
  const { tickets, loading } = useVenueTickets(session.claims?.operatorId, venue.id);
  const [ticketId, setTicketId] = useState('');
  const [charging, setCharging] = useState(false);
  /** Set on either no-post outcome; its presence is what turns the dialog into a result screen. */
  const [noPostResult, setNoPostResult] = useState<string | null>(null);

  const ticketOptions = useMemo(
    () =>
      tickets.map((t) => ({
        value: t.id,
        label: [t.vehicle.color, t.vehicle.make, t.vehicle.model].filter(Boolean).join(' ') || t.vehicle.plate || t.id,
      })),
    [tickets]
  );

  const charge = async () => {
    if (!ticketId) return;
    setCharging(true);
    try {
      const res = await callable('pmsPostRoomCharge')({
        ticketId,
        reservationRef: reservation.reservationRef,
        room: reservation.room,
      });
      // v0.4.6 made this output a DISCRIMINATED UNION — `{postingRef} | {fallback:'card'}` — so
      // `res.fallback` no longer type-checks on the success arm and the discriminator has to narrow
      // first. `'fallback' in res` is that narrowing, and it is also the SAFE direction: keying on
      // `postingRef` presence instead would treat any future non-success arm as a completed charge,
      // which double-charges. The union closes the old `{}`-resolve hole the earlier contract
      // admitted; this branch's behaviour is unchanged.
      if ('fallback' in res) {
        // Resolved, but no money moved. `onCharged()` is NOT called: nothing was charged, and the
        // caller's "a charge happened" callback must not fire for an outcome that is the opposite.
        const copy = `Room ${reservation.room} can't accept charges, so nothing was posted. Take payment from the guest by card at the stand.`;
        setNoPostResult(copy);
        toast.info(copy);
        return;
      }
      toast.success(`Charged to room ${reservation.room}`);
      onCharged();
    } catch (e) {
      const noPost = noPostCopy(e, reservation, venue);
      if (noPost) {
        setNoPostResult(noPost);
        toast.info(noPost);
      } else toast.error(e);
    } finally {
      setCharging(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>Charge to room</DialogTitle>
          <DialogDescription>
            {noPostResult ? (
              <>
                {reservation.guestName} — room {reservation.room}. Nothing was charged.
              </>
            ) : (
              <>
                {reservation.guestName} — room {reservation.room}. Pick the guest&apos;s car; the
                valet stand calculates what&apos;s owed and posts it to the folio.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {noPostResult ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning-100 bg-warning-100/50 p-3 text-warning-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <Text size="sm" color="inherit">
              {noPostResult}
            </Text>
          </div>
        ) : (
          <div className="space-y-3">
            {reservation.noPost ? (
              <Text size="sm" color="secondary">
                The hotel has this room marked no-post, so the charge will most likely be refused.
              </Text>
            ) : null}

            <Select
              label="Guest's car"
              options={ticketOptions}
              placeholder={loading ? 'Loading cars…' : 'Select the car…'}
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              helperText="Cars currently at your venue."
              fullWidth
            />
            {!loading && ticketOptions.length === 0 ? (
              <Text size="sm" color="secondary">
                No cars are checked in at your venue right now, so there&apos;s nothing to charge.
              </Text>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {noPostResult ? (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={charging}>
                Cancel
              </Button>
              <Button onClick={() => void charge()} loading={charging} disabled={charging || !ticketId}>
                Charge room
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
