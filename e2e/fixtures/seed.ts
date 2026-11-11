import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Per-test ticket fixture for the guest ticket page e2e suite.
 *
 * Design choice (disclosed per task-6-brief's Ruling D): this does NOT
 * cross-repo-import goldstar-platform's `functions/src/modules/tickets/
 * ticket.handler.ts` (`ticketWrittenHandler`) to write the `guestTickets/
 * {token}` projection the way `staticCheckout.ts` /
 * `functions/test/helpers.ts`'s `seedTicket` do. Doing that from inside a
 * Playwright spec would mean Playwright's own TS transform loading and
 * transitively resolving a `.ts` module tree that lives entirely outside
 * this repo (and outside this repo's tsconfig/rootDir) — untested,
 * fragile territory. Instead:
 *
 *  - The BASELINE fixtures this suite needs before any test runs
 *    (`operators/goldstar`, `operators/goldstar/venues/v1`, and
 *    everything else `scripts/seed-emulator.ts` seeds) are seeded by
 *    literally running goldstar-platform's own, real
 *    `scripts/seed-emulator.ts` as a child process — see
 *    `scripts/e2e.mjs` in this repo. That script's own `main()` calls the
 *    real `seedOperator`/`syncClaimsHandler` etc. unmodified.
 *  - THIS file, running inside the Playwright test process, only adds the
 *    one thing the baseline script doesn't: a `checked_in` ticket with a
 *    known `guestToken`, written directly via `firebase-admin` (this
 *    repo's own new devDependency, not the platform repo's copy) against
 *    the already-running Firestore emulator.
 *  - The `guestTickets/{token}` projection is NOT written here. `scripts/e2e.mjs` starts the
 *    FUNCTIONS emulator with the platform's real handlers built, and `onTicketWritten`
 *    (`onDocumentWritten` on `operators/{op}/tickets/{ticketId}`) fires on the ticket write
 *    below — `shouldProcessTicketWrite` returns true unconditionally on create — so the REAL
 *    `buildProjection()` writes the real projection. This function waits for it.
 *
 *    Until carry #27 this file ALSO hand-wrote a mirrored projection to that same document, which
 *    made two writers race. Measured over three runs: the real handler overwrote the mirror
 *    100% of the time, 2579 ms / 2846 ms / 5657 ms after the seed returned. So every spec was
 *    reading the MIRROR for the first ~2.6-5.7s and the real projection after — whichever it
 *    happened to reach first. Waiting for the real one removes the race AND the drift class the
 *    mirror created: there is no longer a hand-built shape here to go stale.
 */

// Per-offset project id (platform carry #70): forwarded by scripts/e2e.mjs. The Admin SDK writes
// tickets here and the browser reads them through the client SDK configured in playwright.config.ts —
// both must name the SAME project or the seed lands in a namespace the page never looks at.
export const PROJECT_ID = process.env.GOLDSTAR_EMU_PROJECT_ID ?? 'demo-goldstar';
const OP = 'goldstar';
const VENUE = 'v1';

let db: Firestore | null = null;

// Task 9 (task-89-report.md): exported (was module-private) so `dashboard-seed.ts` shares this
// same emulator-pointed `App`/`Firestore` instance rather than re-deriving the connection details
// (`FIRESTORE_EMULATOR_HOST` default, project id) a second time — `getApps().find(...)` below
// already makes re-calling this from a different module idempotent (same named app either way), so
// this export just gives that second module a typed handle to it instead of reimplementing this
// function's body.
export function adminDb(): Firestore {
  if (db) return db;
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  // No `credential` needed: the Admin SDK talks to the local Firestore
  // emulator (via `FIRESTORE_EMULATOR_HOST` above) unauthenticated and
  // rule-bypassing, same as any other Admin SDK emulator connection.
  const existing = getApps().find((a) => a.name === 'e2e-seed');
  const app: App = existing ?? initializeApp({ projectId: PROJECT_ID }, 'e2e-seed');
  db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

/** Mirrors `@goldstar/platform`'s `secretToken()` (128-bit random, base64url, no padding). */
function secretToken(): string {
  return randomBytes(16).toString('base64url');
}

import type { TicketStatus } from '@goldstar/platform';

interface SeedTicketOptions {
  /** Ticket status to seed. Defaults to `checked_in` (the brief's own default). */
  status?: TicketStatus;
  jobType?: 'valet' | 'drive_home' | 'passenger_ride';
}

interface SeededTicket {
  token: string;
  ticketId: string;
  operatorId: string;
  venueId: string;
}

/**
 * Waits for the REAL projection — written by the platform's `onTicketWritten` trigger running in
 * the functions emulator — to appear. Measured at 2.6-5.7s in practice (function cold start
 * dominates the first call of a run), so the 30s ceiling is generous rather than tight.
 *
 * Fails LOUDLY and specifically on timeout. The most likely cause by far is the functions
 * emulator not running, which used to be invisible: the old hand-written mirror meant a seed
 * "worked" with no trigger at all, and the suite then asserted against a shape this repo invented
 * rather than the one production writes.
 */
async function waitForProjection(firestore: Firestore, token: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    if ((await firestore.doc(`guestTickets/${token}`).get()).exists) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `seedTicket: guestTickets/${token} never appeared after ${timeoutMs}ms. The platform's ` +
          'onTicketWritten trigger writes it — check that the FUNCTIONS emulator is running ' +
          '(scripts/e2e.mjs starts firestore,auth,functions,storage) and that goldstar-platform/functions built cleanly.',
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Seeds one ticket + its `guestTickets/{token}` projection against the
 * ALREADY-running emulators + baseline fixtures (see this file's header
 * comment). Requires `scripts/e2e.mjs`'s baseline seed step (platform's
 * real `seed-emulator.ts`) to have already run — reads `operators/goldstar`
 * and `operators/goldstar/venues/v1`, which that script creates.
 */
