'use client';

import { useEffect, useState } from 'react';
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
import { DRIVE_HOME_V1, DRIVE_HOME_TERMS_V1 } from './terms';

export interface DriveHomeSheetProps {
  token: string;
  ticket: GuestTicket;
  onClose: () => void;
  /**
   * Fix round 1 (Ruling H): set when `TicketView` finds an active (non-
   * terminal) `drive_home` entry in `ticket.linkedJobs` — the guest already
   * has a job in flight (started before a reload, or in another tab), and
   * this sheet must resume that job's own token rather than offer a fresh
   * address step, which would let the guest create a second job (and a
   * second card authorization) alongside the first. `quote`/`checkout`
   * never get set locally in this mode (nothing calls
   * `guestRequestDriveHome`) — the render below sources what it needs
   * (quote/destination) from the job's own LIVE projection instead;
   * see `resumedQuote` below.
   *
   * Addendum round (v0.3.9): previously this resumed straight into
   * `JobTrackingView` unconditionally, which was misleading for a job still
   * at 'quoted' — no driver has been assigned yet; there's nothing to
   * "track". Now: `status === 'quoted'` resumes into the SAME quote/terms/
   * Confirm screen the fresh flow shows (`guestConfirmDriveHome` is
   * idempotent from 'quoted', verified against the platform handler), an
   * expired resumed quote falls through to the existing "Get a new quote"
   * re-request path (`startOver`), and `status === 'confirmed'` (controller
   * ruling, second addendum round) resumes STRAIGHT to the payment step —
   * see the `RESUME_BLOCKED_PAYMENT` effect below for why that's gated on
   * `payment.status`, not just `status === 'confirmed'` alone.
   */
  resumeToken?: string;
}

// Statuses that mean "past the confirm/authorize step" for a drive_home
// job — once the job's own live projection (subscribed below via
// `useGuestTicket(jobToken)`) reaches one of these, the sheet shows the
// tracking view instead of the payment step. Mirrors ticket-view.tsx's
// DRIVE_HOME_IN_PROGRESS set, minus 'requested'/'quoted'/'confirmed' (still
// this sheet's own address/quote/pay steps, not tracking, from the guest's
// point of view — 'confirmed' in particular is reached the instant
// `guestConfirmDriveHome` succeeds, before the Payment Element has even
// mounted).
const PAST_CONFIRM = new Set(['assigned', 'en_route_to_guest', 'pre_drive_inspection', 'in_transit', 'arrived', 'completed']);

/**
 * Second addendum round: mirrors `runCheckout`'s own guard exactly (`functions/src/modules/
 * payments/checkout.ts` in the platform repo: `if (ticket.payment && ['paid', 'authorized',
 * 'room_charged', 'venue_billed'].includes(ticket.payment.status)) throw
 * err('payment_already_paid')`) — deliberately NOT this repo's own `PAID_STATUSES`
 * (`src/lib/public/payment-status.ts`), which excludes `'authorized'`. Job tickets use MANUAL
 * capture (priced with `capture: 'manual'`), so `'authorized'` — not `'paid'` — is THIS ticket's
 * own "guest already paid" terminal state client-side (capture happens later, on completion).
 *
 * Verified this is a REAL, reachable case, not hypothetical: `guestConfirmDriveHome`'s own
 * `runCheckout` call sets `payment.status: 'pending'`, not `'confirmed'`/`'authorized'` — the
 * ticket's STATUS moves to `'confirmed'` the instant terms are accepted, well before the guest
 * even sees the Payment Element, and stays at `'confirmed'` until staff dispatches a driver
 * (`dispatchAssign`, confirmed -> assigned) — completely independent of whether payment itself
 * has since succeeded. A guest who successfully pays and then reloads BEFORE a driver is assigned
 * would resume at `status: 'confirmed'`, `payment.status: 'authorized'` — auto-calling confirm()
 * unconditionally on `status === 'confirmed'` would hit `payment_already_paid` for THIS guest,
 * who did nothing wrong. Excluded via this set; falls through to `JobTrackingView` instead, which
 * accurately shows "we'll assign a driver shortly" — nothing left for them to do.
 */
const RESUME_BLOCKED_PAYMENT = new Set(['paid', 'authorized', 'room_charged', 'venue_billed']);

