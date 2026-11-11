/**
 * Public (guest-facing) environment surface for `src/app/(public)`.
 *
 * `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY` gates Firebase App Check on every
 * guest callable (`guestCall`, `subscribeGuestTicket`). Shipping a build
 * without it — outside the emulator — would silently leave guest ticket
 * pages unable to call any Cloud Function. This module throws at import
 * time so that failure surfaces in CI/build instead of at first guest
 * request in production.
 *
 * `firebase.ts` must read every public env value through `publicEnv`
 * (not `process.env` directly) so this module's load-time check always
 * runs first.
 */

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

if (!process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY && !useEmulators) {
  throw new Error(
    'Missing NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY. Required whenever ' +
      'NEXT_PUBLIC_USE_EMULATORS !== "1" — without it, App Check ' +
      'initialization is skipped and every guest callable behind App ' +
      'Check fails silently. Set the key, or set ' +
      'NEXT_PUBLIC_USE_EMULATORS=1 for local emulator development.'
  );
}

export const publicEnv = {
  useEmulators,
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  },
  recaptchaEnterpriseKey: process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY,
} as const;

// F10 (final review): there is deliberately no `stripePublishableKey` field
// above. Every Stripe publishable key this surface ever uses comes back
// from a callable response (`guestCreateCheckout`/`guestConfirmDriveHome`/
// `guestConfirmRide`/`guestStaticCheckout`'s `publishableKey`, passed
// straight into `useStripeLoader`) — never from a build-time env var. A
// `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env surface here had zero consumers
// and only invited a future caller to trust a stale/wrong build-time key
// instead of the one the server actually priced the checkout against.
