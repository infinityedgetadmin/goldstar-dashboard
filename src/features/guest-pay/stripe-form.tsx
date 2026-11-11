'use client';

import { useState } from 'react';
import { ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

/**
 * Step 2 of the pay sheet: Express Checkout (Apple Pay / Google Pay) plus
 * the card Payment Element, confirmed against the PaymentIntent created by
 * `guestCreateCheckout`.
 *
 * Verified against the INSTALLED `@stripe/react-stripe-js@6.8.2` /
 * `@stripe/stripe-js@9.14.0` typings, not memory:
 * - `stripe.confirmPayment({ elements, redirect: 'if_required',
 *   confirmParams: { return_url } })` matches the first overload in
 *   `stripe-js/stripe.d.ts` exactly, resolving `Promise<PaymentIntentResult>`
 *   (a `{ error }` | `{ paymentIntent }` union) — no divergence there.
 * - One real divergence from the task brief's own given pseudocode: its
 *   `ExpressCheckoutElement` `buttonType.applePay: 'pay'` is not a valid
 *   `ApplePayButtonType` per the installed typings
 *   (`elements/express-checkout.d.ts`) — that enum is `'add-money' |
 *   'book' | 'buy' | 'check-out' | 'contribute' | 'donate' | 'order' |
 *   'plain' | 'reload' | 'rent' | 'subscribe' | 'support' | 'tip' |
 *   'top-up'`; `'pay'` only exists on `GooglePayButtonType` /
 *   `PayPalButtonType`. Using `'buy'` here — Apple's closest-fit label for
 *   a generic "pay this amount" button.
 *
 * `error.message` from `confirmPayment` is Stripe's own user-facing copy —
 * explicitly plan-sanctioned to render directly here, unlike every other
 * error path in this app, which must go through `errorCopy`.
 *
 * `onConfirmed` (Plan 3 T5 addition): fires alongside `setSubmitted(true)`
 * on the resolved-without-error path, before the guest-facing "paid" state
 * is confirmed by any webhook-driven projection. `pay-sheet.tsx` doesn't
 * pass it — its "paid" UI stays keyed off the live ticket projection, same
 * as before. `static-checkout-view.tsx` DOES pass it: a static-checkout
 * guest has no ticket to subscribe to until this PaymentIntent resolves
 * (the ticket is created server-side inside `guestStaticCheckout`, in the
 * same call that returns `ticketToken`), so there's no pre-redirect
 * projection to wait on — the redirect target (`/t/{ticketToken}`) IS the
 * projection page, and it shows live status (including a still-processing
 * payment) once the guest lands there. Redirecting on this
 * resolved-without-error path, rather than waiting for a payment-succeeded
 * projection flip that this page never subscribes to, is therefore
 * correct here even though it would be premature for pay-sheet.tsx's
 * webhook-driven "Paid" UI.
 */
export function StripeForm({ amountLabel, onConfirmed }: { amountLabel: string; onConfirmed?: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const confirm = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setMsg(null);
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    });
    if (error) {
      setMsg(error.message ?? 'Payment failed. Please try again.');
    } else {
      // Confirmation succeeded client-side; the guest-facing "paid" state
      // is still driven by the live ticket projection flipping via the
      // Stripe webhook (see pay-sheet.tsx), which can lag this promise by
      // a beat. This just gives immediate feedback in the meantime.
      setSubmitted(true);
      onConfirmed?.();
    }
    setBusy(false);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
      className="flex flex-col gap-4"
    >
      <ExpressCheckoutElement
        onConfirm={() => void confirm()}
        options={{ buttonType: { applePay: 'buy', googlePay: 'pay' } }}
      />
      <PaymentElement options={{ layout: 'tabs' }} />
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={submitted}>
        {submitted ? 'Payment submitted' : `Pay ${amountLabel}`}
      </Button>
      {submitted ? (
        <Text color="success" role="status">
          Payment submitted — confirming your payment…
        </Text>
      ) : null}
      {msg ? (
        <Text color="error" role="alert">
          {msg}
        </Text>
      ) : null}
    </form>
  );
}
