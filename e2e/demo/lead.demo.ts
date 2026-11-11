import { expect, test } from '@playwright/test';
import { signIn, startPersona, waitForMapTiles } from './demo-helpers';

/**
 * Lead walkthrough (lead1, Marcus Reed — St. Elmo + Fountain Square): the slimmer manager shell
 * (no setup checklist, no Settings/Integrations/Branding/Audit), and the ticket search limited to
 * the lead's own venues. Read-only.
 */
test('lead: venue-scoped manager view', async ({ browser }) => {
  const s = await startPersona(browser, 'lead');
  const { page } = s;

  await signIn(page, 'lead1', /\/home$/);
  await s.expectReady('Welcome back to Goldstar Valet');
  await expect(page.getByText('Get set up')).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: /primary/i });
  await expect(nav.getByRole('link', { name: 'Live ops' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await s.shot('home');

  await s.visit('/tickets', 'Search every ticket across your venues.');
  // The venue filter only offers the lead's own venues.
  const venueFilter = page.getByLabel('Venue', { exact: true });
  await expect(venueFilter.locator('option', { hasText: 'St. Elmo' })).toHaveCount(1);
  await expect(venueFilter.locator('option', { hasText: 'The Meridian Hotel' })).toHaveCount(0);
  await page.getByLabel('Plate', { exact: true }).fill('GSV101');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('link').filter({ hasText: 'GSV101' }).first()).toBeVisible();
  await s.shot('tickets-scoped');

  const tiles = waitForMapTiles(page);
  await s.visit('/live', 'Every active ticket, right now, across your venues.');
  await tiles;
  await expect(page.getByRole('button', { name: /^Open (?!full)/ }).first()).toBeVisible();
  await s.shot('live-board');

  await s.finish();
});