export async function seedTicket(opts: SeedTicketOptions = {}): Promise<SeededTicket> {
  const firestore = adminDb();
  const [opSnap, venueSnap] = await Promise.all([
    firestore.doc(`operators/${OP}`).get(),
    firestore.doc(`operators/${OP}/venues/${VENUE}`).get(),
  ]);
  if (!opSnap.exists || !venueSnap.exists) {
    throw new Error(
      `seedTicket: operators/${OP} or operators/${OP}/venues/${VENUE} not found. ` +
        'Run the baseline seed (scripts/e2e.mjs runs goldstar-platform\'s scripts/seed-emulator.ts) before the Playwright test process starts.'
    );
  }
  // The operator/venue documents are read only to ASSERT the baseline seed ran — their contents
  // are no longer needed here. Building the projection was the one thing that consumed them, and
  // the real `onTicketWritten` handler now does that (reading its own copies server-side). The
  // existence check stays: without it, the ticket write below would still succeed and the trigger
  // would fail server-side, surfacing as an unexplained projection timeout instead of this
  // message naming exactly which fixture is missing.

  const now = new Date().toISOString();
  const ticketId = `e2e-${randomBytes(8).toString('hex')}`;
  const token = secretToken();
  const jobType = opts.jobType ?? 'valet';
  const status = opts.status ?? 'checked_in';

  const ticket = {
    id: ticketId,
    operatorId: OP,
    venueId: VENUE,
    jobType,
    status,
    source: 'staff',
    guest: { phoneE164: '+13175550188', phoneLast4: '0188', consentSms: true },
    vehicle: { plate: 'GST100', state: 'IN', make: 'Honda', model: 'Civic', color: 'Blue' },
    keyTagId: 'k1',
    zoneId: 'A',
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: { checkedInBy: 'att1' },
    times: { checkedInAt: now },
    damageReportIds: [],
    incidentIds: [],
    guestToken: token,
  };

  await firestore.doc(`operators/${OP}/tickets/${ticketId}`).set(ticket);
  await waitForProjection(firestore, token);

  return { token, ticketId, operatorId: OP, venueId: VENUE };
}
