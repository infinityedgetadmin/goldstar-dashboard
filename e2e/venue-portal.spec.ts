import { randomBytes } from 'node:crypto';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createPlatformAdmin, fetchLatestInviteToken } from './fixtures/dashboard-seed';
import {
  applyValidationAsStand,
  enableVenuePms,
  getTicket,
  listHostRequests,
  listRideTickets,
  seedVenueTicket,
} from './fixtures/venue-seed';

/**
 * Plan 7 T6: venue-portal e2e journey. A platform admin onboards an operator, its owner accepts,
 * creates a venue and invites a VENUE_USER through the real invite flow; that host then works the
 * portal — requests a guest's car by table, announces a pre-arrival, issues a validation, and sees
 * the overnight report. The valet stand redeems the validation and the guest's price drops.
 *
 * Runs against `goldstar-platform`'s emulators via `scripts/e2e.mjs` (`npm run e2e`), same wiring
 * as `dashboard.spec.ts` — which this file follows: two personas, serial mode, module-scoped pages
 * created once, never a fresh sign-in per step.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────────────────────
 *
 * BOTH ROOM-CHARGE ROWS (mock room charge; no-post blocked) — RULING AU, external-gated. The
 * harness runs the platform's REAL built functions; `getPms` throws `provider_unavailable` for
 * every configured venue because there is no OPERA adapter, `MockPmsProvider` is never wired into
 * production code, and `venue.pms.provider` is `z.literal('opera_cloud')` so even naming a mock
 * would be a contracts change. The ruling rejected an env-gated emulator-only provider seam: a
 * seam that exists is a seam that ships. Both no-post branches are already fully emulator-tested
 * at the handler layer (`roomCharge.test.ts`), and the dialogs are covered with mocked callables —
 * the browser arm would only add "the button is wired". So the hotel row below asserts the
 * OVERNIGHT REPORT, which needs no PMS call at all.
 *
 * THE RIDE ROW IS SPLIT, and this is a finding the T6 scoping did not have. It listed the ride as
 * expressible because the form's copy already stops at "requested" — true of the copy, but the
 * form cannot be SUBMITTED without a destination, and `venue-address-field.tsx` only yields one by
 * selecting a suggestion from `mapsAutocomplete`, which is bound `secrets: ['MAPBOX_SERVER_TOKEN']`
 * and calls the live Mapbox Search Box API. That is the Stripe situation exactly (see
 * `guest-ticket-payment.spec.ts`), so the full submission is gated on `MAPBOX_E2E=1` the same way,
 * and the ungated test asserts what genuinely holds without Mapbox: the form refuses to submit
 * without a real destination, and its copy tells the host the ride is not booked.
 *
 * VALIDATION APPLY IS HARNESS-INVOKED, NOT CLICKED, and the spec does not pretend otherwise.
 * `staffApplyValidation` is the valet STAND's callable and has no dashboard UI (it is called from
 * goldstar-mobile). The portal's own apply surface is the POS one, which constructs a live
 * `ToastPos` against the real Toast API. So the redemption is driven through the real callable and
 * the ASSERTIONS are on the two UIs it propagates to — this tests state propagation, not an apply
 * UI. See `venue-seed.ts`'s `callCallableAs` for the mechanism.
 */
test.describe.configure({ mode: 'serial' });

