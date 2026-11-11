import { test, expect } from '@playwright/test';
import { seedTicket } from './fixtures/seed';

/**
 * Guest ticket page e2e (Plan 3 Task 6). Runs against goldstar-platform's
 * Firebase emulators — see this repo's `scripts/e2e.mjs` (emulator
 * start + baseline seed + `next dev` + this suite) and `e2e/fixtures/
 * seed.ts` (per-test ticket fixture, and why it doesn't cross-repo-import
 * `ticketWrittenHandler`).
 *
 * The full paid-checkout flow (tip selection through a confirmed Stripe
 * charge) is NOT in this file — see `guest-ticket-payment.spec.ts`. It
 * requires `stripe listen --forward-to
 * localhost:5001/demo-goldstar/us-central1/stripeWebhook` and a real
 * Stripe test secret key: `getGateway()` (functions/src/modules/payments/
 * registry.ts) always constructs a live `StripeGateway` via the real
 * Stripe Node SDK — there is no local/mock payments provider — so
 * `guestCreateCheckout`/`guestStaticCheckout` make real network calls to
 * api.stripe.com even under the Functions emulator. Confirmed by reading
 * `registry.ts`/`stripeClient.ts`, not assumed.
 */

test.describe('guest ticket page', () => {
  test('guest requests car and sees the bringing-around state', async ({ page }) => {
    const { token } = await seedTicket({ status: 'checked_in' });

    await page.goto(`/t/${token}`);
    await expect(page.getByText('Blue Honda Civic')).toBeVisible();

    await page.getByRole('button', { name: 'Request my car' }).click();
    await expect(page.getByText(/bringing your car/i)).toBeVisible();
  });

  test('expired/unknown token shows the closed view', async ({ page }) => {
    await page.goto('/t/ZzZzZzZzZzZzZzZzZzZzZz');
    await expect(page.getByText(/link has expired/i)).toBeVisible();
  });
});
