import { defineConfig, devices } from '@playwright/test';

/**
 * Owner-demo capture suite (`npm run demo:capture`). Walks every dashboard, venue-portal,
 * platform-console and public page as each persona, saving a full-page screenshot per page and
 * one video per persona to ../demo-media/web/, and asserting each page rendered its real content.
 *
 * Unlike playwright.config.ts (the e2e suite, whose scripts/e2e.mjs starts fresh emulators and runs
 * the baseline seed), this suite NEVER starts, seeds or wipes anything. It reuses emulators that are
 * already running and already seeded with the owner-demo dataset:
 *
 *   cd ../goldstar-platform && npm run emulators   # terminal 1 (demo-goldstar, default ports)
 *   cd ../goldstar-platform && npm run seed:demo   # terminal 2
 *   npm run demo:capture                           # here
 *
 * Specs are `e2e/demo/*.demo.ts`, a suffix the e2e config's default testMatch never picks up.
 * The webServer env mirrors playwright.config.ts (same emulator wiring, same `demo-goldstar`
 * project id) on its own port so it can run beside a dev server or the e2e suite.
 *
 * It records a PRODUCTION build (`next build && next start`), not `next dev`: the dev server's
 * on-demand compiles stall the first visit to each page on camera, and its "Issues" overlay badge
 * would show in every owner video. NEXT_PUBLIC_* values are baked in at build time, so the build
 * runs with the emulator env below.
 */
const PORT = Number(process.env.DEMO_PORT ?? 3200);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PROJECT_ID = 'demo-goldstar';

export default defineConfig({
  testDir: './e2e/demo',
  testMatch: /.*\.demo\.ts$/,
  outputDir: './test-results/demo',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A persona walkthrough visits 10-25 pages with deliberate pauses for the camera.
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    // Without these a click/goto on a missing element waits out the whole 10-minute test timeout.
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    // Slow enough that a viewer can follow each click in the recording.
    launchOptions: { slowMo: 120 },
    trace: 'retain-on-failure',
    // Videos are recorded per persona context by the demo helpers (recordVideo), not here,
    // so each persona gets exactly one coherent file with a stable name.
    video: 'off',
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 10 * 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_USE_EMULATORS: '1',
      NEXT_PUBLIC_EMU_FIRESTORE_PORT: '8080',
      NEXT_PUBLIC_EMU_AUTH_PORT: '9099',
      NEXT_PUBLIC_EMU_FUNCTIONS_PORT: '5001',
      NEXT_PUBLIC_EMU_STORAGE_PORT: '9199',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
    },
  },
});
