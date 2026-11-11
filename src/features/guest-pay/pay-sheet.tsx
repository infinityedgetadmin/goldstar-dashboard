'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import { PlatformError, computeTip, type GuestTicket, type TipChoice } from '@goldstar/platform';
import { guestCall } from '@/lib/public/callables';
import { errorCopy } from '@/lib/public/error-copy';
import { formatMoney } from '@/lib/public/format';
import { PAID_STATUSES } from '@/lib/public/payment-status';
import { Button } from '@/components/ui/buttons';
import { Heading, Text } from '@/components/ui/typography';
import { TipSelector, defaultTip } from './tip-selector';
import { StripeForm } from './stripe-form';
import { useStripeLoader } from './use-stripe-loader';

export interface PaySheetProps {
  token: string;
  ticket: GuestTicket;
  onClose: () => void;
}

// Fix round 1 (Ruling F): `iframe` is included because `ExpressCheckoutElement`
// and `PaymentElement` (stripe-form.tsx) render as Stripe-hosted, cross-origin
// `<iframe>`s with no `href`/`tabindex` of their own. Without `iframe` here,
// the trap's computed `first`/`last` boundary at step 2 silently skipped over
// them — Shift+Tab from the "Pay $X" button (wrongly treated as the trap's
// `first`, since nothing before it matched) got force-wrapped to "Close"
// instead of reaching the card fields. Treating each iframe as a focusable
// stop fixes the boundary math; the browser's own native tab order still
// carries focus INTO an iframe for any non-boundary Tab/Shift+Tab press (the
// trap only intercepts at the true first/last, same as before) — Escape and
// Tab presses made while focus is already inside a cross-origin iframe don't
// bubble to `document` either way, a pre-existing Stripe Elements limitation
// this trap can't reach into, not something introduced here.
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

type Notice = { kind: 'error' | 'info'; text: string } | null;

/**
 * Guest pay sheet (Task 3): tip selection against the ticket's live
 * `payment` projection, then a Stripe Payment Element checkout created via
 * the `guestCreateCheckout` callable. Replaces Task 2's honest a11y-shell
 * stub — the dialog semantics it established (role="dialog", aria-modal,
 * aria-labelledby, Escape-to-close, a "Close" button) are kept and
 * hardened here with a real focus trap (Tab cycles inside, Shift+Tab
 * wraps, focus is restored to the opener on close) and an aria-live region
 * around the step content so screen readers announce step changes.
 */
