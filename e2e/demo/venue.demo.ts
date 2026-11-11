import { expect, test } from '@playwright/test';
import { signIn, startPersona } from './demo-helpers';

/**
 * Venue partner walkthrough (venue1, St. Elmo host stand): every venue-portal page. Read-only —
 * the request forms are shown, never submitted, and no car is requested from the live board.
 */
test('venue partner: St. Elmo portal', async ({ browser }) => {
  const s = await startPersona(browser, 'venue');
  const { page } = s;

  // A normal sign-in lands in the portal (not on the operator dashboard's "no access" page).
  await signIn(page, 'venue1', /\/venue$/);
  await s.expectReady('St. Elmo — cars on the stand right now.');
  const firstRequest = page.getByRole('button', { name: /^Request car: / }).first();
  await expect(firstRequest).toBeVisible();
  await s.shot('live-board');

  // Filter the board down to whichever parked car is listed first right now.
  const vehicle = ((await firstRequest.getAttribute('aria-label')) ?? (await firstRequest.innerText())).replace(/^Request car:\s*/, '').trim();
  expect(vehicle).not.toBe('');
  const filter = page.getByPlaceholder('Filter vehicles…');
  await filter.fill(vehicle);
  await expect(page.getByRole('cell').filter({ hasText: vehicle }).first()).toBeVisible();
  await s.shot('live-board-filtered');
  await filter.fill('');

  await s.visit('/venue/requests', ['Request a car', 'Pre-arrival', 'Request a ride']);
  await s.shot('requests');

  await s.visit('/venue/validations', ['ISSUED TODAY', 'STE500']);
  await s.shot('validations');

  await s.visit('/venue/reports', ['St. Elmo — the last 14 days.', 'Vehicles per day', 'Peak hours']);
  await s.shot('reports');

  await s.visit('/venue/invoices', ['St. Elmo — what your venue has been billed.', '$4,610.00']);
  await s.shot('invoices');

  await s.visit('/venue/staffing', ['St. Elmo — who is covering the stand.', /confirmed/]);
  await s.shot('staffing');

  await s.finish();
});
