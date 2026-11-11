import { randomBytes } from 'node:crypto';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createPlatformAdmin, fetchLatestInviteToken, getClaimEvidenceBundle, seedLiveTicket, seedMetricsDays } from './fixtures/dashboard-seed';

/**
 * Task 9 (task-89-report.md): dashboard operations e2e journey, per the brief's own step list —
 * platform admin onboards an operator → owner accepts invite → creates a venue with rates →
 * generates key tags (PDF download) → invites an attendant → sees the live board with a seeded
 * ticket → opens the ticket → creates a claim → generates its evidence bundle (emulator Storage) →
 * sees audit entries for it all. Plus the controller's own addition: a reports/executive smoke
 * (seeded `metrics/daily` docs render as real KPI tiles and P&L rows) — the one path no other
 * automated suite covers, and the one that let the `analyticsSummary` `avgTip`/`laborCostPerVehicle`
 * rounding bug (fixed in Plan 4b Task 7's own fix rounds) ship undetected through every unit/handler
 * test.
 *
 * Runs against `goldstar-platform`'s Firebase emulators, orchestrated by `scripts/e2e.mjs`
 * (`npm run e2e`) exactly like `guest-ticket.spec.ts`/`guest-ticket-payment.spec.ts` already do — see
 * that script and `playwright.config.ts` for the emulator/webServer wiring this spec relies on.
 *
 * Two personas, two contexts, reused across every step (`test.describe.configure({ mode: 'serial'
 * })` + module-scoped `Page`s created once in `beforeAll`) — never a fresh sign-in per step. A
 * platform admin has no natural home in `identity/claims.handler.ts`'s normal per-operator
 * `syncClaimsHandler` derivation (no `operatorId`, no per-operator user doc), so
 * `dashboard-seed.ts`'s `createPlatformAdmin` sets that persona's custom claims directly instead —
 * disclosed there. The attendant invited near the end never signs in in this spec: every step after
 * "invites attendant" (live board, ticket, claim, bundle, audit) is an owner/admin/platform_admin
 * action per firestore.rules' own claims/damage-claims create rules, so a third signed-in persona
 * would add real minutes to this run for a session this journey has no actual use for.
 */
test.describe.configure({ mode: 'serial' });

