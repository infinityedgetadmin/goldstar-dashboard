'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Elements } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import { cssVariables, operatorTheme } from '@goldstar/platform/tokens';
import { PlatformError, computeTip, computeValetPrice, type TipChoice } from '@goldstar/platform';
import { subscribeVenuePublic, type VenuePublic } from '@/lib/public/firebase';
import { guestCall } from '@/lib/public/callables';
import { errorCopy } from '@/lib/public/error-copy';
import { formatMoney } from '@/lib/public/format';
import { Button } from '@/components/ui/buttons';
import { Heading, Text } from '@/components/ui/typography';
import { BrandHeader } from '@/features/guest-ticket/brand-header';
import { TipSelector, defaultTip } from './tip-selector';
import { StripeForm } from './stripe-form';
import { useStripeLoader } from './use-stripe-loader';

type VenueState = 'loading' | 'missing' | 'error' | 'ready';

interface Checkout {
  clientSecret: string;
  total: number;
  ticketToken: string;
  stripe: Promise<Stripe | null>;
}

/**
 * Static venue checkout (Plan 3 T5): the page a venue's QR-code signage
 * points at. Unlike ticket-view.tsx/pay-sheet.tsx, there is no existing
 * ticket to subscribe to on load — the ticket is created server-side
 * inside `guestStaticCheckout`, in the SAME call that prices and creates
 * the PaymentIntent, and only comes to exist once the guest actually
 * submits. So this view:
 *  1. Subscribes to the public `venuePublic/{venueToken}` projection for
 *     branding + a flat-rate price preview (via `computeValetPrice`, same
 *     as the server's own `priceTicket` — see below) and `tipPresets`, so
 *     the guest can see the amount and pick a tip BEFORE committing.
 *  2. On submit, calls `guestStaticCheckout` once with the chosen tip
 *     (and optional plate) — this is a one-shot action, not re-priceable
 *     like `guestCreateCheckout`: every call creates a brand NEW ticket by
 *     design (each guest at the venue pays for their own car), so unlike
 *     PaySheet there is no "change tip and re-submit" step once a
 *     checkout has been created — the tip choice is locked in at submit.
 *  3. Mounts Elements + StripeForm against the returned clientSecret, and
 *     redirects to `/t/{ticketToken}` on StripeForm's `onConfirmed` (see
 *     that file's own JSDoc for why the redirect fires on the
 *     resolved-without-error path rather than waiting on a projection
 *     flip this page never subscribes to).
 */
