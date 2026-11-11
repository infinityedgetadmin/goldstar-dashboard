'use client';

import { useEffect, useId, useState } from 'react';
import { PlatformError, type GuestTicket, type Quote } from '@goldstar/platform';
import type { Stripe } from '@stripe/stripe-js';
import { guestCall } from '@/lib/public/callables';
import { errorCopy } from '@/lib/public/error-copy';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { useStripeLoader } from '@/features/guest-pay/use-stripe-loader';
import { useGuestTicket } from '@/features/guest-ticket/use-guest-ticket';
import { JobTrackingView } from '@/features/guest-ticket/job-tracking-view';
import { AddressAutocomplete, type AddressSuggestion } from './address-autocomplete';
import { QuoteView, useQuoteExpiry } from './quote-view';
import { DialogShell } from './dialog-shell';
import { PaymentStep } from './payment-step';

export interface RideSheetProps {
  token: string;
  ticket: GuestTicket;
  onClose: () => void;
  /**
   * Fix round 1 (Ruling H); resume-quote (v0.3.9) and resume-at-confirmed (second addendum round)
   * behavior added since. Same resume semantics as `DriveHomeSheet.resumeToken` — see its JSDoc
   * for the full rationale (this sheet has no terms step, so the resume-at-confirmed path skips
   * straight to a plain re-call with no "Terms accepted" line).
   */
  resumeToken?: string;
}

const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 8;

// Statuses that mean "past the confirm/authorize step" for a passenger_ride
// job — mirrors ticket-view.tsx's RIDE_IN_PROGRESS set, minus 'requested'/
// 'quoted'/'confirmed' (still this sheet's own quote/pay steps).
const PAST_CONFIRM = new Set(['assigned', 'en_route_to_pickup', 'arrived_pickup', 'in_transit', 'arrived', 'completed']);

// Second addendum round — mirrors drive-home-sheet.tsx's `RESUME_BLOCKED_PAYMENT` exactly, same
// rationale (`runCheckout`'s own guard, job tickets use manual capture so 'authorized' — not
// 'paid' — is this ticket's own "guest already paid" terminal state; see that file's full comment).
const RESUME_BLOCKED_PAYMENT = new Set(['paid', 'authorized', 'room_charged', 'venue_billed']);

interface CheckoutState {
  clientSecret: string;
  total: number;
  stripe: Promise<Stripe | null>;
}

/**
 * Ride request sheet (Task 4): pickup/dropoff/passengers/accessible → quote
 * → confirm(jobToken) → payment → tracking. Same skeleton as
 * `DriveHomeSheet` (shared `DialogShell`/`QuoteView`/`PaymentStep`/
 * `JobTrackingView`/`useGuestTicket(jobToken)` step-routing), minus a terms
 * step — `guestConfirmRide`'s real input schema is `{ token }` only, no
 * `termsVersion` (verified against the installed dist; unlike
 * `guestConfirmDriveHome`, there's no vehicle-damage liability to
 * acknowledge for a ride in a Goldstar-driven vehicle).
 *
 * Real schema drift from a naive port of the drive-home flow (disclosed in
 * task-4-report.md): `guestRequestRide`'s `pickup.geo` is REQUIRED, but the
 * `GuestTicket` guest projection carries no venue geo/coordinates — only
 * `venueName`. Pickup is therefore its own `AddressAutocomplete` (seeded
 * with the venue name via `defaultQuery`, satisfying "pickup (venue
 * default)" as a prefilled, guest-editable starting point) rather than a
 * static value assembled from data this page doesn't have. `pickup`'s real
 * input shape also has no `placeId` field at all (only `dropoff`/
 * `destination` do) — the callable payload below omits it for pickup.
 */