export function PaySheet({ token, ticket, onClose }: PaySheetProps) {
  const headingId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const alreadyPaidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadStripeInstance = useStripeLoader();

  const [tip, setTip] = useState<TipChoice>(() => defaultTip(ticket.payment.tipPresets));
  const [checkout, setCheckout] = useState<{
    clientSecret: string;
    total: number;
    stripe: Promise<Stripe | null>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus trap: attaches once on mount, cleans up once on unmount. It
  // reads `onClose` through the ref above rather than the prop directly,
  // so a new `onClose` identity on every TicketView re-render (its
  // `onClose={() => setPay(false)}` is a fresh closure on every live-
  // ticket snapshot) can't re-fire this effect. If it depended on
  // `onClose` directly, every snapshot update while the sheet is open
  // would re-focus the first control — yanking focus out of, say, the
  // custom-tip input mid-keystroke — and restore-to-opener early on the
  // phantom "unmount".
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const focusables = getFocusableElements(containerRef.current);
    (focusables[0] ?? containerRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = getFocusableElements(containerRef.current);
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // F8 (final review): the opener button can already be gone from the
      // document by the time this cleanup runs — the paid auto-close race,
      // where TicketView swaps "Pay & tip" for "Paid · thank you" (removing
      // the button) before this sheet's own 1.5s timer fires `onClose` and
      // unmounts it. `.focus()` on a detached node silently no-ops, so
      // without this check focus was dropped to `<body>`. Fall back to the
      // page's stable main heading (brand-header.tsx, given a
      // `tabIndex={-1}` for exactly this) instead.
      if (openerRef.current && document.body.contains(openerRef.current)) {
        openerRef.current.focus();
      } else {
        document.getElementById('guest-page-heading')?.focus();
      }
    };
  }, []);

  // Fix round 1 (minor): the `payment_already_paid` auto-close timer
  // (scheduled in `start()`'s catch block below) had no cleanup, unlike
  // the sibling status-driven auto-close effect right below this one. If
  // the guest manually closed the sheet before the 1.5s elapsed, the
  // orphaned timer still fired later against an unmounted component.
  // Harmless today (`onCloseRef.current()` just calls `setPay(false)`,
  // idempotent), but a latent footgun if `onClose` ever grows side
  // effects — cleared on unmount for the same reason the other timer is.
  useEffect(() => {
    return () => {
      if (alreadyPaidTimerRef.current) clearTimeout(alreadyPaidTimerRef.current);
    };
  }, []);

  // Auto-close once the LIVE ticket flips into a paid-like status (the
  // webhook-driven projection TicketView subscribes to and passes down as
  // `ticket`) — 1.5s so the guest sees the "Paid" state before the sheet
  // dismisses itself. Deliberately keyed only on the status VALUE, not on
  // `ticket` (a new object every snapshot) or `onClose` (a new closure
  // every TicketView re-render) — either would reset/cancel this timer on
  // an unrelated re-render (e.g. a driver ETA tick) and the auto-close
  // could end up never firing in practice.
  useEffect(() => {
    if (!PAID_STATUSES.has(ticket.payment.status)) return;
    const timer = setTimeout(() => onCloseRef.current(), 1500);
    return () => clearTimeout(timer);
  }, [ticket.payment.status]);

  const subtotal =
    ticket.payment.total > 0
      ? ticket.payment.total - ticket.payment.tip
      : ticket.payment.base + ticket.payment.tax + ticket.payment.fees;
  const tipAmount = computeTip({ subtotal, choice: tip, presets: ticket.payment.tipPresets });

  const start = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await guestCall('guestCreateCheckout')({ token, tip });
      setCheckout({ clientSecret: res.clientSecret, total: res.total, stripe: loadStripeInstance(res.publishableKey) });
    } catch (e) {
      const code = e instanceof PlatformError ? e.code : 'internal';
      if (code === 'payment_already_paid') {
        setNotice({ kind: 'info', text: errorCopy(code) });
        alreadyPaidTimerRef.current = setTimeout(() => onCloseRef.current(), 1500);
      } else {
        setNotice({ kind: 'error', text: errorCopy(code) });
      }
    } finally {
      setBusy(false);
    }
  };

  const paid = PAID_STATUSES.has(ticket.payment.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg-overlay p-4 motion-safe:animate-fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-md rounded-2xl bg-bg-primary p-6 motion-safe:animate-slide-up"
        onClick={(event) => event.stopPropagation()}
      >
        <Heading id={headingId} level={2} variant="heading-sm">
          {paid ? 'Paid — thank you' : 'Pay & tip'}
        </Heading>

        <div aria-live="polite" className="mt-4 flex flex-col gap-4">
          {paid ? (
            <Text color="secondary">Your receipt is on its way.</Text>
          ) : !checkout ? (
            <>
              <div className="flex justify-between">
                <Text color="secondary">Valet</Text>
                <Text>{formatMoney(subtotal, ticket.payment.currency)}</Text>
              </div>
              <TipSelector
                subtotal={subtotal}
                presets={ticket.payment.tipPresets}
                value={tip}
                onChange={setTip}
                currency={ticket.payment.currency}
              />
              <div className="flex justify-between border-t border-border pt-3">
                <Text weight="semibold">Total</Text>
                <Text weight="semibold">{formatMoney(subtotal + tipAmount, ticket.payment.currency)}</Text>
              </div>
              <Button size="lg" fullWidth loading={busy} onClick={start}>
                Continue to payment
              </Button>
              {notice ? (
                <Text
                  color={notice.kind === 'error' ? 'error' : 'success'}
                  role={notice.kind === 'error' ? 'alert' : 'status'}
                >
                  {notice.text}
                </Text>
              ) : null}
            </>
          ) : (
            <div>
              <div className="mb-3 flex justify-between">
                <Text weight="semibold">Total</Text>
                <Text weight="semibold">{formatMoney(checkout.total, ticket.payment.currency)}</Text>
              </div>
              <Elements
                stripe={checkout.stripe}
                options={{
                  clientSecret: checkout.clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: ticket.branding.primaryColor,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      borderRadius: '12px',
                    },
                  },
                }}
              >
                <StripeForm amountLabel={formatMoney(checkout.total, ticket.payment.currency)} />
              </Elements>
            </div>
          )}
        </div>

        <button className="mt-4 min-h-11 w-full py-3 text-ui-md text-text-tertiary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
