import { randomBytes } from 'node:crypto';
import { secretToken, type TicketStatus } from '@goldstar/platform';
import { adminDb } from './seed';

/**
 * Drive-home job + guest-tracking fixtures for `e2e/drive-home-tracking.spec.ts` (Plan 5 Task 6).
 * Extends `seed.ts`'s own established design (its header comment, this file's own precedent):
 * this does NOT cross-repo-import `goldstar-platform`'s `ticketWrittenHandler`/`buildProjection` —
 * it writes the `operators/{op}/tickets/{id}` doc AND the `guestTickets/{token}` projection
 * doc(s) directly via `firebase-admin`, mirroring `functions/src/modules/tickets/projection.ts`'s
 * `buildProjection`/`deriveDriverInfo` shape rather than importing them.
 *
 * Carry #27 update: `seed.ts`'s own mirror is GONE — it now waits for the real trigger-written
 * projection, because measurement showed the real handler overwrote that mirror 100% of the time
 * (2.6-5.7s after the seed), making the two a race. THESE two builders remain, so the drift risk
 * is still live here and `src/test/__tests__/e2e-projection-drift.test.ts` guards them: every key
 * `guestTicketSchema` declares must be produced or explicitly declared omitted. Converting these
 * to wait on the trigger too is a larger change — this file writes a projection at EVERY job
 * transition, so each would need its own wait — and is tracked separately.
 *
 * Reuses `seed.ts`'s already-running Firestore emulator connection (`adminDb()`) and the SAME
 * baseline `goldstar`/`v1` operator/venue `scripts/e2e.mjs` seeds via goldstar-platform's own
 * `scripts/seed-emulator.ts` before any spec runs — same precondition `seedTicket()` already
 * documents (reads `operators/goldstar` + `operators/goldstar/venues/v1`).
 *
 * Design choice: every fixture here writes the GUEST-FACING `guestTickets/{token}` projection
 * doc(s) directly, at every step (initial seed AND each `transitionDriveHomeJob` call) — it does
 * NOT rely on the Functions emulator's live `onTicketWritten` trigger to rebuild them, even though
 * `scripts/e2e.mjs` DOES start the Functions emulator for this repo's `npm run e2e` (unlike the
 * platform repo's own `seed:emulator`/`test:functions`, which don't). Two reasons: (1) consistency
 * with `seed.ts`'s own disclosed, deliberate choice to mirror rather than depend on live trigger
 * behavior for guest projections, and (2) determinism — a real live-trigger dependency would need
 * poll-and-wait logic (this spec would otherwise race the async trigger).
 *
 * Carry #27 measured that race rather than reasoning about it: the trigger DOES fire on these
 * ticket writes and DOES overwrite these projections, 2.6-5.7s later. So "not relying on the
 * trigger" was never actually true — the trigger overwrites these documents regardless; the
 * fixtures simply won the first few seconds. Reason (2) still holds as an argument for waiting
 * being COSTLY here (a wait per transition), but not as an argument that these writes are
 * authoritative. They are not.
 */

const OP = 'goldstar';
const VENUE = 'v1';
const PRIMARY_UID = 'e2e-drive-home-driver';
const PRE_REPORT_ID = 'e2e-pre-drive-report';
const POST_REPORT_ID = 'e2e-post-drive-report';

/** 64 lowercase-hex characters — satisfies `photoSchema.sha256`'s regex without pretending to be
 * a real digest (these are seed fixtures, never uploaded to Storage). Mirrors goldstar-platform's
 * own `scripts/seed-emulator.ts#fakeSha256` helper. */
function fakeSha256(n: number): string {
  return n.toString(16).padStart(64, '0');
}

export interface SeededDriveHomeJob {
  parentToken: string;
  parentTicketId: string;
  jobToken: string;
  jobTicketId: string;
}

interface OperatorDoc {
  id: string;
  currency: string;
  branding: { displayName: string; primaryColor: string; accentColor: string; supportPhone?: string };
  modules: { payments: { tipPresets: number[] } };
  features: { driveHome: boolean; passengerRides: boolean };
}

interface VenueDoc {
  name: string;
  brandingOverride?: { displayName?: string };
}

