import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { metricsDailySchema, uuidv7, type VenueMetrics } from '@goldstar/platform';
import { adminDb, PROJECT_ID } from './seed';

/**
 * Task 9 (task-89-report.md): Admin SDK fixtures for `e2e/dashboard.spec.ts` — the STAFF/DASHBOARD
 * surface's e2e helpers, alongside `seed.ts`'s existing GUEST-surface ones. Shares `seed.ts`'s own
 * `adminDb()` (same named `'e2e-seed'` Firebase app, same already-running Firestore emulator) rather
 * than re-deriving a second connection.
 */

let auth: Auth | null = null;

function adminAuth(): Auth {
  if (auth) return auth;
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  const existing = getApps().find((a) => a.name === 'e2e-seed');
  const app: App = existing ?? initializeApp({ projectId: PROJECT_ID }, 'e2e-seed');
  auth = getAuth(app);
  return auth;
}

/**
 * Mints a platform_admin Auth user directly. Unlike a normal staff account
 * (`identity/claims.handler.ts`'s `syncClaimsHandler`, which derives custom claims from an
 * `operators/{op}/users/{uid}` doc), a platform admin has no `operatorId` and no per-operator user
 * doc at all — its claims (`{ roles: ['platform_admin'], claimsVersion: 1 }`) are the platform's own
 * concept, set directly via `setCustomUserClaims`, mirroring exactly what `syncClaimsHandler` itself
 * would produce for a platform-admin-shaped claims object, just without a Firestore doc to derive it
 * from (there is none to derive it from).
 */
export async function createPlatformAdmin(email: string, password: string): Promise<{ uid: string }> {
  const a = adminAuth();
  const existing = await a.getUserByEmail(email).catch(() => null);
  const uid = existing ? existing.uid : (await a.createUser({ email, password })).uid;
  await a.setCustomUserClaims(uid, { roles: ['platform_admin'], claimsVersion: 1 });
  return { uid };
}

/**
 * Recovers the raw invitation token an e2e test needs to drive `/accept-invite?token=`, without a
 * real inbox to read it from. `identity/invite.ts`'s `inviteHandler` only ever persists a HASH of
 * the token on the `invitations/{id}` doc itself (`tokenHash: hashToken(token)` — SHA-256, one-way,
 * unrecoverable) — the one place the RAW token is ever written to Firestore is the queued
 * `outboundMessages/{id}` doc's `vars.token` field, which is exactly what a real email-rendering
 * step would read to build the invite link. Reading it back here (Admin SDK, rules-bypassing, same
 * trusted access every other e2e fixture already has) is standing in for "open the email and copy
 * the link" — not a security workaround, since this only ever runs against the local emulator.
 *
 * Polls briefly rather than assuming the doc is already visible the instant the triggering callable
 * resolves — `inviteHandler`'s own `outboundMessages` write happens inside the SAME handler
 * invocation the callable awaits, so in practice this resolves on the very first read, but a short
 * retry loop costs nothing and removes any doubt about emulator write-visibility timing.
 */
