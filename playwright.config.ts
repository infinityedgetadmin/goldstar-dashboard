import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the guest ticket page e2e suite (Plan 3 Task 6).
 *
 * Runs against the goldstar-platform Firebase emulators (Firestore, Auth,
 * Functions, Storage) — never against a real/deployed Firebase project.
 * `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is pinned to `demo-goldstar` here
 * (overriding whatever `.env.local` has for the dashboard's real
 * `example-valet-staging` project) to match the `--project
 * demo-goldstar` the platform repo's `firebase.json`/`seed-emulator.ts`
 * start the emulators with — a client pointed at a different project id
 * than the emulator's own `--project` is a latent source of "works on my
 * machine" drift (Firestore/Functions emulator requests are keyed by
 * project id even though host:port routing makes it *look* like it
 * doesn't matter), and using the same fake `demo-` project id everywhere
 * also means this suite never sends any App Check request at the real,
 * deployed `example-valet-staging` project.
 *
 * F4 (final review): App Check under `NEXT_PUBLIC_USE_EMULATORS=1` needs no
 * env var at all here. `publicFirebase()`'s emulator branch (`src/lib/
 * public/firebase.ts`) initializes App Check with a `CustomProvider` that
 * returns a static dummy token unconditionally — it never sets the
 * `FIREBASE_APPCHECK_DEBUG_TOKEN` global (Ruling P-p3 deliberately removed
 * that mechanism: it makes the App Check SDK attempt a REAL debug-token
 * exchange against Google's backend, which fails without a
 * console-registered debug token and leaves requests with no
 * `X-Firebase-AppCheck` header at all) and never reads
 * `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY` — that branch returns before the
 * production `ReCaptchaEnterpriseProvider` init is ever reached. `env.ts`'s
 * own build-time guard for that key is likewise skipped whenever
 * `useEmulators` is true. So this webServer env carries no ReCAPTCHA/Stripe
 * publishable-key placeholders — there is nothing here for them to satisfy,
 * and keeping one around only invites a future edit to assume it's load-
 * bearing.
 */
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // Task 9 (task-89-report.md): `dashboard.spec.ts` drives real staff/owner invitations, which fire
  // goldstar-platform's `onOutboundMessageCreated` trigger — that trigger tries to resolve real
  // Twilio/Resend secrets (its `defineCallable`/trigger `secrets: [...]` declaration) and, without
  // valid Application Default Credentials for Secret Manager (any dev machine with a stale/expired
  // `gcloud`/`firebase` CLI login, and — worth flagging for the CI decision below — most CI runners
  // by default), retries against the real Secret Manager API for several real seconds before giving
  // up. The default 30s per-test timeout is comfortably eaten by that alone on a loaded dev machine
  // also running 3 JVM/Node emulators and a Next dev server. Bumped for the whole suite (the guest
  // specs don't trigger this path and are unaffected either way) rather than only this one spec.
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_USE_EMULATORS: '1',
      // Forwarded from scripts/e2e.mjs, which computes them from GOLDSTAR_EMU_OFFSET. The browser
      // connects to the emulators directly, so the APP has to know the offset ports too — not just
      // the harness. Falls back to the unoffset defaults when run without the orchestrator.
      NEXT_PUBLIC_EMU_FIRESTORE_PORT: process.env.NEXT_PUBLIC_EMU_FIRESTORE_PORT ?? '8080',
      NEXT_PUBLIC_EMU_AUTH_PORT: process.env.NEXT_PUBLIC_EMU_AUTH_PORT ?? '9099',
      NEXT_PUBLIC_EMU_FUNCTIONS_PORT: process.env.NEXT_PUBLIC_EMU_FUNCTIONS_PORT ?? '5001',
      NEXT_PUBLIC_EMU_STORAGE_PORT: process.env.NEXT_PUBLIC_EMU_STORAGE_PORT ?? '9199',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
      // Per-offset project id (platform carry #70): scripts/e2e.mjs derives it from GOLDSTAR_EMU_OFFSET
      // and exports GOLDSTAR_EMU_PROJECT_ID. The client SDK builds callable URLs from the project id,
      // so if this drifted from what the emulator started with, every callable would 404 against a
      // project the functions emulator never registered. Unoffset default when run without the wrapper.
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${process.env.GOLDSTAR_EMU_PROJECT_ID ?? 'demo-goldstar'}.firebaseapp.com`,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.GOLDSTAR_EMU_PROJECT_ID ?? 'demo-goldstar',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${process.env.GOLDSTAR_EMU_PROJECT_ID ?? 'demo-goldstar'}.appspot.com`,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
    },
  },
});
