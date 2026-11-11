'use client';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { initializeAppCheck, CustomProvider, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

/**
 * Dashboard-side Firebase singleton. Deliberate deviations from the
 * task-2-brief.md sketch, disclosed here (see task-2-report.md for the
 * full writeup — both controller rulings this file resolves):
 *
 * 1. App Check under emulators: the brief's sketch set
 *    `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`. Per Plan 3 Ruling P-p3
 *    (`src/lib/public/firebase.ts`, same file this dashboard client shares
 *    a Firebase app with), that global makes the App Check SDK attempt a
 *    real debug-token exchange against the production App Check backend,
 *    which fails without a console-registered token — and Functions calls
 *    then go out with NO `X-Firebase-AppCheck` header at all, which
 *    `enforceAppCheck: true` onCall functions reject outright. Mirrored
 *    here instead: a `CustomProvider` returning a static dummy token,
 *    exactly `publicFirebase()`'s emulator branch.
 *
 * 2. Shared Firestore instance across two entry points: this file and
 *    `src/lib/public/firebase.ts` both call `getApps()[0] ?? initializeApp(...)`
 *    against the SAME Firebase project config, so in any browser tab that
 *    loads both (e.g. a platform admin who follows a guest ticket link
 *    from inside the dashboard, or vice versa, via client-side
 *    navigation — the `(public)` and dashboard route groups are separate
 *    Next.js chunks but share one JS runtime/document), `getApps()[0]`
 *    resolves to the SAME `FirebaseApp` object in both modules.
 *    `initializeFirestore(app, settings)` can only be called once per
 *    app+database — a second call with different settings throws
 *    (`FirebaseError: Firestore has already been initialized...`).
 *    `publicFirebase()` calls the settings-less `getFirestore(app)`
 *    (verified by reading that file), which either creates a
 *    default-settings instance or reuses whatever instance already
 *    exists — it never throws. So the only failure direction is: guest
 *    surface runs first (plain `getFirestore`), THEN this file's
 *    `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`
 *    runs second on the same app and throws.
 *
 *    Rejected: merging the two files into one shared core module. Doing
 *    so would either (a) pull persistent-cache IndexedDB machinery and
 *    this file's emulator/auth wiring into the guest bundle graph, which
 *    `scripts/check-guest-bundle.mjs` gates at 300 KB gzip and is already
 *    tight (~283 KB measured floor per that script's own comment), or (b)
 *    require editing `src/lib/public/firebase.ts` itself — a file this
 *    task was told is protected ("never regress its gates"). Neither is
 *    worth it for a cross-navigation edge case.
 *
 *    Solved honestly instead: `initializeFirestore` is wrapped in
 *    try/catch. On failure, this falls back to the settings-less
 *    `getFirestore(app)`, which returns whatever Firestore instance
 *    already exists for the app. The dashboard still works in that edge
 *    case — it just loses the persistent (IndexedDB) query cache for that
 *    browser session, which is a performance nicety, not a correctness
 *    requirement. Only genuine `Error`s are swallowed here (not arbitrary
 *    thrown values), so a real misconfiguration elsewhere doesn't get
 *    silently masked.
 */

let cache: { auth: Auth; db: Firestore; functions: Functions; storage: FirebaseStorage; app: FirebaseApp } | null =
  null;

/**
 * `persistentMultipleTabManager()` is not optional here.
 *
 * `persistentLocalCache()` with no `tabManager` defaults to the SINGLE-tab manager, which gives
 * one tab exclusive ownership of the IndexedDB cache — the SDK's own docs say the other tabs
 * "attempting to use the IndexedDB cache will fail". That failure is silent in the worst possible
 * way for this app: the second tab's `onSnapshot` listeners open a Listen channel and then neither
 * deliver a snapshot nor invoke their error callback, so `SessionProvider` sits at `loading`
 * forever and sign-in appears to hang with nothing to show for it. Opening the dashboard in two
 * tabs is not an edge case — it is what anyone does while working.
 *
 * The guest surface (`src/lib/public/firebase.ts`) never hit this because it uses a plain
 * `getFirestore(app)` with no persistence at all, which is also why the guest ticket pages kept
 * working while the dashboard hung.
 */
function initFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    return getFirestore(app);
  }
}

export function firebase() {
  if (cache) return cache;

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });

  const db = initFirestore(app);
  const auth = getAuth(app);
  const functions = getFunctions(app, 'us-central1');
  const storage = getStorage(app);

  if (process.env.NEXT_PUBLIC_USE_EMULATORS === '1') {
    // Env-overridable so `npm run e2e` can run at a GOLDSTAR_EMU_OFFSET without colliding with
    // other emulator work (carry #53). Defaults are the unoffset values; production never sets
    // NEXT_PUBLIC_USE_EMULATORS, so this branch and its reads never execute there.
    connectAuthEmulator(auth, `http://127.0.0.1:${Number(process.env.NEXT_PUBLIC_EMU_AUTH_PORT ?? 9099)}`, { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', Number(process.env.NEXT_PUBLIC_EMU_FIRESTORE_PORT ?? 8080));
    connectFunctionsEmulator(functions, '127.0.0.1', Number(process.env.NEXT_PUBLIC_EMU_FUNCTIONS_PORT ?? 5001));
    connectStorageEmulator(storage, '127.0.0.1', Number(process.env.NEXT_PUBLIC_EMU_STORAGE_PORT ?? 9199));
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () =>
          Promise.resolve({ token: 'emulator-app-check-token', expireTimeMillis: Date.now() + 60 * 60 * 1000 }),
      }),
      isTokenAutoRefreshEnabled: false,
    });
  } else if (process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }

  cache = { auth, db, functions, storage, app };
  return cache;
}

/** Test-only: clears the module-level singleton so a fresh `firebase()` call re-initializes. */
export function __resetFirebaseCacheForTests() {
  cache = null;
}