/** Ensures the one driver user this suite's job(s) are assigned to exists (idempotent `.set()`,
 * same "harmless to re-run" property every other fixture in this directory has). The REAL
 * `deriveDriverInfo`, running in the functions emulator, reads `displayName` off this doc to build
 * the driver block the spec asserts — this fixture seeds the source, the trigger derives. */
async function ensureDriver(): Promise<void> {
  const db = adminDb();
  await db.doc(`operators/${OP}/users/${PRIMARY_UID}`).set(
    {
      uid: PRIMARY_UID,
      operatorId: OP,
      displayName: 'Jordan Ellis',
      roles: ['driver'],
      venueIds: [VENUE],
      status: 'active',
      eligibility: { driveHome: true, passengerRide: false, reasons: [] },
      payoutStatus: 'none',
      fcmTokens: [],
    },
    { merge: true }
  );
}

/**
 * M5 (final review): `scripts/e2e.mjs` runs the LIVE Functions emulator for this repo's suite, and
 * `onJobWritten` (goldstar-platform) gates BOTH the in_transit and completed transitions on a
 * qualifying pre_drive/post_drive damage report existing for the job — without one, the live
 * trigger silently REVERTS the status write `transitionDriveHomeJob` below issues, before
 * Playwright's assertions ever run (this reviewer's own evidence: the spec passed in 1.2s while
 * the revert's projection rebuild fired immediately after — green by timing, not by construction).
 * Mirrors `scripts/seed-emulator.ts`'s own Maestro fixture (goldstar-platform repo) convention:
 * `photoCount: 4` written directly on the report doc (matching `MIN_PRE_DRIVE_PHOTOS`) plus a real
 * 4-doc `photos` subcollection.
 *
 * UPDATED (platform carry #20/#25): the server-side gate no longer reads `photoCount` — it
 * `.count()`s the `photos` subcollection directly, and the `onPhotoCreated` trigger that used to
 * maintain the field has been deleted. So it is the 4-doc subcollection, not the field, that makes
 * this fixture satisfy the gate. The field is now inert here (it survives as an optional,
 * writerless property on the damage schema until a contracts-bump window removes it) and is kept
 * only so the fixture still matches the shape the schema declares. There is no longer an async
 * trigger to race.
 */
async function seedQualifyingDamageReports(jobTicketId: string, now: string): Promise<void> {
  const db = adminDb();
  const vehicleSnapshot = { make: 'Audi', model: 'Q5', color: 'Black' };
  await Promise.all([
    db.doc(`operators/${OP}/damageReports/${PRE_REPORT_ID}`).set({
      id: PRE_REPORT_ID, operatorId: OP, ticketId: jobTicketId, vehicleSnapshot,
      phase: 'pre_drive', diagramMarks: [], notes: 'e2e fixture — pre-drive', createdBy: PRIMARY_UID, createdAt: now, photoCount: 4,
    }),
    db.doc(`operators/${OP}/damageReports/${POST_REPORT_ID}`).set({
      id: POST_REPORT_ID, operatorId: OP, ticketId: jobTicketId, vehicleSnapshot,
      phase: 'post_drive', diagramMarks: [], notes: 'e2e fixture — post-drive', createdBy: PRIMARY_UID, createdAt: now, photoCount: 4,
    }),
  ]);
  const photoWrites: Promise<unknown>[] = [];
  for (const [reportId, stage] of [[PRE_REPORT_ID, 'pre'] as const, [POST_REPORT_ID, 'post'] as const]) {
    for (let i = 0; i < 4; i++) {
      const photoId = `${stage}-${i}`;
      photoWrites.push(
        db.doc(`operators/${OP}/damageReports/${reportId}/photos/${photoId}`).set({
          id: photoId,
          storagePath: `operators/${OP}/tickets/${jobTicketId}/photos/${photoId}.jpg`,
          stage: (['wide', 'medium', 'close', 'diagram'] as const)[i],
          at: now,
          actorUid: PRIMARY_UID,
          deviceId: 'e2e-fixture',
          bytes: 250_000,
          width: 1200,
          height: 900,
          sha256: fakeSha256(i + (stage === 'pre' ? 0 : 100)),
        })
      );
    }
  }
  await Promise.all(photoWrites);
}