test.describe('dashboard operations journey', () => {
  const runId = randomBytes(4).toString('hex');
  const operatorSlug = `e2e-op-${runId}`;
  const operatorId = operatorSlug; // platformCreateOperator sets id === slug (create-operator.ts)
  const platformAdminEmail = `pa-${runId}@e2e.example.com`;
  const platformAdminPassword = 'password123456';
  const ownerEmail = `owner-${runId}@e2e.example.com`;
  const attendantEmail = `att-${runId}@e2e.example.com`;
  const venueName = `E2E Venue ${runId}`;

  let platformAdminContext: BrowserContext;
  let platformAdminPage: Page;
  let ownerContext: BrowserContext;
  let ownerPage: Page;

  // Set once the "generates key tags" test reads it off the venue detail page's URL — venue-form.tsx
  // mints its own uuidv7 id at create time, so no test here can know it in advance.
  let resolvedVenueId: string;
  let ticketId: string;
  let claimId: string;

  test.beforeAll(async ({ browser }) => {
    await createPlatformAdmin(platformAdminEmail, platformAdminPassword);
    platformAdminContext = await browser.newContext();
    platformAdminPage = await platformAdminContext.newPage();
    ownerContext = await browser.newContext();
    ownerPage = await ownerContext.newPage();
  });

  test.afterAll(async () => {
    await platformAdminContext.close();
    await ownerContext.close();
  });

  test('platform admin signs in and onboards a new operator, inviting its owner', async () => {
    const page = platformAdminPage;
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(platformAdminEmail);
    await page.getByLabel('Password').fill(platformAdminPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/home/);

    await page.goto('/operators/new');

    // Identity step — everything but name/slug already has a valid default.
    await page.getByLabel('Company name').fill('E2E Valet Co');
    await page.getByLabel('Slug').fill(operatorSlug);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Plan step — default ('standard') is valid.
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Modules step — defaults are valid.
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Invite-owner step.
    await page.getByLabel('Owner email').fill(ownerEmail);
    await page.getByLabel('Owner name').fill('Riley Owner');
    await page.getByRole('button', { name: 'Create operator' }).click();

    await expect(page.getByText('Operator created')).toBeVisible();
  });

  test('owner accepts their invite and signs in', async () => {
    const token = await fetchLatestInviteToken(ownerEmail);
    const page = ownerPage;
    await page.goto(`/accept-invite?token=${token}`);
    await page.getByLabel('Your name').fill('Riley Owner');
    // Required fields render a `<Label required>` whose asterisk carries `aria-label="required"`
    // (`typography/Label.tsx`) — the computed accessible name is "Password required", not "Password"
    // (nor visually "Password *", which is only what's painted, not the accessibility-tree name
    // `getByLabel` actually matches against). Plain `exact: true` against 'Password' therefore never
    // matches and waits out the full test timeout; an anchored regex is robust to the exact suffix
    // and still can't ambiguously match "Confirm password required" (starts with "Confirm").
    await page.getByLabel(/^Password\b/).fill('owner-password-1');
    await page.getByLabel('Confirm password').fill('owner-password-1');
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    // Final whole-branch review, final-wave item 17: `accept-invite-form.tsx`'s successful-accept
    // path now lands on `/home` (welcome + first-run checklist), matching `sign-in-form.tsx`'s own
    // default — previously it was the bare `/` "under construction" placeholder, a Plan 4a-era
    // leftover from before `/home` existed.
    await page.waitForURL(/\/home/);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });

  test('owner creates a venue with rates (defaults) and required contact fields', async () => {
    const page = ownerPage;
    await page.goto('/venues/new');
    await page.getByLabel('Name').fill(venueName);
    await page.getByLabel('Address line 1').fill('123 Main St');
    await page.getByLabel('City').fill('Indianapolis');
    await page.getByLabel('State / region').fill('IN');
    await page.getByLabel('Postal code').fill('46204');
    await page.getByLabel('Billing email').fill(`billing-${runId}@e2e.example.com`);
    // Rates/zones/SMS keep their form defaults (defaultRates() is already a fully valid
    // `venueRatesSchema` value) — only the fields with no valid default need filling here. The
    // contract's billing figure is one of those BY DESIGN (contracts v0.4.5+): the default model is
    // per_ticket and its fee is deliberately not defaulted, because a defaulted 0 is a venue invoiced
    // for nothing. This journey timed out here under v0.4.6 until the fee was filled.
    await page.getByLabel('Fee per ticket (cents)').fill('250');
    await page.getByRole('button', { name: 'Create venue' }).click();
    // `/venues/new` (the CURRENT url, before this click's navigation even completes) itself already
    // matches a bare `/\/venues\/[^/]+$/` — Playwright's `waitForURL` checks the current URL before
    // waiting for a new navigation, so that pattern resolves trivially on the pre-navigation URL
    // instead of waiting for the real post-create redirect, a real race caught by the next test
    // reading back a venueId of literally `"new"` and failing loudly (task-89-report.md — the
    // failure was clear, not a silent wrong-venue write, thanks to `seedLiveTicket`'s own existence
    // check). The negative lookahead excludes exactly the one path segment that's a false match.
    await page.waitForURL(/\/venues\/(?!new\b)[^/]+$/);
  });

  test('owner generates key tags and prints a batch, asserting a real PDF download', async () => {
    const page = ownerPage;
    // venue-form.tsx mints its own uuidv7 id, not `venueId` above — read it back off the URL the
    // previous step's create navigated to, and reuse it as this test's own venueId for every
    // subsequent step (the live ticket seed, the live board, and the metrics seed all need it).
    const url = page.url();
    const match = /\/venues\/([^/]+)$/.exec(url);
    if (!match) throw new Error(`expected to be on a venue detail page, was at ${url}`);
    resolvedVenueId = match[1]!;

    // Plain 'Count' ambiguously substring-matches the venue detail page's own 'Country' field
    // (address.country) — `getByRole` with the spinbutton role Playwright itself reports is exact.
    await page.getByRole('spinbutton', { name: 'Count', exact: true }).fill('20');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByText(/^Batch /)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Print sheet (PDF)' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^key-tags-.*\.pdf$/);
  });

  test('owner invites an attendant', async () => {
    const page = ownerPage;
    await page.goto('/staff');
    await page.getByRole('button', { name: 'Invite staff' }).click();
    await page.getByLabel('Email', { exact: true }).fill(attendantEmail);
    await page.getByLabel('Display name').fill('Alex Attendant');
    // Radix's Checkbox renders `role="checkbox"` with `aria-label`, not a native
    // `<input type="checkbox">` — `getByRole('checkbox', { name })` is the reliable match here,
    // not `getByLabel` (which targets label/aria-labelledby-associated form controls).
    await page.getByRole('checkbox', { name: 'Attendant' }).check();
    await page.getByRole('button', { name: 'Send invitation' }).click();

    // Stronger than a fleeting toast: the invite only exists (and can only be accepted) once its
    // outboundMessages doc is queued — this IS the invite having actually succeeded server-side.
    await expect(async () => {
      await fetchLatestInviteToken(attendantEmail, 2_000);
    }).toPass({ timeout: 15_000 });
  });

  test('a seeded live ticket appears on the live board, opens to its full ticket page', async () => {
    const seeded = await seedLiveTicket({ operatorId, venueId: resolvedVenueId });
    ticketId = seeded.ticketId;

    const page = ownerPage;
    await page.goto('/live');
    const row = page.getByRole('button', { name: /^Open .*Camry$/ });
    await expect(row).toBeVisible();
    await row.click();
    await page.getByRole('button', { name: 'Open full ticket' }).click();
    await page.waitForURL(new RegExp(`/tickets/${ticketId}$`));
  });

  test('owner opens a damage claim from the ticket', async () => {
    const page = ownerPage;
    await page.getByRole('button', { name: 'Open claim' }).click();
    await page.waitForURL(new RegExp(`/claims/new\\?ticketId=${ticketId}$`));

    await page.getByLabel('Claim description').fill('Scuff on rear bumper noted at drop-off.');
    await page.getByRole('button', { name: 'Create claim' }).click();
    // Final whole-branch review, item 18 fix: `/\/claims\/[^/]+$/` also matches the CURRENT
    // `/claims/new?ticketId=...` url — `[^/]` doesn't exclude `?`, so the query string's tail
    // satisfies it with zero navigation, and `waitForURL` returns immediately without ever
    // reaching the real claim detail page. `claimId` then silently captured
    // "new?ticketId=<uuid>" instead of the real claim id — invisible until item 18's new
    // assertions actually string-matched on it. A real claim id is a uuid; require that shape and
    // exclude `new` explicitly so this can never again match the intake page itself.
    await page.waitForURL(/\/claims\/(?!new)[0-9a-f-]{36}$/);

    const url = page.url();
    const match = /\/claims\/([0-9a-f-]{36})$/.exec(url);
    if (!match) throw new Error(`expected to be on a claim detail page, was at ${url}`);
    claimId = match[1]!;
    expect(claimId).toBeTruthy();
  });

  test('owner generates the claim evidence bundle in emulator Storage', async () => {
    const page = ownerPage;
    await expect(page.getByRole('button', { name: 'Generate bundle' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate bundle' }).click();
    // `claimsGenerateBundleHandler` writes evidenceBundle onto the claim doc; the panel's own
    // `useDoc` live-subscribes to it, so a successful generate flips the button to "Regenerate
    // bundle" and shows a generated timestamp with no page reload needed.
    await expect(page.getByRole('button', { name: 'Regenerate bundle' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Generated /)).toBeVisible();

    // Final whole-branch review, final-wave item 18: strengthened past "the button changed state".
    // `evidence-panel.tsx`'s "Download PDF"/"Download originals (.zip)" are plain `<a
    // href={storageUrl} target="_blank">` (no `download` attribute) pointed at a minted Storage
    // download URL — clicking opens a new tab a PDF viewer can render inline rather than reliably
    // firing Playwright's `download` event, so the true "download-event standard"
    // (`page.waitForEvent('download')`, used above for key-tags' `<button>`-triggered save) isn't
    // reliably applicable here. Instead: assert the link is present with a real, well-shaped
    // resolved href (a Storage emulator download URL, token-bearing, pointed at THIS claim's own
    // path — not empty/undefined/a placeholder), AND cross-check it against a direct Firestore
    // readback of the claim doc's own `evidenceBundle` — the ground truth the UI is rendering from.
    const pdfLink = page.getByRole('link', { name: 'Download PDF' });
    await expect(pdfLink).toBeVisible();
    const pdfHref = await pdfLink.getAttribute('href');
    expect(pdfHref).toBeTruthy();
    expect(pdfHref).toMatch(/^https?:\/\/[^/]+\/v0\/b\/[^/]+\/o\/.*token=/);
    expect(decodeURIComponent(pdfHref!)).toContain(`operators/${operatorId}/claims/${claimId}/evidence.pdf`);

    const zipLink = page.getByRole('link', { name: 'Download originals (.zip)' });
    await expect(zipLink).toBeVisible();
    const zipHref = await zipLink.getAttribute('href');
    expect(zipHref).toBeTruthy();
    expect(decodeURIComponent(zipHref!)).toContain(`operators/${operatorId}/claims/${claimId}/evidence.zip`);

    const bundle = await getClaimEvidenceBundle(operatorId, claimId);
    expect(bundle).toBeDefined();
    expect(bundle!.pdfPath).toBe(`operators/${operatorId}/claims/${claimId}/evidence.pdf`);
    expect(bundle!.zipPath).toBe(`operators/${operatorId}/claims/${claimId}/evidence.zip`);
    expect(bundle!.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('the audit log shows entries for the actions taken above', async () => {
    const page = ownerPage;
    await page.goto('/audit');
    await page.getByRole('button', { name: 'Search' }).click();
    // Default range is the last 7 days — this entire run fits well inside it. Asserts at least one
    // real entry renders (not the empty state), rather than an exhaustive action-by-action list —
    // claim CREATION itself is a direct client write (claim-intake-dialog.tsx, not a callable) and
    // so is never audited; `identity.invite` / `identity.acceptInvitation` /
    // `platform.createOperator` / `venue.generateKeyTags` / `claims.generateBundle` all are.
    await expect(page.getByText('No audit entries')).not.toBeVisible();
    await expect(page.getByText('integrations.setSecret').or(page.getByText(/^identity\./)).or(page.getByText(/^platform\./)).or(page.getByText(/^venue\./)).or(page.getByText(/^claims\./)).first()).toBeVisible();
  });

  test('reports and executive render real values from seeded metrics/daily (controller addition)', async () => {
    await seedMetricsDays(operatorId, resolvedVenueId);

    const page = ownerPage;
    await page.goto('/reports');
    // Final whole-branch review, final-wave item 15: EXACT value, not just "isn't the '—' placeholder".
    // `seedMetricsDays` writes `sampleVenueMetrics()` (tickets: 14) to TWO days (daysAgo 1 and 2);
    // Reports defaults to the 30d range preset, which covers both, and `analyticsSummary` sums
    // `tickets` as an exact integer (summary.ts: `tickets += vm.tickets`) across every day in range
    // (the other 28 days are unseeded -> contribute 0). 14 + 14 = 28, formatted via
    // `formatMetricValue`'s 'count' branch (`Math.round(value).toLocaleString()`) as plain "28".
    const ticketsTile = page.getByTestId('kpi-tile-tickets');
    await expect(ticketsTile).toBeVisible();
    await expect(ticketsTile.getByText('28', { exact: true })).toBeVisible();

    await page.goto('/executive');
    await expect(page.getByText(venueName)).toBeVisible();
    // One real P&L figure, exact: `pnl.ts`'s `net = revenue - laborCostTotal - platformFees`, all
    // three exact sums over the same two seeded days (revenue 21000*2=42000, laborCostTotal
    // 11480*2=22960, platformFees 525*2=1050 -> net 17990 cents = $179.90). Scoped to this venue's
    // OWN table row (not a bare page-wide text search) so it can't accidentally match a different
    // dollar figure elsewhere on the page (Portfolio revenue $420.00, Margin $190.40).
    const venueRow = page.getByRole('row', { name: new RegExp(venueName) });
    await expect(venueRow.getByText('$179.90', { exact: true })).toBeVisible();
  });
});
