import { randomBytes } from 'node:crypto';
import { uuidv7, type Ticket } from '@goldstar/platform';
import { adminDb, PROJECT_ID } from './seed';

/**
 * Plan 7 T6: Admin SDK + emulator-REST fixtures for `e2e/venue-portal.spec.ts`, alongside
 * `seed.ts`'s guest-surface helpers and `dashboard-seed.ts`'s staff ones. Shares `seed.ts`'s
 * `adminDb()` — same named `'e2e-seed'` app, same running Firestore emulator — rather than
 * re-deriving a second connection.
 *
 * Ports come from the env `scripts/e2e.mjs` sets for the Playwright process, so these work at any
 * `GOLDSTAR_EMU_OFFSET`. The defaults match that script's own unoffset base ports.
 */
const authPort = () => Number(process.env.NEXT_PUBLIC_EMU_AUTH_PORT ?? 9099);
const functionsPort = () => Number(process.env.NEXT_PUBLIC_EMU_FUNCTIONS_PORT ?? 5001);

/**
 * Puts a PMS config on the venue so the hotel portal renders its real surface instead of the
 * "No hotel system connected" empty state.
 *
 * Written directly rather than through the Integrations dialog: that UI has its own full unit
 * suite, and driving it here would add an operator sign-in, a page load and a dialog round trip to
 * set up a screen this spec only needs as a precondition. The shape is `venueSchema.pms`'s, which
 * is what `venue-form.tsx` and the Integrations dialog both write.
 *
 * Note what this does NOT enable: there is no OPERA adapter (Ruling H), so `getPms` throws
 * `provider_unavailable` for this venue and every PMS-backed action still fails server-side. That
 * is why this spec only asserts the OVERNIGHT REPORT, which needs no PMS call at all — see the
 * spec's own header for the room-charge rows Ruling AU external-gates.
 */
export async function enableVenuePms(operatorId: string, venueId: string): Promise<void> {
  await adminDb()
    .doc(`operators/${operatorId}/venues/${venueId}`)
    .update({
      pms: { provider: 'opera_cloud', hotelId: 'E2E-HOTEL', chargeCode: 'VALET', noPostBehavior: 'block' },
      updatedAt: new Date().toISOString(),
    });
}

export interface SeedVenueTicketOptions {
  operatorId: string;
  venueId: string;
  /** How long ago the car was checked in. The overnight report's threshold is 12h. */
  hoursAgo?: number;
  status?: Ticket['status'];
  vehicle?: { make: string; model: string; color: string; plate: string };
}

export interface SeededVenueTicket {
  ticketId: string;
  /** The `guestTickets/{token}` projection key — for asserting the guest-facing price. */
  token: string;
}

/**
 * Seeds one valet ticket at this spec's own operator/venue and waits for the REAL
 * `guestTickets/{token}` projection written by the platform's `onTicketWritten` trigger.
 *
 * The wait is the same discipline `seed.ts` adopted in carry #27: this file does NOT hand-write a
 * mirrored projection. Two writers raced, the real handler won 100% of the time 2.6-5.7s later,
 * and every assertion in between read a shape this repo invented. Waiting for the real one removes
 * the race and the drift class together — and makes a missing functions emulator fail loudly here
 * instead of silently passing against a fixture.
 */