test.describe('venue portal journey', () => {
  const runId = randomBytes(4).toString('hex');
  const operatorSlug = `e2e-vp-${runId}`;
  const operatorId = operatorSlug; // platformCreateOperator sets id === slug (createOperator.ts)
  const platformAdminEmail = `vp-pa-${runId}@e2e.example.com`;
  const platformAdminPassword = 'password123456';
  const ownerEmail = `vp-owner-${runId}@e2e.example.com`;
  const ownerPassword = 'owner-password-1';
  const hostEmail = `vp-host-${runId}@e2e.example.com`;
  const hostPassword = 'host-password-1';
  const venueName = `E2E Portal Venue ${runId}`;

  let platformAdminContext: BrowserContext;
  let platformAdminPage: Page;
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let hostContext: BrowserContext;
  let hostPage: Page;

  /** Read off the venue detail page's URL — `venue-form.tsx` mints its own uuidv7 at create time. */
  let venueId: string;
  /** The overnight car, seeded 14h ago; also the ticket the validation is redeemed against. */
  let ticketId: string;
  let issuedCode: string;

  test.beforeAll(async ({ browser }) => {
    await createPlatformAdmin(platformAdminEmail, platformAdminPassword);
    platformAdminContext = await browser.newContext();
    platformAdminPage = await platformAdminContext.newPage();
    ownerContext = await browser.newContext();
    ownerPage = await ownerContext.newPage();
    hostContext = await browser.newContext();
    hostPage = await hostContext.newPage();
  });

  test.afterAll(async () => {
    await platformAdminContext.close();
    await ownerContext.close();
    await hostContext.close();
  });

  test('platform admin onboards an operator with venue portals enabled', async () => {
    const page = platformAdminPage;
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(platformAdminEmail);
    await page.getByLabel('Password').fill(platformAdminPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/home/);

    await page.goto('/operators/new');
    await page.getByLabel('Company name').fill('E2E Portal Valet Co');
    await page.getByLabel('Slug').fill(operatorSlug);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // Modules step: `create-operator.ts`'s draft defaults already carry `venuePortals: true`, which
    // is what the whole portal gates on (`(venue)/layout.tsx`). Accepting the defaults is therefore
    // the realistic path AND the one this journey needs.
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await page.getByLabel('Owner email').fill(ownerEmail);
    await page.getByLabel('Owner name').fill('Robin Owner');
    await page.getByRole('button', { name: 'Create operator' }).click();
    await expect(page.getByText('Operator created')).toBeVisible();
  });

  test('owner accepts their invite and creates the venue', async () => {
    const token = await fetchLatestInviteToken(ownerEmail);
    const page = ownerPage;
    await page.goto(`/accept-invite?token=${token}`);
    await page.getByLabel('Your name').fill('Robin Owner');
    // A required field's accessible name carries the asterisk's `aria-label="required"` suffix, so
    // an anchored regex is needed — see dashboard.spec.ts's own note on this.
    await page.getByLabel(/^Password\b/).fill(ownerPassword);
    await page.getByLabel('Confirm password').fill(ownerPassword);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await page.waitForURL(/\/home/);

    await page.goto('/venues/new');
    await page.getByLabel('Name').fill(venueName);
    await page.getByLabel('Address line 1').fill('1 Monument Circle');
    await page.getByLabel('City').fill('Indianapolis');
    await page.getByLabel('State / region').fill('IN');
    await page.getByLabel('Postal code').fill('46204');
    await page.getByLabel('Billing email').fill(`vp-billing-${runId}@e2e.example.com`);
    // The per_ticket fee has no default on purpose — see dashboard.spec.ts's note at its own create.
    await page.getByLabel('Fee per ticket (cents)').fill('250');
    await page.getByRole('button', { name: 'Create venue' }).click();
    // `/venues/new` itself matches a bare `/\/venues\/[^/]+$/`, so the negative lookahead is what
    // makes this wait for the real post-create redirect — see dashboard.spec.ts's note.
    await page.waitForURL(/\/venues\/(?!new\b)[^/]+$/);

    const match = /\/venues\/([^/]+)$/.exec(page.url());
    if (!match) throw new Error(`expected to be on a venue detail page, was at ${page.url()}`);
    venueId = match[1]!;
  });

  test('owner invites a venue_user scoped to that venue', async () => {
    const page = ownerPage;
    await page.goto('/staff');
    await page.getByRole('button', { name: 'Invite staff' }).click();
    await page.getByLabel('Email', { exact: true }).fill(hostEmail);
    await page.getByLabel('Display name').fill('Sam Host');
    // Radix Checkbox renders `role="checkbox"` with `aria-label` — `getByRole` is the reliable
    // match, not `getByLabel`. Both the role and the venue scope come from this one dialog.
    await page.getByRole('checkbox', { name: 'Venue user' }).check();
    await page.getByRole('checkbox', { name: venueName }).check();
    await page.getByRole('button', { name: 'Send invitation' }).click();

    // Stronger than the toast: the invite only exists once its outboundMessages doc is queued.
    await expect(async () => {
      await fetchLatestInviteToken(hostEmail, 2_000);
    }).toPass({ timeout: 15_000 });
  });

  test('the venue_user accepts and lands in the portal, scoped to their one venue', async () => {
    const token = await fetchLatestInviteToken(hostEmail);
    const page = hostPage;
    await page.goto(`/accept-invite?token=${token}`);
    await page.getByLabel('Your name').fill('Sam Host');
    await page.getByLabel(/^Password\b/).fill(hostPassword);
    await page.getByLabel('Confirm password').fill(hostPassword);
    await page.getByRole('button', { name: 'Accept invitation' }).click();

    // WAIT FOR THE ACCEPT TO SETTLE BEFORE NAVIGATING. `accept-invite-form.tsx` calls
    // `identityAcceptInvitation` and THEN `signInWithEmailAndPassword`, redirecting only once the
    // session lands. Navigating straight to `/venue` tore that down mid-flight: the sign-in never
    // persisted, `VenueGate` saw a signed-OUT session and bounced to `/sign-in?next=%2Fvenue`.
    // Leaving the accept page is the proof the session settled — waiting for `/home` specifically
    // would be its own race, since `OperatorGate` immediately bounces a venue_user off it.
    await page.waitForURL((url) => !url.pathname.startsWith('/accept-invite'), { timeout: 20_000 });

    // Accept lands everyone on `/home`, which is the OPERATOR shell — a venue_user has no access
    // there and `OperatorGate` bounces them. The portal is reached explicitly; that redirect is
    // the operator shell behaving correctly, not a failure of this journey.
    await page.goto('/venue');
    await expect(page.getByRole('heading', { name: 'Live board' })).toBeVisible({ timeout: 20_000 });

    // Claim-scoped: a single-venue host gets no switcher at all, and the operator shell's own
    // destinations are absent from the portal nav.
    const nav = page.getByRole('navigation', { name: /primary/i });
    await expect(nav.getByRole('link', { name: 'Requests' })).toBeVisible();
    // `exact: true` matters here, not cosmetically: VENUE_NAV (src/lib/nav.ts) has no item labeled
    // "Staff" — it has "Staffing" (/venue/staffing, StaffingView), a genuinely different,
    // legitimately venue-scoped read-only page (shift coverage counts, no staff names — see that
    // component's own header comment on why, and firestore.rules' shifts `list` rule, which scopes
    // a non-manager's read to `venueId in venueIds()` server-side, not just client-side). Without
    // `exact: true`, Playwright's default name matching is a case-insensitive SUBSTRING
    // (verified against Playwright's own source: `escapeForAttributeSelector(name, !!exact)`,
    // `exact` undefined -> false) — so this assertion was matching "Staffing" as if it were the
    // operator's `/staff` staff-management page, which no nav link here points at and which
    // OperatorGate would bounce a venue_user off anyway (identical mechanism to the /home redirect
    // above, requiring a manager role). The equivalent RTL unit test
    // ((venue)/__tests__/layout.test.tsx, "does not show operator-only destinations") already
    // passes against this same real component, because Testing Library's `name` string matching is
    // exact by default — the opposite of Playwright's — which is why only this suite caught the
    // false positive. Confirmed against a real run's screenshot (test-results/.../test-failed-3.png)
    // before making this change: the rendered sidebar is Live board/Requests/Validations/
    // Reports/Invoices/Staffing, nothing named "Staff".
    await expect(nav.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /venue/i })).toHaveCount(0);

  });

  test('the host requests a guest\'s car by table, and the stand finds it', async () => {
    // Seeded 14h ago so this same car is the overnight report's subject later. Its phone is what
    // the host request matches on, so this asserts the request FOUND a real car rather than
    // falling through to "no ticket found".
    const seeded = await seedVenueTicket({ operatorId, venueId, hoursAgo: 14 });
    ticketId = seeded.ticketId;

    const page = hostPage;
    await page.goto('/venue/requests');
    const form = page.getByRole('form', { name: 'Request a car' });
    await form.getByLabel('Table').fill('12');
    await form.getByLabel('Guest phone').fill('0177');
    await form.getByRole('button', { name: 'Request car' }).click();

    await expect(page.getByText('Car requested')).toBeVisible({ timeout: 20_000 });

    const requests = await listHostRequests(operatorId, venueId);
    const car = requests.find((r) => r.kind === 'car');
    expect(car).toBeDefined();
    expect(car!.table).toBe('12');

    // The server's ground truth: the request moved the seeded car to `requested`.
    await expect(async () => {
      const t = await getTicket(operatorId, ticketId);
      expect(t?.status).toBe('requested');
    }).toPass({ timeout: 20_000 });
  });

  test('the host announces a pre-arrival', async () => {
    const page = hostPage;
    const form = page.getByRole('form', { name: 'Pre-arrival' });
    await form.getByLabel('Guest name').fill('Jordan Guest');
    await form.getByLabel('Party size').fill('4');
    await form.getByRole('checkbox', { name: 'VIP' }).check();
    await form.getByRole('button', { name: 'Send pre-arrival' }).click();

    await expect(page.getByText('Pre-arrival sent to the valet stand')).toBeVisible({ timeout: 20_000 });

    const requests = await listHostRequests(operatorId, venueId);
    const pre = requests.find((r) => r.kind === 'pre_arrival');
    expect(pre).toBeDefined();
    expect(pre!.name).toBe('Jordan Guest');
    expect(pre!.partySize).toBe(4);
  });

  test('the ride form refuses to submit without a real destination, and says it is not booked', async () => {
    // The half of the ride row that holds WITHOUT Mapbox — see this file's header. A typed string
    // is not a destination: the contract needs `{address, geo}`, and only a selected suggestion
    // supplies one. Asserting the guard is honest; asserting a created ride here would not be.
    const page = hostPage;

    // Review N2 asked for a `toPass` wrapper around the zero-ticket read so "nothing was created"
    // stops depending on statement order. `toPass` RETRIES UNTIL IT PASSES, and an absence check
    // passes on its first attempt — so wrapping it would re-run the same point-in-time read and
    // read as a guard without being one. What actually removes the ordering dependency is watching
    // for the CALL: `ride-request-form.tsx` validates and returns BEFORE reaching
    // `callable('venueHostRequest')`, so if the guard holds, no such request is ever sent. A
    // request either was or was not made during the window — no timing assumption in either
    // direction. The server-side read stays as the second, independent check.
    const hostRequestCalls: string[] = [];
    const watch = (req: { url: () => string }) => {
      if (req.url().includes('venueHostRequest')) hostRequestCalls.push(req.url());
    };
    page.on('request', watch);
    try {
      const form = page.getByRole('form', { name: 'Request a ride' });
      // `Passengers` is a <Select> (`PARTY_SIZES`, 1-8), not a text input — `fill` throws on it.
      await form.getByLabel('Passengers').selectOption('2');
      await form.getByLabel('Destination').fill('Indianapolis International Airport');
      await form.getByRole('button', { name: 'Request ride' }).click();

      await expect(page.getByText('Pick the destination from the suggestions so the driver gets an exact location.')).toBeVisible();
      await expect(page.getByText(/it is not booked until they do/)).toBeVisible();
      expect(hostRequestCalls).toHaveLength(0);
    } finally {
      page.off('request', watch);
    }

    expect(await listRideTickets(operatorId, venueId)).toHaveLength(0);
    expect((await listHostRequests(operatorId, venueId)).filter((r) => r.kind === 'ride')).toHaveLength(0);
  });

  test('a venue ride lands and STOPS at requested', async () => {
    // GATED, exactly like guest-ticket-payment.spec.ts's Stripe dependency: `mapsAutocomplete` is
    // bound `secrets: ['MAPBOX_SERVER_TOKEN']` and calls the live Mapbox Search Box API, so the
    // destination field cannot yield a selectable suggestion without a real token bound to the
    // Functions emulator. Set MAPBOX_E2E=1 in a CI job that provisions one and this un-skips.
    test.skip(
      process.env.MAPBOX_E2E !== '1',
      'Requires MAPBOX_SERVER_TOKEN bound to the Functions emulator — mapsAutocomplete calls the live Mapbox API. Set MAPBOX_E2E=1 once it is provisioned.',
    );
    const page = hostPage;
    await page.goto('/venue/requests');
    const form = page.getByRole('form', { name: 'Request a ride' });
    await form.getByLabel('Passengers').selectOption('2');
    await form.getByLabel('Destination').fill('Indianapolis International Airport');
    await page.getByRole('option').first().click();
    await form.getByRole('button', { name: 'Request ride' }).click();

    await expect(page.getByText('Ride requested — your valet operator will confirm it')).toBeVisible({ timeout: 20_000 });

    // The point of the row (reconciled §6 change 2): the H1 security fix removed venue_user AND
    // guest from `passenger_ride`'s quoted->confirmed transition, and `guestConfirmRide` rejects a
    // venue-billed ride outright. A host's ride must land and go no further.
    await expect(async () => {
      const rides = await listRideTickets(operatorId, venueId);
      expect(rides).toHaveLength(1);
      expect(rides[0]!.status).toBe('requested');
      expect(rides[0]!.ride?.billTo).toBe('venue');
    }).toPass({ timeout: 20_000 });
  });

  test('the host issues a validation and is shown the code', async () => {
    const page = hostPage;
    await page.goto('/venue/validations');
    // The page action and the dialog's submit share the label "Issue validation", so the dialog's
    // is scoped — an unscoped match would be ambiguous the moment the dialog opens.
    await page.getByRole('button', { name: 'Issue validation' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Issue a validation' })).toBeVisible();
    // Type defaults to `full`, which needs no amount — so this is the whole form.
    await dialog.getByRole('button', { name: 'Issue validation' }).click();

    await expect(page.getByRole('heading', { name: 'Validation issued' })).toBeVisible({ timeout: 20_000 });
    issuedCode = (await page.getByTestId('issued-code').innerText()).trim();
    expect(issuedCode).toMatch(/^[A-Z0-9]{6}$/);

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(issuedCode)).toBeVisible();
  });

  test('the stand redeems the code, and the portal reflects it', async () => {
    // HARNESS-INVOKED, not clicked — see this file's header.
    //
    // THE GUEST-FACING PRICE DROP IS NOT ASSERTED HERE, and the reason is a finding rather than a
    // convenience. I originally asserted the guest subtotal strictly decreased, having checked that
    // `pay-sheet.tsx` renders `payment.total - payment.tip` from the projection. That is the
    // visible layer; the deciding layer says otherwise, and a real run proved it (subtotal 0):
    //  - `buildProjection` (platform `tickets/projection.ts`) does NOT price anything. It copies
    //    `ticket.payment`, defaulting every field to 0 when the ticket has no payment block — which
    //    a seeded, never-checked-out valet ticket does not.
    //  - `redeemValidation` (platform `venue/validation.ts`) writes ONLY
    //    `payment.validationId`/`payment.validationAmount`. It never re-prices, so no total moves.
    //  - The projection's payment object doesn't carry `validationAmount` at all, so the discount
    //    is invisible to the guest surface until CHECKOUT re-prices — and checkout is
    //    Stripe-gated, exactly as `guest-ticket-payment.spec.ts` documents.
    // So "price drop to $0 + tax on the guest page" is not expressible in this harness. Asserting
    // a decrease that cannot occur would have been a test that could only ever fail, and weakening
    // it to something that passes would have asserted nothing. What IS observable is asserted below.
    const { validationAmount } = await applyValidationAsStand({
      email: ownerEmail,
      password: ownerPassword,
      ticketId,
      code: issuedCode,
    });
    expect(validationAmount).toBeGreaterThan(0);

    // Server ground truth: the redemption is recorded against THIS ticket, at the amount the
    // callable itself returned — the cross-check that makes the number real rather than incidental.
    await expect(async () => {
      const t = await getTicket(operatorId, ticketId);
      expect(t?.payment?.validationAmount).toBe(validationAmount);
    }).toPass({ timeout: 20_000 });

    // And the venue portal reflects it: a redeemed code is terminal (Ruling F), so the row's state
    // pill flips and its "Apply to check" action is gone.
    const page = hostPage;
    await page.goto('/venue/validations');
    const row = page.getByRole('row', { name: new RegExp(issuedCode) });
    await expect(row.getByText('Redeemed')).toBeVisible({ timeout: 20_000 });
  });

  test('the hotel overnight report lists the car that stayed, with no PMS call', async () => {
    // The report reads tickets checked in more than 12h ago and asks the PMS for nothing — which
    // is exactly why it is the hotel row this suite can assert (Ruling AU; see the header).
    // `venue.pms` is set here only so the page renders its real surface instead of the honest
    // "No hotel system connected" empty state.
    await enableVenuePms(operatorId, venueId);

    const page = hostPage;
    await page.goto('/venue/hotel');
    await expect(page.getByRole('heading', { name: 'Hotel' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('No hotel system connected')).toHaveCount(0);

    await expect(page.getByText('Green Subaru Outback')).toBeVisible({ timeout: 20_000 });
    // Scoped to THIS car's own row. "14h" renders twice on the page — the longest-stay stat tile
    // shows it too, and both are correct — so a page-wide text match is ambiguous. The row is also
    // the stronger claim: it pins the stay length against the specific vehicle rather than against
    // the page. Checked in 14h ago, formatted by `stayLength` as whole hours below a day.
    const row = page.getByRole('row', { name: /Green Subaru Outback/ });
    await expect(row.getByText('14h')).toBeVisible();
  });
});
