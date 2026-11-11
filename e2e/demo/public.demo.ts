import { expect, test } from '@playwright/test';
import { guestTicket, guestTokenInState, startPersona } from './demo-helpers';

/**
 * Guest web walkthrough on a phone viewport: the no-login /t/<token> page across ticket states,
 * the static venue checkout, and the payout-onboarding return page. Nothing is requested or paid.
 *
 * Tokens come from the owner-demo seed (goldstar-platform scripts/demo): DemoToken + the seed's
 * ticket number, chosen to cover each state as seeded — 158 is the guest app's live ticket (seeded
 * checked_in), then requested, ready, delivered, closed, two drive-home jobs and a passenger ride.
 * The mobile recordings move some of these along at the same time, so each page asserts the vehicle
 * and venue its projection holds right now, and each screenshot is named after that live state.
 */
const TOKENS = [
  'DemoToken0000000000158',
  'DemoToken0000000000105',
  'DemoToken0000000000111',
  'DemoToken0000000000113',
  'DemoToken0000000000116',
  'DemoToken0000000000138',
  'DemoToken0000000000142',
  'DemoToken0000000000151',
] as const;

/** Text only a closed ticket's page shows in place of the vehicle card. */
const CLOSED_READY = ['All set'] as const;

test('guest web: ticket page states, venue checkout, payout return', async ({ browser }) => {
  const s = await startPersona(browser, 'public');
  const { page } = s;

  // 158 rarely stays parked while the guest-app recording runs, so lead with a car that is
  // parked right now: the checked_in page (Request my car / Pay & tip) is the guest's first view.
  const parked = await guestTokenInState('valet', 'checked_in');
  for (const token of [parked, ...TOKENS.filter((t) => t !== parked)]) {
    const t = await guestTicket(token);
    const ready = t.status === 'closed' ? [...CLOSED_READY, `Thanks for visiting ${t.venueName}.`] : [t.vehicle, t.venueName];
    await s.visit(`/t/${token}`, ready);
    await s.shot(`ticket-${t.jobType.replace(/_/g, '-')}-${t.status.replace(/_/g, '-')}`);
  }

  await s.visit('/pay/DemoToken0000000009001', ['Pay for valet at Fountain Square Event Hall', 'Continue to payment']);
  const tip25 = page.getByRole('button', { name: 'Tip 25%' });
  await tip25.click();
  await expect(tip25).toHaveAttribute('aria-pressed', 'true');
  await s.shot('pay-venue-checkout');

  await s.visit('/payouts/return?done=1', 'Thanks — you can head back to the app');
  await s.shot('payouts-return');

  await s.finish();
});