export async function seedVenueTicket(opts: SeedVenueTicketOptions): Promise<SeededVenueTicket> {
  const db = adminDb();
  const venueSnap = await db.doc(`operators/${opts.operatorId}/venues/${opts.venueId}`).get();
  if (!venueSnap.exists) {
    throw new Error(
      `seedVenueTicket: no venue at operators/${opts.operatorId}/venues/${opts.venueId} — the ticket write would crash onTicketWritten's projection trigger.`,
    );
  }

  const ticketId = uuidv7();
  const token = randomBytes(16).toString('base64url');
  const checkedInAt = new Date(Date.now() - (opts.hoursAgo ?? 14) * 3600_000).toISOString();
  const vehicle = opts.vehicle ?? { make: 'Subaru', model: 'Outback', color: 'Green', plate: 'E2EVEN1' };

  await db.doc(`operators/${opts.operatorId}/tickets/${ticketId}`).set({
    id: ticketId,
    operatorId: opts.operatorId,
    venueId: opts.venueId,
    jobType: 'valet',
    status: opts.status ?? 'checked_in',
    source: 'staff',
    guest: { phoneE164: '+13175550177', phoneLast4: '0177', consentSms: true },
    vehicle: { ...vehicle, state: 'IN' },
    keyTagId: 'e2e-venue-tag',
    zoneId: 'A',
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: {},
    times: { checkedInAt },
    damageReportIds: [],
    incidentIds: [],
    guestToken: token,
  });

  const started = Date.now();
  for (;;) {
    if ((await db.doc(`guestTickets/${token}`).get()).exists) break;
    if (Date.now() - started > 30_000) {
      throw new Error(
        `seedVenueTicket: guestTickets/${token} never appeared after 30000ms. The platform's ` +
          'onTicketWritten trigger writes it — check the FUNCTIONS emulator is running and goldstar-platform/functions built cleanly.',
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return { ticketId, token };
}

/**
 * Exchanges an email/password for an ID token against the AUTH EMULATOR's REST endpoint. The API
 * key is not validated by the emulator, so any non-empty string works — this is the same
 * `signInWithPassword` call the Firebase JS SDK makes in the browser, just issued directly.
 */
async function signInForIdToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://127.0.0.1:${authPort()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`signInForIdToken: auth emulator returned ${res.status} for ${email}: ${await res.text()}`);
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error(`signInForIdToken: no idToken in the auth emulator's response for ${email}`);
  return body.idToken;
}

/**
 * Invokes an `onCall` callable directly against the FUNCTIONS emulator, as a real signed-in user.
 *
 * WHY THIS EXISTS RATHER THAN A UI CLICK. `staffApplyValidation` is the valet STAND's redemption
 * path and has no dashboard UI at all — it is called from goldstar-mobile. The venue portal's own
 * apply surface is the POS one (`apply-to-check-dialog.tsx` -> `posFindCheck`/`posApplyValidation`),
 * which constructs a live `ToastPos` and makes a real network call to Toast; there is no sandbox
 * and no local provider, so it cannot run in the emulator. Driving redemption through the real
 * callable and asserting the RESULT in the UI is therefore the honest shape for this row: it tests
 * state propagation into two surfaces, NOT an apply UI, and the spec says so where it uses it.
 *
 * `X-Firebase-AppCheck` carries the same dummy token the app's own emulator branch mints
 * (`src/lib/firebase/client.ts`), because `defineCallable` sets `enforceAppCheck: true` by default
 * and a request with no header at all is rejected outright. The emulator does not verify the
 * token's contents.
 */
async function callCallableAs<T>(opts: { name: string; email: string; password: string; data: unknown }): Promise<T> {
  const idToken = await signInForIdToken(opts.email, opts.password);
  const res = await fetch(`http://127.0.0.1:${functionsPort()}/${PROJECT_ID}/us-central1/${opts.name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      'X-Firebase-AppCheck': 'emulator-app-check-token',
    },
    body: JSON.stringify({ data: opts.data }),
  });
  const body = (await res.json()) as { result?: T; error?: { message?: string; status?: string } };
  if (!res.ok || body.error) {
    throw new Error(`callCallableAs(${opts.name}): ${res.status} ${body.error?.status ?? ''} ${body.error?.message ?? ''}`.trim());
  }
  return body.result as T;
}

/** Redeems a validation code against a ticket as the valet stand would — see `callCallableAs`. */
export function applyValidationAsStand(opts: {
  email: string;
  password: string;
  ticketId: string;
  code: string;
}): Promise<{ validationAmount: number }> {
  return callCallableAs<{ validationAmount: number }>({
    name: 'staffApplyValidation',
    email: opts.email,
    password: opts.password,
    data: { ticketId: opts.ticketId, code: opts.code },
  });
}

/** Reads a ticket back — the server-side ground truth behind whatever the UI is rendering. */
export async function getTicket(operatorId: string, ticketId: string): Promise<Ticket | undefined> {
  const snap = await adminDb().doc(`operators/${operatorId}/tickets/${ticketId}`).get();
  return snap.data() as Ticket | undefined;
}

/** Host requests raised from the venue portal, newest first. */
export async function listHostRequests(
  operatorId: string,
  venueId: string,
): Promise<{ id: string; kind: string; table?: string; name?: string; partySize?: number }[]> {
  const snap = await adminDb().collection(`operators/${operatorId}/hostRequests`).where('venueId', '==', venueId).get();
  const rows = snap.docs.map((d) => d.data() as { id: string; kind: string; table?: string; name?: string; partySize?: number; createdAt?: string });
  rows.sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1));
  return rows;
}

/** Every ride ticket at this venue — used to assert a venue ride lands and STOPS at `requested`. */
export async function listRideTickets(operatorId: string, venueId: string): Promise<Ticket[]> {
  const snap = await adminDb()
    .collection(`operators/${operatorId}/tickets`)
    .where('venueId', '==', venueId)
    .where('jobType', '==', 'passenger_ride')
    .get();
  return snap.docs.map((d) => d.data() as Ticket);
}