export function RideSheet({ token, ticket, onClose, resumeToken }: RideSheetProps) {
  const loadStripeInstance = useStripeLoader();
  const passengersLabelId = useId();

  const [pickup, setPickup] = useState<AddressSuggestion | null>(null);
  const [dropoff, setDropoff] = useState<AddressSuggestion | null>(null);
  const [passengers, setPassengers] = useState(MIN_PASSENGERS);
  const [accessible, setAccessible] = useState(false);

  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobToken, setJobToken] = useState<string | null>(resumeToken ?? null);
  const [confirming, setConfirming] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);

  const { ticket: jobTicket, state: jobState } = useGuestTicket(jobToken);

  // Resume-quote (v0.3.9 addendum) — see drive-home-sheet.tsx's identical comment for the full
  // rationale; same shape here, just `ride`/`dropoff` instead of `driveHome`/`destination`.
  const resumedQuote = jobTicket?.status === 'quoted' ? jobTicket.ride?.quote : undefined;
  const resumedDestination = jobTicket?.status === 'quoted' ? jobTicket.ride?.dropoff.address : undefined;
  const effectiveQuote = quote ?? resumedQuote;
  const { expired, remainingMs } = useQuoteExpiry(effectiveQuote?.expiresAt);

  // Resume-at-confirmed (second addendum round) — see drive-home-sheet.tsx's identical comment.
  const resumeSummaryQuote = !quote ? jobTicket?.ride?.quote : undefined;
  const resumeSummaryDestination = !quote ? jobTicket?.ride?.dropoff.address : undefined;

  const requestQuote = async () => {
    if (!pickup || !dropoff) return;
    setRequesting(true);
    setError(null);
    try {
      const res = await guestCall('guestRequestRide')({
        token,
        pickup: { address: pickup.address, geo: pickup.geo },
        dropoff: { address: dropoff.address, geo: dropoff.geo, placeId: dropoff.placeId },
        passengers,
        accessible,
      });
      setQuote(res.quote);
      setJobToken(res.jobToken);
    } catch (e) {
      setError(e instanceof PlatformError ? errorCopy(e.code) : errorCopy('internal'));
    } finally {
      setRequesting(false);
    }
  };

  const startOver = () => {
    setQuote(null);
    setJobToken(null);
    setCheckout(null);
    setError(null);
  };

  const confirm = async () => {
    if (!jobToken) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await guestCall('guestConfirmRide')({ token: jobToken });
      setCheckout({ clientSecret: res.clientSecret, total: res.total, stripe: loadStripeInstance(res.publishableKey) });
    } catch (e) {
      setError(e instanceof PlatformError ? errorCopy(e.code) : errorCopy('internal'));
    } finally {
      setConfirming(false);
    }
  };

  // Resume-at-confirmed (second addendum round) — see drive-home-sheet.tsx's identical effect for
  // the full rationale. No terms here (`guestConfirmRide` has none), so this is a plain re-call.
  useEffect(() => {
    if (!quote && jobTicket?.status === 'confirmed' && !RESUME_BLOCKED_PAYMENT.has(jobTicket.payment.status) && !checkout && !confirming) {
      confirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confirm/checkout/confirming/quote deliberately omitted; see drive-home-sheet.tsx's identical effect
  }, [jobTicket?.status, jobTicket?.payment.status]);

  // Fix round (Major #2, task-45-review.md) — see drive-home-sheet.tsx's identical derivation.
  const resumingToPayment = !quote && jobTicket?.status === 'confirmed' && !RESUME_BLOCKED_PAYMENT.has(jobTicket.payment.status);

  const tracking = Boolean(checkout && jobTicket && PAST_CONFIRM.has(jobTicket.status));

  return (
    <DialogShell title={resumeToken ? 'Ride status' : 'Request a ride'} onClose={onClose}>
      {!jobToken ? (
        <>
          {/*
            F1 (final review): AddressAutocomplete's `onEdited` fires when the
            guest diverges the input text from a selection already made (or
            clears it) — clearing `pickup`/`dropoff` here re-disables "Get
            quote" (below) until a fresh suggestion is actually picked, so a
            stale committed selection can never be submitted under displayed
            text that contradicts it.
          */}
          <AddressAutocomplete
            label="Pickup"
            defaultQuery={ticket.venueName}
            onSelect={setPickup}
            onEdited={() => setPickup(null)}
          />
          <AddressAutocomplete label="Dropoff" onSelect={setDropoff} onEdited={() => setDropoff(null)} />

          {/*
            F7 (final review, WCAG AA): role="spinbutton" + aria-valuenow/min/
            max gives the count a programmatic association so a screen-reader
            user pressing "Increase passengers"/"Decrease passengers" hears
            the new value, not just silence between two buttons. The visible
            count span is aria-hidden since the spinbutton role already
            exposes it via aria-valuenow.
          */}
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <Text id={passengersLabelId}>Passengers</Text>
            <div
              role="spinbutton"
              aria-labelledby={passengersLabelId}
              aria-valuenow={passengers}
              aria-valuemin={MIN_PASSENGERS}
              aria-valuemax={MAX_PASSENGERS}
              className="flex items-center gap-3"
            >
              <button
                type="button"
                aria-label="Decrease passengers"
                disabled={passengers <= MIN_PASSENGERS}
                onClick={() => setPassengers((p) => Math.max(MIN_PASSENGERS, p - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-heading-xs disabled:opacity-40"
              >
                −
              </button>
              <Text weight="semibold" as="span" aria-hidden="true">
                {passengers}
              </Text>
              <button
                type="button"
                aria-label="Increase passengers"
                disabled={passengers >= MAX_PASSENGERS}
                onClick={() => setPassengers((p) => Math.min(MAX_PASSENGERS, p + 1))}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-heading-xs disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          <label className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-white p-4">
            <Text>Accessible vehicle</Text>
            <input
              role="switch"
              aria-label="Accessible vehicle"
              type="checkbox"
              checked={accessible}
              onChange={(event) => setAccessible(event.target.checked)}
              className="h-6 w-11"
            />
          </label>

          <Button fullWidth loading={requesting} disabled={!pickup || !dropoff} onClick={requestQuote}>
            Get quote
          </Button>
        </>
      ) : tracking ? (
        <JobTrackingView ticket={jobTicket} state={jobState} />
      ) : checkout ? (
        <>
          {resumeSummaryQuote ? (
            <QuoteView
              quote={resumeSummaryQuote}
              currency={ticket.payment.currency}
              remainingMs={null}
              expired={false}
              destination={resumeSummaryDestination}
            />
          ) : null}
          <PaymentStep
            clientSecret={checkout.clientSecret}
            total={checkout.total}
            currency={ticket.payment.currency}
            stripe={checkout.stripe}
            primaryColor={ticket.branding.primaryColor}
          />
        </>
      ) : effectiveQuote ? (
        <>
          <QuoteView
            quote={effectiveQuote}
            currency={ticket.payment.currency}
            remainingMs={remainingMs}
            expired={expired}
            destination={resumedDestination}
          />
          {expired ? (
            <Button variant="secondary" fullWidth onClick={startOver}>
              Get a new quote
            </Button>
          ) : (
            <Button fullWidth loading={confirming} onClick={confirm}>
              Confirm ride
            </Button>
          )}
        </>
      ) : resumingToPayment ? (
        // Fix round (Major #2) — see drive-home-sheet.tsx's identical branch for the full rationale.
        error && !confirming ? (
          <>
            <Text color="secondary">We couldn&rsquo;t complete your payment.</Text>
            <Button fullWidth onClick={confirm}>
              Try again
            </Button>
          </>
        ) : (
          <Text color="secondary" role="status">
            Completing your payment…
          </Text>
        )
      ) : (
        // See drive-home-sheet.tsx's identical fallback comment — covers the still-loading moment,
        // and a resumed job at 'confirmed' whose payment already succeeded (RESUME_BLOCKED_PAYMENT
        // — nothing left to do but wait for a driver).
        <JobTrackingView ticket={jobTicket} state={jobState} />
      )}

      {error ? (
        <Text color="error" role="alert">
          {error}
        </Text>
      ) : null}
    </DialogShell>
  );
}
