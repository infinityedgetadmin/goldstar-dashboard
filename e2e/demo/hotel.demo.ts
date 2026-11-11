import { expect, test } from '@playwright/test';
import { signIn, startPersona } from './demo-helpers';

/**
 * Hotel partner walkthrough (hotel1, The Meridian front desk): the hotel page's overnight report
 * and a reservation lookup against the emulator's demo PMS. The lookup is read-only; "Charge room"
 * is never clicked.
 */
test('hotel partner: Meridian portal', async ({ browser }) => {
  const s = await startPersona(browser, 'hotel');
  const { page } = s;

  await signIn(page, 'hotel1', /\/venue$/);
  await s.expectReady('The Meridian Hotel — cars on the stand right now.');
  await s.shot('live-board');

  await page.getByRole('navigation', { name: /primary/i }).getByRole('link', { name: 'Hotel' }).click();
  await s.expectReady(['The Meridian Hotel — room charges and overnight cars.', 'OVERNIGHT CARS', 'LONGEST STAY']);
  await s.shot('hotel-overnight');

  await page.getByRole('button', { name: 'Find a reservation' }).click();
  const lookup = page.getByRole('dialog');
  await lookup.getByLabel('Room', { exact: true }).fill('1204');
  await lookup.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(lookup.getByText('Room 1204')).toBeVisible();
  await expect(lookup.getByRole('button', { name: 'Charge room' }).first()).toBeVisible();
  await s.shot('hotel-room-lookup');
  await lookup.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(lookup).toBeHidden();

  await s.visit('/venue/reports', ['The Meridian Hotel — the last 14 days.', 'Vehicles per day']);
  await s.shot('reports');

  await s.visit('/venue/invoices', ['The Meridian Hotel — what your venue has been billed.', '$12,840.00']);
  await s.shot('invoices');

  await s.finish();
});