async function loadOperatorAndVenue(): Promise<{ op: OperatorDoc; venue: VenueDoc }> {
  const db = adminDb();
  const [opSnap, venueSnap] = await Promise.all([db.doc(`operators/${OP}`).get(), db.doc(`operators/${OP}/venues/${VENUE}`).get()]);
  if (!opSnap.exists || !venueSnap.exists) {
    throw new Error(`job-seed: operators/${OP} or operators/${OP}/venues/${VENUE} not found — run the baseline seed first (scripts/e2e.mjs).`);
  }
  return { op: opSnap.data() as OperatorDoc, venue: venueSnap.data() as VenueDoc };
}

/**
 * Waits for the REAL projection — written by the platform's `onTicketWritten` trigger running in
 * the functions emulator — to reach `status`.
 *
 * Carry #27: this file used to WRITE these projections itself. Measurement showed the trigger
 * overwrites them anyway, 2.6-5.7s later, so the fixture was a second writer racing the real one
 * and winning only the first few seconds. Waiting instead means these specs assert against the
 * shape production actually writes, DERIVED from the source data this fixture already seeds — the
 * `ensureDriver()` user doc, `attendants.primaryDriverUid`, `driveHome.etaAt`, and the
 * `liveLocations` doc — rather than a hand-built copy of that derivation.
 *
 * Status is the predicate rather than mere existence, because a transition rewrites a document
 * that already exists: "it's there" would pass instantly against the PREVIOUS status.
 */
