import { test, expect } from '@playwright/test';
import { seedDriveHomeJobTracking, seedQuotedDriveHomeJob, transitionDriveHomeJob } from './fixtures/job-seed';

/**
 * Drive-home job guest-tracking e2e (Plan 5 Task 6). Runs against goldstar-platform's Firebase
 * emulators exactly like `guest-ticket.spec.ts` — see this repo's `scripts/e2e.mjs` and
 * `playwright.config.ts` for the emulator/webServer wiring, and `e2e/fixtures/job-seed.ts` for why
 * the fixtures write `guestTickets/{token}` projections directly rather than depending on the live
 * `onTicketWritten` trigger.
 *
 * `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` is unset under this webServer config (verified: absent from
 * both `playwright.config.ts`'s injected env and this repo's `.env.local`) — `job-tracking-view.tsx`'s
 * `driverMapUrl()` degrades to `undefined` in that case, so the driver-location assertion below
 * checks the plain lat/lng fallback text, not a map image.
 */

test.describe('drive-home job guest tracking', () => {
  test('pill opens tracking, updates live through assigned -> in_transit, and the job page shows Trip complete', async ({ page }) => {
    const job = await seedDriveHomeJobTracking();

    await page.goto(`/t/${job.parentToken}`);
    await expect(page.getByText('Black Audi Q5')).toBeVisible();

    const pill = page.getByRole('tab', { name: 'Drive home · Assigned' });
    await expect(pill).toBeVisible();
    await pill.click();

    await expect(page.getByText('Going to')).toBeVisible();
    await expect(page.getByText('18 W Market St, Indianapolis, IN')).toBeVisible();
    await expect(page.getByText('Your driver')).toBeVisible();
    await expect(page.getByText('Jordan', { exact: true })).toBeVisible();
    // No etaAt/geo yet at 'assigned' — mirrors production (neither exists until the driver starts
    // sharing location / etaRefresh computes one).
    await expect(page.getByText('Estimated arrival')).toHaveCount(0);

    await transitionDriveHomeJob(job, 'in_transit', { withLiveLocation: true });

    // Live update, no reload: the same onSnapshot listener backing JobTrackingView picks up the
    // projection rewrite above.
    await expect(page.getByText('Estimated arrival')).toBeVisible();
    await expect(page.getByText('39.7714, -86.1621')).toBeVisible();

    await transitionDriveHomeJob(job, 'completed');

    // "Trip complete." (`ticket-view.tsx`'s jobBanner()) only renders when the TOP-LEVEL ticket
    // itself is the job (jobType !== 'valet') — the real link a driveHomeAssigned SMS sends the
    // guest is the job's OWN token page, not the parent's.
    await page.goto(`/t/${job.jobToken}`);
    await expect(page.getByText('Trip complete.')).toBeVisible();
    await expect(page.getByText('Thanks for riding with us.')).toBeVisible();
  });

  test('resume-at-quoted pill shows the quote + Confirm screen without confirming (Stripe-dependent)', async ({ page }) => {
    const job = await seedQuotedDriveHomeJob();

    await page.goto(`/t/${job.parentToken}`);
    const pill = page.getByRole('tab', { name: 'Drive home · Quoted' });
    await expect(pill).toBeVisible();
    await pill.click();

    // selectLinkedJob's 'quoted' special case routes to the #drive-home hash, opening
    // DriveHomeSheet with resumeToken set rather than the inline JobTrackingView switcher panel.
    await expect(page.getByText('Drive home status')).toBeVisible();
    await expect(page.getByText('To', { exact: true })).toBeVisible();
    await expect(page.getByText('18 W Market St, Indianapolis, IN')).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();
    await expect(page.getByText('$49.00')).toBeVisible();
    await expect(page.getByText(/Expires in \d+:\d{2}/)).toBeVisible();

    const confirmButton = page.getByRole('button', { name: 'Confirm and authorize' });
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toBeDisabled(); // terms checkbox not ticked

    // Deliberately never clicked — guestConfirmDriveHome's runCheckout hits the real Stripe SDK
    // (verified in guest-ticket-payment.spec.ts's own header comment), which this suite doesn't
    // provision a `stripe listen` forward for.
  });
});