interface CheckoutState {
  clientSecret: string;
  total: number;
  stripe: Promise<Stripe | null>;
}

/**
 * Drive-home request sheet (Task 4): address → quote → terms → authorize →
 * tracking. Every call after the quote uses the JOB token
 * (`guestRequestDriveHome`'s `jobToken`), never the valet `token` this sheet
 * was opened with — the job is a separate ticket with its own Firestore doc
 * and its own lifecycle, which is why `useGuestTicket(jobToken)` (not
 * `token`) drives both this sheet's own pay/tracking step routing and the
 * `JobTrackingView` it renders.
 *
 * `resumeToken` (Ruling H, Fix round 1; resume-quote behavior added in the
 * v0.3.9 addendum round) seeds `jobToken` on mount, so the single
 * `useGuestTicket(jobToken)` call below immediately subscribes to the
 * existing job — see `resumedQuote` and the render below for how that
 * live projection now drives a resumed 'quoted' job into the same quote/
 * terms/Confirm screen the fresh flow uses, instead of unconditionally
 * showing `JobTrackingView`.
 */
export function DriveHomeSheet({ token, ticket, onClose, resumeToken }: DriveHomeSheetProps) {
  const loadStripeInstance = useStripeLoader();

  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobToken, setJobToken] = useState<string | null>(resumeToken ?? null);
  const [agreed, setAgreed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);

  const { ticket: jobTicket, state: jobState } = useGuestTicket(jobToken);

  // Resume-quote (v0.3.9 addendum): a job whose LIVE status is exactly 'quoted' carries its own
  // quote/destination on the projection (`buildProjection`, goldstar-platform — populated whenever
  // `t.driveHome?.quote` exists, which persists past 'quoted' too, so this is gated on `status`
  // specifically, not merely on the field being present — a job already 'confirmed' or later must
  // NOT re-enter this branch). `quote` (local, set the instant `requestQuote` resolves — see below)
  // always wins when present, so the fresh-request flow keeps showing its quote immediately off the
  // callable's own response, without waiting on this listener at all.
  const resumedQuote = jobTicket?.status === 'quoted' ? jobTicket.driveHome?.quote : undefined;
  const resumedDestination = jobTicket?.status === 'quoted' ? jobTicket.driveHome?.destination.address : undefined;
  const effectiveQuote = quote ?? resumedQuote;
  const { expired, remainingMs } = useQuoteExpiry(effectiveQuote?.expiresAt);

  // Resume-at-confirmed (second addendum round): the SAME quote/destination, but read regardless
  // of exact status (not gated to 'quoted' like `resumedQuote` above) — `driveHome.quote` persists
  // on the projection past 'quoted', which is exactly what this needs once `status` has already
  // advanced to 'confirmed'. `!quote` (no local fresh-request state) is what scopes this to resume
  // mode only — in the fresh flow `quote` is always set by the time `status` reaches 'confirmed'.
  const resumeSummaryQuote = !quote ? jobTicket?.driveHome?.quote : undefined;
  const resumeSummaryDestination = !quote ? jobTicket?.driveHome?.destination.address : undefined;

  const requestQuote = async (destination: AddressSuggestion) => {
    setRequesting(true);
    setError(null);
    try {
      const res = await guestCall('guestRequestDriveHome')({ token, destination });
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
    setAgreed(false);
    setCheckout(null);
    setError(null);
  };

  const confirm = async () => {
    if (!jobToken) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await guestCall('guestConfirmDriveHome')({ token: jobToken, termsVersion: DRIVE_HOME_V1 });
      setCheckout({ clientSecret: res.clientSecret, total: res.total, stripe: loadStripeInstance(res.publishableKey) });
    } catch (e) {
      setError(e instanceof PlatformError ? errorCopy(e.code) : errorCopy('internal'));
    } finally {
      setConfirming(false);
    }
  };

  // Resume-at-confirmed (second addendum round, controller ruling): terms were already accepted
  // in a prior session (the write that sets `driveHome.termsAcceptedAt` is the SAME write that
  // moves `status` to 'confirmed' — verified in `confirmDriveHome.ts` — so 'confirmed' alone means
  // terms are done), so this re-calls the SAME `confirm()` — `guestConfirmDriveHome` is idempotent
  // from 'confirmed' (skips the already-done status transition, just re-runs checkout for a fresh
  // clientSecret) — automatically rather than waiting for a click; there is no fresh action left
  // for the guest to take before payment. Gated on `!quote` (resume mode only — see
  // `resumeSummaryQuote` above) and `RESUME_BLOCKED_PAYMENT` (see that set's own comment) so this
  // never fires for the fresh flow's own manual confirm() or for a guest who already paid.
  useEffect(() => {
    if (!quote && jobTicket?.status === 'confirmed' && !RESUME_BLOCKED_PAYMENT.has(jobTicket.payment.status) && !checkout && !confirming) {
      confirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confirm/checkout/confirming/quote deliberately omitted (see comment above); this must fire only once per (status, payment.status) transition into the eligible resume state, not on every unrelated re-render
  }, [jobTicket?.status, jobTicket?.payment.status]);

  // Fix round (Major #2, task-45-review.md): the SAME condition that gates the auto-confirm effect
  // above, minus `!checkout`/`!confirming` (those govern whether the effect FIRES; this governs
  // which UI to show while in this state, including mid-flight and after a failure). A rejected
  // auto-confirm previously fell all the way through to the generic `JobTrackingView` fallback below
  // — "We'll assign a driver shortly." is actively wrong here: no driver will ever be assigned
  // without a completed payment, and there was no visible way to retry short of dismiss+reopen.
  const resumingToPayment = !quote && jobTicket?.status === 'confirmed' && !RESUME_BLOCKED_PAYMENT.has(jobTicket.payment.status);

  const tracking = Boolean(checkout && jobTicket && PAST_CONFIRM.has(jobTicket.status));

  return (
    <DialogShell title={resumeToken ? 'Drive home status' : 'Drive me home'} onClose={onClose}>
      {!jobToken ? (
        <>
          <AddressAutocomplete label="Destination" onSelect={requestQuote} />
          {requesting ? (
            <Text color="secondary" role="status">
              Getting your quote…
            </Text>
          ) : null}
        </>
      ) : tracking ? (
        <JobTrackingView ticket={jobTicket} state={jobState} />
      ) : checkout ? (
        <>
          {resumeSummaryQuote ? (
            <>
              <QuoteView
                quote={resumeSummaryQuote}
                currency={ticket.payment.currency}
                remainingMs={null}
                expired={false}
                destination={resumeSummaryDestination}
              />
              <Text size="sm" color="secondary">
                Terms accepted
              </Text>
            </>
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
            <>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-3">
                <Text size="sm" color="secondary">
                  {DRIVE_HOME_TERMS_V1}
                </Text>
              </div>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  aria-label="I understand a Goldstar driver will drive my own vehicle; pre-existing damage is documented before departure"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5 h-5 w-5"
                />
                <Text size="sm">
                  I understand a Goldstar driver will drive my own vehicle; pre-existing damage is documented before
                  departure.
                </Text>
              </label>
              <Button fullWidth loading={confirming} disabled={!agreed} onClick={confirm}>
                Confirm and authorize
              </Button>
            </>
          )}
        </>
      ) : resumingToPayment ? (
        // Fix round (Major #2): dedicated state for "resuming into payment, not there yet" — covers
        // the brief in-flight window (the auto-confirm effect is running or about to) AND, crucially,
        // a REJECTED attempt: an explicit, honest retry action instead of silently relying on
        // dismiss+reopen (which does work — a fresh mount re-runs the effect — but was undiscoverable).
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
        // jobToken exists but there's no quote to show (local or resumed), the job isn't
        // tracking-eligible via the local `checkout`+PAST_CONFIRM check above, AND it isn't
        // `resumingToPayment` either — covers the still-loading moment right after a fresh
        // request/on initial resume, AND a resumed job at 'confirmed' whose payment already
        // succeeded (`RESUME_BLOCKED_PAYMENT` — the auto-resume effect above deliberately does not
        // fire for that case) — this IS the accurate state for it: nothing left for the guest to do
        // but wait for a driver, which `JobTrackingView` already shows honestly ("we'll assign a
        // driver shortly"). `JobTrackingView` itself renders its own loading skeleton for `state ===
        // 'loading'`, so this is a single safe fallback for both of the above.
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