async function waitForProjectionStatus(token: string, status: TicketStatus, timeoutMs = 30_000): Promise<void> {
  const db = adminDb();
  const started = Date.now();
  for (;;) {
    const snap = await db.doc(`guestTickets/${token}`).get();
    if (snap.exists && (snap.data() as { status?: string }).status === status) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `job-seed: guestTickets/${token} never reached status '${status}' within ${timeoutMs}ms ` +
          `(saw '${(snap.data() as { status?: string } | undefined)?.status ?? 'no document'}'). ` +
          "The platform's onTicketWritten trigger writes it — check the FUNCTIONS emulator is running.",
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Waits for the PARENT's projection to list the job at `status` in `linkedJobs`. The same trigger
 * rebuilds the parent whenever a child job is written (`writeAndPropagateProjection` re-derives
 * it), and the spec reads it: the switcher pill's label is "Drive home · <status>", straight off
 * this array.
 */
async function waitForParentLinkedJob(parentToken: string, jobToken: string, status: TicketStatus, timeoutMs = 30_000): Promise<void> {
  const db = adminDb();
  const started = Date.now();
  for (;;) {
    const snap = await db.doc(`guestTickets/${parentToken}`).get();
    const linked = (snap.data() as { linkedJobs?: { token: string; status: string }[] } | undefined)?.linkedJobs ?? [];
    if (linked.some((j) => j.token === jobToken && j.status === status)) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `job-seed: parent guestTickets/${parentToken} never listed job ${jobToken} at '${status}' ` +
          `within ${timeoutMs}ms (saw ${JSON.stringify(linked)}).`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

const DESTINATION = { address: '18 W Market St, Indianapolis, IN', geo: { lat: 39.7683, lng: -86.158 } };
const QUOTE = { base: 2500, distanceMeters: 6437, durationSec: 780, amount: 4900, breakdown: [{ label: 'Base', amount: 2500 }, { label: 'Distance + time', amount: 2400 }] };

/**
 * Seeds a parent valet ticket + a drive-home job already `assigned` to a real driver — the
 * "tracking" scenario (`e2e/drive-home-tracking.spec.ts`'s first test): the parent's own
 * `guestTickets/{parentToken}` projection carries one `linkedJobs` entry so the guest page's
 * switcher pill renders; the job's own `guestTickets/{jobToken}` projection carries the
 * `driveHome` display block and a `driver` (no `etaAt`/`geo` yet — those only appear once
 * `transitionDriveHomeJob` below adds them, matching production: neither exists until the driver
 * starts sharing location / `etaRefresh` computes one).
 */
export async function seedDriveHomeJobTracking(): Promise<SeededDriveHomeJob> {
  const db = adminDb();
  await ensureDriver();
  await loadOperatorAndVenue(); // existence assertion only — the projection is now derived server-side

  const now = new Date().toISOString();
  const parentTicketId = `e2e-parent-${randomBytes(8).toString('hex')}`;
  const jobTicketId = `e2e-job-${randomBytes(8).toString('hex')}`;
  const parentToken = secretToken();
  const jobToken = secretToken();

  const parentTicket = {
    id: parentTicketId,
    operatorId: OP,
    venueId: VENUE,
    jobType: 'valet',
    status: 'checked_in',
    source: 'staff',
    guest: { phoneE164: '+13175550166', phoneLast4: '0166', consentSms: true },
    vehicle: { plate: 'GST200', state: 'IN', make: 'Audi', model: 'Q5', color: 'Black' },
    keyTagId: 'k1',
    zoneId: 'A',
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: { checkedInBy: 'att1' },
    times: { checkedInAt: now },
    damageReportIds: [],
    incidentIds: [],
    guestToken: parentToken,
  };
  const jobTicket = {
    id: jobTicketId,
    operatorId: OP,
    venueId: VENUE,
    parentTicketId,
    jobType: 'drive_home',
    status: 'assigned',
    source: 'guest_web',
    guest: { phoneE164: '+13175550166', phoneLast4: '0166', consentSms: true },
    vehicle: { plate: 'GST200', state: 'IN', make: 'Audi', model: 'Q5', color: 'Black' },
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: { primaryDriverUid: PRIMARY_UID, chaseDriverUid: `${PRIMARY_UID}-chase` },
    times: { checkedInAt: now, requestedAt: now, assignedAt: now },
    // M5 (final review): qualifying reports are seeded below via seedQualifyingDamageReports —
    // both ids listed here for realism/consistency with the real create-time write, even though
    // (like the rest of this fixture) nothing in this spec reads damageReportIds back.
    damageReportIds: [PRE_REPORT_ID, POST_REPORT_ID],
    incidentIds: [],
    guestToken: jobToken,
    driveHome: { destination: DESTINATION, quote: QUOTE, chase: { status: 'pending' } },
  };

  await seedQualifyingDamageReports(jobTicketId, now);
  await Promise.all([db.doc(`operators/${OP}/tickets/${parentTicketId}`).set(parentTicket), db.doc(`operators/${OP}/tickets/${jobTicketId}`).set(jobTicket)]);
  // The spec reads BOTH projections: the pill ("Drive home · Assigned") comes from the parent's linkedJobs,
  // and clicking it renders the job's own projection.
  await waitForProjectionStatus(jobToken, 'assigned');
  await waitForParentLinkedJob(parentToken, jobToken, 'assigned');

  return { parentToken, parentTicketId, jobToken, jobTicketId };
}

export interface TransitionOptions {
  /** Adds `driver.etaAt` + a real `liveLocations/{uid}` doc (mirrors what the driver's own
   * location-publisher + the scheduled `etaRefresh` job would produce) — the brief's own ask for
   * this scenario ("transition the job through assigned -> in_transit with a liveLocations doc"). */
  withLiveLocation?: boolean;
}

/**
 * Advances the seeded job to `status`, rewriting BOTH its own ticket doc (realism/consistency —
 * nothing in this spec reads it back) and its `guestTickets/{jobToken}` projection (what the
 * guest page's live `onSnapshot` listener actually reacts to), plus refreshing the PARENT's
 * `linkedJobs[0].status` on its own projection for full fidelity with `writeAndPropagateProjection`
 * (goldstar-platform)'s real "a job status change refreshes the parent too" behavior — not required
 * for this spec's own assertions (the switcher's tracking view follows the JOB's own live doc via
 * `selectedJobToken`, not the parent's `linkedJobs` array, once a pill has been clicked), but kept
 * for the same reason `seedLiveTicket`/`seedTicket` keep unread realism elsewhere in this
 * directory: a fixture that quietly diverges from the real server behavior it stands in for is a
 * latent trap for the next spec that DOES read the diverged field.
 */
export async function transitionDriveHomeJob(job: SeededDriveHomeJob, status: TicketStatus, opts: TransitionOptions = {}): Promise<void> {
  const db = adminDb();
  await loadOperatorAndVenue(); // existence assertion only — the projection is now derived server-side
  const now = new Date().toISOString();

  const timeField: Record<string, string> = {
    en_route_to_guest: 'enRouteAt',
    pre_drive_inspection: 'inspectionAt',
    in_transit: 'inTransitAt',
    arrived: 'arrivedAt',
    completed: 'completedAt',
  };
  const patch: Record<string, unknown> = { status };
  const tf = timeField[status];
  if (tf) patch[`times.${tf}`] = now;

  if (opts.withLiveLocation) {
    const geo = { lat: 39.7714, lng: -86.1621 };
    const etaAt = new Date(Date.now() + 12 * 60_000).toISOString();
    await db.doc(`operators/${OP}/liveLocations/${PRIMARY_UID}`).set({
      ticketId: job.jobTicketId,
      geo,
      heading: 92,
      speed: 11,
      at: now,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    // The liveLocation doc above and this etaAt are what the REAL `deriveDriverInfo` reads to
    // build the driver block the spec asserts ("Estimated arrival", the lat/lng text). The
    // fixture seeds the SOURCE data and lets the trigger derive; it no longer builds the block.
    patch['driveHome.etaAt'] = etaAt;
  }

  await db.doc(`operators/${OP}/tickets/${job.jobTicketId}`).update(patch);

  // Both projections are read after EVERY transition — the job's own tracking view updates live
  // via onSnapshot, and the parent's pill label comes from its linkedJobs. There is no transition
  // in this fixture whose projection nobody reads, so both are waited on.
  await waitForProjectionStatus(job.jobToken, status);
  await waitForParentLinkedJob(job.parentToken, job.jobToken, status);
}

/**
 * Seeds a parent + a drive-home job stuck at `quoted` (no driver assigned yet, a real quote with
 * a future `expiresAt`) — the resume-quote scenario (`e2e/drive-home-tracking.spec.ts`'s second
 * test): the switcher's pill for a `quoted` entry routes to `DriveHomeSheet`'s quote/terms/Confirm
 * screen instead of `JobTrackingView` (`ticket-view.tsx`'s `selectLinkedJob`) — this spec asserts
 * that screen renders, and deliberately never taps "Confirm and authorize" (Stripe-dependent, same
 * reason `guest-ticket-payment.spec.ts` is gated).
 */
export async function seedQuotedDriveHomeJob(): Promise<SeededDriveHomeJob> {
  const db = adminDb();
  await loadOperatorAndVenue(); // existence assertion only — the projection is now derived server-side
  const now = new Date().toISOString();
  const parentTicketId = `e2e-parent-${randomBytes(8).toString('hex')}`;
  const jobTicketId = `e2e-job-${randomBytes(8).toString('hex')}`;
  const parentToken = secretToken();
  const jobToken = secretToken();
  const quote = { ...QUOTE, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };

  const parentTicket = {
    id: parentTicketId,
    operatorId: OP,
    venueId: VENUE,
    jobType: 'valet',
    status: 'checked_in',
    source: 'staff',
    guest: { phoneE164: '+13175550167', phoneLast4: '0167', consentSms: true },
    vehicle: { plate: 'GST201', state: 'IN', make: 'Subaru', model: 'Outback', color: 'Green' },
    keyTagId: 'k1',
    zoneId: 'A',
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: { checkedInBy: 'att1' },
    times: { checkedInAt: now },
    damageReportIds: [],
    incidentIds: [],
    guestToken: parentToken,
  };
  const jobTicket = {
    id: jobTicketId,
    operatorId: OP,
    venueId: VENUE,
    parentTicketId,
    jobType: 'drive_home',
    status: 'quoted',
    source: 'guest_web',
    guest: { phoneE164: '+13175550167', phoneLast4: '0167', consentSms: true },
    vehicle: { plate: 'GST201', state: 'IN', make: 'Subaru', model: 'Outback', color: 'Green' },
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: {},
    times: { checkedInAt: now, requestedAt: now },
    damageReportIds: [],
    incidentIds: [],
    guestToken: jobToken,
    driveHome: { destination: DESTINATION, quote, chase: { status: 'pending' } },
  };

  await Promise.all([db.doc(`operators/${OP}/tickets/${parentTicketId}`).set(parentTicket), db.doc(`operators/${OP}/tickets/${jobTicketId}`).set(jobTicket)]);
  // The spec reads BOTH projections: the pill ("Drive home · Quoted") comes from the parent's linkedJobs,
  // and the quote/destination it opens comes from the job's own projection.
  await waitForProjectionStatus(jobToken, 'quoted');
  await waitForParentLinkedJob(parentToken, jobToken, 'quoted');

  return { parentToken, parentTicketId, jobToken, jobTicketId };
}
