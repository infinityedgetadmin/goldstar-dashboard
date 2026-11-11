import { test, expect } from '@playwright/test';
import { seedTicket } from './fixtures/seed';

/**
 * Guest ticket paid-checkout e2e (Plan 3 Task 6, task-6-brief Step 1).
 * GATED — skipped unless `STRIPE_WEBHOOK_FORWARDING=1` is set.
 *
 * Why gated: `guestCreateCheckout` (functions/src/modules/payments/
 * checkout.ts) is bound with `secrets: ['STRIPE_SECRET_KEY']` and calls
 * `getGateway()` (functions/src/modules/payments/registry.ts), which
 * ALWAYS constructs a live `StripeGateway` via `stripeClient()`
 * (functions/src/modules/payments/stripeClient.ts) — the real `stripe`
 * Node SDK hitting api.stripe.com. There is no local/mock/"none" payments
 * provider in `registry.ts`'s switch. So even under the Functions
 * emulator, "Continue to payment" needs a REAL Stripe test secret key
 * bound as the `STRIPE_SECRET_KEY` emulator secret, and confirming the
 * "Paid — thank you" state needs the webhook-driven projection flip,
 * which only happens if a real `stripe listen --forward-to
 * localhost:5001/demo-goldstar/us-central1/stripeWebhook` (or the
 * project id these emulators use) is forwarding real Stripe test-mode
 * events to the local `stripeWebhook` HTTP function. Neither is present
 * in a plain local/CI run without that secret provisioned — this spec
 * intentionally does not attempt to fake or bypass either.
 *
 * CI wiring (per task-6-brief.md's own note): "CI: job runs emulators +
 * `stripe listen` (Stripe CLI with test key secret) + `next dev` with
 * `NEXT_PUBLIC_USE_EMULATORS=1`." — that job should set
 * `STRIPE_WEBHOOK_FORWARDING=1` once `stripe listen` is actually running
 * and the `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` emulator secrets are
 * bound, at which point this spec un-skips itself.
 */
test.skip(
  process.env.STRIPE_WEBHOOK_FORWARDING !== '1',
  'Requires a real Stripe test key bound to the Functions emulator + `stripe listen` forwarding to stripeWebhook. Set STRIPE_WEBHOOK_FORWARDING=1 once both are running.'
);

test('guest requests car, pays with test card, sees paid state', async ({ page }) => {
  const { token } = await seedTicket({ status: 'checked_in' });

  await page.goto(`/t/${token}`);
  await expect(page.getByText('Blue Honda Civic')).toBeVisible();

  await page.getByRole('button', { name: 'Request my car' }).click();
  await expect(page.getByText(/bringing your car/i)).toBeVisible();

  await page.getByRole('button', { name: 'Pay & tip' }).click();
  await page.getByRole('button', { name: 'Tip 20%' }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
  await frame.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
  await frame.getByPlaceholder('MM / YY').fill('12/34');
  await frame.getByPlaceholder('CVC').fill('123');
  await frame.getByPlaceholder('ZIP').fill('46204');

  await page.getByRole('button', { name: /^Pay \$/ }).click();
  // Requires `stripe listen --forward-to localhost:5001/demo-goldstar/us-central1/stripeWebhook`
  // forwarding to the Functions emulator so the webhook-driven projection flips to paid.
  await expect(page.getByText('Paid — thank you')).toBeVisible({ timeout: 20_000 });
});