export function StaticCheckoutView({ venueToken }: { venueToken: string }) {
  const router = useRouter();
  const loadStripeInstance = useStripeLoader();

  const [venue, setVenue] = useState<VenuePublic | null>(null);
  const [state, setState] = useState<VenueState>('loading');
  const [plateLast4, setPlateLast4] = useState('');
  const [plateTouched, setPlateTouched] = useState(false);
  const [tip, setTip] = useState<TipChoice>({ kind: 'none' });
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tipInitialized = useRef(false);

  useEffect(() => {
    return subscribeVenuePublic(
      venueToken,
      (v) => {
        // F5 (final review): `venue.branding.*` and `venue.rates.valet` are
        // dereferenced unguarded below (`vars`/`priced` memos) — a malformed
        // or partially-written `venuePublic` doc (its writer is a Plan 4a
        // carry; nothing writes these in production yet) must degrade to
        // the same "This payment link isn't valid" state as a genuinely
        // missing doc, not crash into Next's error shell. Single guard here
        // covers both downstream dereferences.
        if (!v || !v.branding || !v.rates?.valet) {
          setVenue(null);
          setState('missing');
          return;
        }
        setVenue(v);
        setState('ready');
      },
      () => setState('error')
    );
  }, [venueToken]);

  // Default tip is chosen once, the first time the venue projection
  // arrives — same rule as PaySheet (defaultTip, Ruling G-3), just fired
  // from an effect instead of a lazy useState initializer, since `venue`
  // isn't available synchronously at mount here. Guarded so a later
  // snapshot update (e.g. an operator edits tipPresets while this page is
  // open) can't clobber a tip the guest already chose.
  useEffect(() => {
    if (venue && !tipInitialized.current) {
      tipInitialized.current = true;
      setTip(defaultTip(venue.tipPresets));
    }
  }, [venue]);

  const vars = useMemo(
    () =>
      venue
        ? cssVariables(operatorTheme({ primaryColor: venue.branding.primaryColor, accentColor: venue.branding.accentColor }))
        : {},
    [venue]
  );

  // Flat-rate price preview: mirrors the server's own `priceTicket`
  // (payments/pricing.ts) for jobType 'valet' — same `computeValetPrice`
  // call, `checkedInAt`/`at` collapsed to "now" since this is a preview,
  // not a real check-in, and duration is irrelevant for a flat-model venue
  // either way (computeValetPrice's 'flat' branch always prices at
  // `items[0].amount` regardless of elapsed time). This is a CLIENT-SIDE
  // preview only — the actual charge is always computed server-side
  // inside `guestStaticCheckout` from the operator's real venue doc, never
  // trusted from here.
  const priced = useMemo(() => {
    if (!venue) return null;
    const now = new Date();
    return computeValetPrice({ rates: venue.rates.valet, checkedInAt: now, at: now });
  }, [venue]);
  const subtotal = priced?.total ?? 0;
  const tipAmount = venue ? computeTip({ subtotal, choice: tip, presets: venue.tipPresets }) : 0;

  const handlePlateChange = (raw: string) => {
    setPlateTouched(true);
    setPlateLast4(raw.replace(/\D/g, '').slice(0, 4));
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await guestCall('guestStaticCheckout')({
        venueToken,
        ...(plateLast4.length === 4 ? { plateLast4 } : {}),
        tip,
      });
      setCheckout({
        clientSecret: res.clientSecret,
        total: res.total,
        ticketToken: res.ticketToken,
        stripe: loadStripeInstance(res.publishableKey),
      });
    } catch (e) {
      setErr(e instanceof PlatformError ? errorCopy(e.code) : errorCopy('internal'));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <main className="p-6" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded bg-bg-tertiary" />
      </main>
    );
  }

  if (state === 'missing' || state === 'error' || !venue) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <Heading level={1} variant="heading-md">
          We couldn&rsquo;t find that.
        </Heading>
        <Text color="secondary">This payment link isn&rsquo;t valid. Ask the valet stand for a new QR code.</Text>
      </main>
    );
  }

  return (
    <main style={vars as CSSProperties} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-5">
      <BrandHeader branding={venue.branding} venueName={`Pay for valet at ${venue.venueName}`} />

      <div aria-live="polite" className="flex flex-col gap-4">
        {!checkout ? (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="plate-last4" className="text-ui-sm text-text-secondary">
                Plate — last 4 digits (optional)
              </label>
              <input
                id="plate-last4"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={plateLast4}
                onChange={(event) => handlePlateChange(event.target.value)}
                placeholder="1234"
                className="min-h-11 rounded-lg border-2 border-border bg-white px-4 py-3 text-body-md text-text-primary outline-none"
              />
              {plateTouched && plateLast4.length > 0 && plateLast4.length < 4 ? (
                <Text size="xs" color="tertiary">
                  Enter all 4 digits, or leave this blank.
                </Text>
              ) : null}
            </div>

            <div className="flex justify-between">
              <Text color="secondary">Valet</Text>
              <Text>{formatMoney(subtotal)}</Text>
            </div>
            <TipSelector subtotal={subtotal} presets={venue.tipPresets} value={tip} onChange={setTip} />
            <div className="flex justify-between border-t border-border pt-3">
              <Text weight="semibold">Total</Text>
              <Text weight="semibold">{formatMoney(subtotal + tipAmount)}</Text>
            </div>

            <Button size="xl" fullWidth loading={busy} onClick={submit}>
              Continue to payment
            </Button>

            {err ? (
              <Text color="error" role="alert">
                {err}
              </Text>
            ) : null}
          </>
        ) : (
          <div>
            <div className="mb-3 flex justify-between">
              <Text weight="semibold">Total</Text>
              <Text weight="semibold">{formatMoney(checkout.total)}</Text>
            </div>
            <Elements
              stripe={checkout.stripe}
              options={{
                clientSecret: checkout.clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: venue.branding.primaryColor,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    borderRadius: '12px',
                  },
                },
              }}
            >
              <StripeForm
                amountLabel={formatMoney(checkout.total)}
                onConfirmed={() => router.replace(`/t/${checkout.ticketToken}`)}
              />
            </Elements>
          </div>
        )}
      </div>
    </main>
  );
}