export async function fetchLatestInviteToken(email: string, timeoutMs = 10_000): Promise<string> {
  const db = adminDb();
  const to = email.toLowerCase();
  const start = Date.now();
  for (;;) {
    const snap = await db.collection('outboundMessages').where('to', '==', to).where('template', '==', 'invitation').get();
    if (!snap.empty) {
      // Multiple invites to the same address (e.g. a re-invite) are possible in principle — take the
      // most recently created one, matching "the invite link in the latest email" semantics.
      const docs = snap.docs.map((d) => d.data() as { createdAt: string; vars: { token: string } });
      docs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const token = docs[0]!.vars.token;
      if (!token) throw new Error(`fetchLatestInviteToken: outboundMessages doc for ${to} has no vars.token`);
      return token;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`fetchLatestInviteToken: no queued invitation email found for ${to} within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

export interface SeedLiveTicketOptions {
  operatorId: string;
  venueId: string;
  status?: 'requested' | 'claimed' | 'retrieving' | 'staged' | 'ready';
  keyTagId?: string;
}

/**
 * Seeds a valet ticket directly on the just-onboarded operator, in an ACTIVE status
 * (`use-live-tickets.ts`'s `ACTIVE_VALET_STATUSES` — `checked_in` is deliberately excluded from
 * that set, so a ticket seeded at `checked_in` would never appear on `/live` at all; `requested`
 * is the default here specifically because it's the first status that IS active). Shape mirrors
 * `seed.ts`'s own `seedTicket` (same field set as the real `ticketSchema`), scoped to this task's
 * own operator/venue instead of the baseline `goldstar`/`v1` fixtures.
 */
export async function seedLiveTicket(opts: SeedLiveTicketOptions): Promise<{ ticketId: string }> {
  const db = adminDb();
  // Bug fix (task-89-report.md): a plain `e2e-live-{timestamp}` string is NOT a valid uuid, but
  // `ticketSchema.id` requires one (`uuidSchema`), and — the failure this caused — so does
  // `claimSchema.ticketId` on any claim later filed against this ticket. `claim-intake-dialog.tsx`
  // writes whatever ticket id it's given straight onto the claim doc; `claimsGenerateBundleHandler`
  // then `claimSchema.safeParse()`s the claim before doing anything else and throws `not_found`
  // ("claim not found") the moment that fails — which is exactly what happened: the callable
  // genuinely ran and returned an error, sanitized client-side to "We couldn't find that.", while
  // the Functions emulator's own "Finished" log line (logged for any completed request/response
  // cycle, success or a caught, well-formed error alike) gave no visible indication anything was
  // wrong. `uuidv7()` — the same id-minting function every other ticket/claim/venue in this
  // codebase uses — fixes it at the source.
  const ticketId = uuidv7();
  const now = new Date().toISOString();
  // Diagnostic guard (task-89-report.md): `onTicketWritten`'s trigger reads
  // `operators/{op}/venues/{ticket.venueId}` and crashes (unguarded `venue.brandingOverride` read on
  // an undefined `venue`) if that doc doesn't exist. Verifying it here, from the SAME Admin SDK
  // connection the ticket write itself uses, turns a confusing downstream trigger crash into an
  // immediate, actionable error if `opts.venueId` is ever wrong.
  const venueSnap = await db.doc(`operators/${opts.operatorId}/venues/${opts.venueId}`).get();
  if (!venueSnap.exists) {
    throw new Error(`seedLiveTicket: no venue at operators/${opts.operatorId}/venues/${opts.venueId} — the ticket write would crash onTicketWritten's projection trigger.`);
  }
  await db.doc(`operators/${opts.operatorId}/tickets/${ticketId}`).set({
    id: ticketId,
    operatorId: opts.operatorId,
    venueId: opts.venueId,
    jobType: 'valet',
    status: opts.status ?? 'requested',
    source: 'staff',
    guest: { phoneE164: '+13175550199', phoneLast4: '0199', consentSms: true },
    vehicle: { plate: 'E2E100', state: 'IN', make: 'Toyota', model: 'Camry', color: 'Black' },
    keyTagId: opts.keyTagId ?? 'e2e-tag',
    zoneId: 'A',
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: {},
    times: { checkedInAt: now, requestedAt: now },
    damageReportIds: [],
    incidentIds: [],
    // `guestToken` is REQUIRED on `ticketBaseSchema` (no `.optional()`) — a random
    // `secretTokenSchema`-shaped value (128-bit, base64url), same convention as `seed.ts`'s own
    // `secretToken()` for the guest fixtures. Nothing in this spec's journey ever needs to resolve
    // this token to a real `guestTickets/{token}` projection — it exists only to satisfy the schema.
    guestToken: randomBytes(16).toString('base64url'),
  });
  return { ticketId };
}

/** One full `venueMetricsSchema`-shaped sample — every field required by
 * `goldstar-platform`'s `src/schemas/metricsDaily.ts`, plausible non-zero values throughout so a
 * KPI tile/P&L row renders a real number rather than "—". Money fields are integer cents,
 * matching every other money field in this codebase.
 *
 * Typed as `VenueMetrics` so a field the schema gains (as `refundedTotal` did) is a type error here
 * rather than a silently-missing value: `analyticsSummary` sums every money field, so one missing
 * field became `NaN` and failed its output parse, leaving Reports/Executive without data. */
function sampleVenueMetrics(): VenueMetrics {
  return {
    tickets: 14,
    retrievalP50: 240,
    retrievalP90: 480,
    throughputPerAttendantHour: 2.3,
    tips: 5200,
    avgTip: 371,
    tipRate: 64,
    revenue: 21000,
    damageReports: 1,
    claims: 1,
    laborCostPerVehicle: 820,
    hourly: Array.from({ length: 24 }, (_, h) => (h >= 17 && h <= 21 ? 3 : 0)),
    driveHome: { jobs: 2, completionSec: 1800, chaseUtilization: 45 },
    rides: { jobs: 1 },
    credentialCompliance: 92,
    offlineSyncSuccess: 97,
    laborCostTotal: 11480,
    platformFees: 525,
    refundedTotal: 1500,
  };
}

/** `yyyy-mm-dd`, `daysAgo` days before today (UTC) — matches `dayStringSchema`'s format and
 * `metrics/daily/days/{day}`'s own doc-id convention. */
function dayString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Seeds `operators/{op}/metrics/daily/days/{day}` docs directly (Admin SDK — the real rollup that
 * would normally produce these, `functions/src/modules/analytics/rollup.ts`, runs on a schedule
 * this e2e run doesn't wait for). Both `analyticsSummary` (KPI tiles, P&L) and `useMetricsSeries`
 * (trend charts) read this exact collection — see `summary.ts`'s own `WeightedAvg` header comment
 * and `reports/page.tsx`'s header comment — so seeding it directly is sufficient to make both
 * `/reports` and `/executive` render real, non-empty values with no Functions call needed.
 *
 * Seeds 2 days (yesterday + the day before), both comfortably inside the Reports/Executive pages'
 * default 30-day range regardless of what local time this test happens to run at.
 */
export async function seedMetricsDays(operatorId: string, venueId: string): Promise<void> {
  const db = adminDb();
  const now = new Date().toISOString();
  for (const daysAgo of [1, 2]) {
    const day = dayString(daysAgo);
    // Parsed through the real schema before writing, so a schema change the type above cannot see
    // (a narrowed range, a new refinement) fails here at seed time, not as an empty Reports page.
    await db.doc(`operators/${operatorId}/metrics/daily/days/${day}`).set(
      metricsDailySchema.parse({
        venues: { [venueId]: sampleVenueMetrics() },
        operator: sampleVenueMetrics(),
        day,
        updatedAt: now,
      }),
    );
  }
}

/**
 * Final whole-branch review, final-wave item 18: a direct Firestore readback of the claim doc's
 * `evidenceBundle` — used by `dashboard.spec.ts`'s bundle-generation step to prove
 * `claimsGenerateBundleHandler` actually wrote real `pdfPath`/`zipPath`/`sha256` fields, not just
 * that the UI flipped to "Regenerate bundle". Complements (doesn't replace) the UI-level
 * href/download assertions in that same test — this is the "ground truth" the UI is rendering FROM.
 */
export async function getClaimEvidenceBundle(
  operatorId: string,
  claimId: string,
): Promise<{ pdfPath: string; zipPath: string; sha256: string; generatedAt: string } | undefined> {
  const snap = await adminDb().doc(`operators/${operatorId}/claims/${claimId}`).get();
  return (snap.data() as { evidenceBundle?: { pdfPath: string; zipPath: string; sha256: string; generatedAt: string } } | undefined)?.evidenceBundle;
}
