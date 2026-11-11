'use client';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { initializeAppCheck, CustomProvider, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import type { GuestTicket, ValetRates } from '@goldstar/platform';
import { publicEnv } from './env';

/**
 * `venuePublic/{venueToken}` projection (Plan 3 T5) — NOT exported from
 * `@goldstar/platform@0.3.5` (verified: absent from
 * `node_modules/@goldstar/platform/dist/index.d.ts`'s export list, unlike
 * `GuestTicket` above), so this is a local interface matching the shape
 * documented in goldstar-platform's `firestore.rules` comment above the
 * `venuePublic/{venueToken}` match block and the task brief: `{
 * operatorId, venueId, venueName, branding, rates.valet, tipPresets }`.
 *
 * `branding` is typed as `GuestTicket['branding']` (displayName/
 * primaryColor/accentColor + optional logoUrl/supportPhone) rather than
 * `@goldstar/platform`'s `OperatorBranding` (which carries Storage
 * *paths* — `logoLightPath`/`logoDarkPath`/`iconPath` — not URLs). A
 * public Functions-written projection resolves those to a display-ready
 * shape before writing, the same way `buildProjection` (guest/projection.ts)
 * does for `guestTickets/{token}`'s own `branding` field — confirmed
 * against the task brief's given Functions test fixture, which seeds
 * `venuePublic` with exactly `{ displayName, primaryColor, accentColor }`,
 * matching `GuestTicket['branding']`'s shape, not `OperatorBranding`'s.
 * This also lets `venue.branding` pass straight into `BrandHeader`
 * (guest-ticket/brand-header.tsx), which is already typed against
 * `GuestTicket['branding']`, with no cast.
 */
export interface VenuePublic {
  operatorId: string;
  venueId: string;
  venueName: string;
  branding: GuestTicket['branding'];
  rates: { valet: ValetRates };
  tipPresets: number[];
}

let cache: { app: FirebaseApp; db: Firestore; functions: Functions; appCheck: AppCheck | null } | null = null;

export function publicFirebase() {
  if (cache) return cache;
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: publicEnv.firebase.apiKey,
      authDomain: publicEnv.firebase.authDomain,
      projectId: publicEnv.firebase.projectId,
      storageBucket: publicEnv.firebase.storageBucket,
      messagingSenderId: publicEnv.firebase.messagingSenderId,
      appId: publicEnv.firebase.appId,
    });
  const db = getFirestore(app);
  const functions = getFunctions(app, 'us-central1');
  let appCheck: AppCheck | null = null;
  if (publicEnv.useEmulators) {
    // Ports are env-overridable so `npm run e2e` can run at a GOLDSTAR_EMU_OFFSET and not collide
    // with another agent's emulator work (carry #53). Defaults are the unoffset values, and the
    // whole branch is behind `useEmulators`, which production never sets — so a production build
    // reads neither variable.
    connectFirestoreEmulator(db, '127.0.0.1', Number(process.env.NEXT_PUBLIC_EMU_FIRESTORE_PORT ?? 8080));
    connectFunctionsEmulator(functions, '127.0.0.1', Number(process.env.NEXT_PUBLIC_EMU_FUNCTIONS_PORT ?? 5001));
    // NOTE: deliberately NOT setting self.FIREBASE_APPCHECK_DEBUG_TOKEN here
    // (the plan's original sketch did): that global makes the App Check JS
    // SDK bypass the configured provider and attempt a debug-token exchange
    // against the REAL App Check backend, which fails without a
    // console-registered debug token — and the functions client then sends
    // no X-Firebase-AppCheck header at all. The CustomProvider below is the
    // whole emulator story.
    // App Check under emulators (Plan 3 T6, controller-verified empirically):
    // the Functions emulator SKIPS App Check token *verification* but the
    // firebase-functions v2 onCall layer still REJECTS requests with no
    // X-Firebase-AppCheck header at all when `enforceAppCheck: true`
    // (curl: no header → UNAUTHENTICATED; any dummy header → handler runs).
    // A CustomProvider returning a static dummy token makes the JS SDK
    // attach the header without any network exchange. Emulator-scoped:
    // this branch returns before the production ReCaptcha init below, and
    // production builds never set NEXT_PUBLIC_USE_EMULATORS.
    appCheck = initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () =>
          Promise.resolve({ token: 'emulator-app-check-token', expireTimeMillis: Date.now() + 60 * 60 * 1000 }),
      }),
      isTokenAutoRefreshEnabled: false,
    });
    cache = { app, db, functions, appCheck };
    return cache;
  }
  if (publicEnv.recaptchaEnterpriseKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(publicEnv.recaptchaEnterpriseKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  cache = { app, db, functions, appCheck };
  return cache;
}

export function subscribeGuestTicket(
  token: string,
  cb: (t: GuestTicket | null) => void,
  onError: (e: Error) => void
) {
  const { db } = publicFirebase();
  return onSnapshot(
    doc(db, 'guestTickets', token),
    (s) => cb(s.exists() ? (s.data() as GuestTicket) : null),
    onError
  );
}

export function subscribeVenuePublic(
  venueToken: string,
  cb: (v: VenuePublic | null) => void,
  onError: (e: Error) => void
) {
  const { db } = publicFirebase();
  return onSnapshot(
    doc(db, 'venuePublic', venueToken),
    (s) => cb(s.exists() ? (s.data() as VenuePublic) : null),
    onError
  );
}
