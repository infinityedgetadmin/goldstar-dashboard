'use client';

import { useCallback, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';

/**
 * Lazily loads Stripe.js only when the returned function is first called
 * for a given publishable key — never on mount, never before the guest
 * taps "Continue to payment". This is the pay sheet's performance budget
 * (binding controller ruling): no Stripe JS before checkout starts.
 * Memoizes the resulting promise per publishable key so a re-render (or a
 * second call with the same key) doesn't kick off a redundant
 * `loadStripe()` call / duplicate `<script>` injection.
 *
 * Fix round 1 (Major-1): imports `loadStripe` from the `@stripe/stripe-js/
 * pure` subpath, NOT the bare `'@stripe/stripe-js'` entry. The bare
 * entry's `dist/index.mjs` schedules `Promise.resolve().then(() =>
 * getStripePromise())` as a MODULE-LEVEL side effect — it injects Stripe's
 * `<script src="https://js.stripe.com/...">` the moment the module is
 * evaluated, regardless of whether `loadStripe()` the function is ever
 * called. Since this hook (and `pay-sheet.tsx`, and `Elements`/
 * `PaymentElement`/`ExpressCheckoutElement`) are statically imported from
 * `ticket-view.tsx`, that module evaluation happens on every guest ticket
 * page view, not just when "Continue to payment" is clicked — silently
 * violating the stated budget. `@stripe/stripe-js/pure`'s `dist/pure.mjs`
 * has no such top-level effect; it only calls `loadScript` from inside the
 * `loadStripe()` function body itself. Confirmed via
 * `node_modules/@stripe/stripe-js/dist/{index,pure}.mjs` directly (not
 * just the `.d.ts`) and via a built-output grep (see task-3-report.md's
 * "Fix round 1" section for the exact commands/result). `Stripe` the TYPE
 * isn't re-exported from the `pure` subpath (only `loadStripe`/
 * `ReleaseTrain` are, per `dist/pure.d.ts`), so it's imported separately
 * as `import type` from the main entry — erased entirely at compile time,
 * so it carries no runtime import and doesn't reintroduce the leak.
 */
export function useStripeLoader() {
  const cache = useRef(new Map<string, Promise<Stripe | null>>());

  return useCallback((publishableKey: string): Promise<Stripe | null> => {
    const cached = cache.current.get(publishableKey);
    if (cached) return cached;
    const promise = loadStripe(publishableKey);
    cache.current.set(publishableKey, promise);
    return promise;
  }, []);
}
