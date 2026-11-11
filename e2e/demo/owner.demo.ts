import { expect, test } from '@playwright/test';
import { claimPlate, isoDate, signIn, startPersona, waitForMapTiles } from './demo-helpers';

/**
 * Owner walkthrough (owner1, Goldstar): every operator dashboard page, plus the drill-downs an
 * owner would open in a demo (live-board drawer, a ticket with check-in photos and its custody
 * timeline, a settled claim, an incident, a venue, a staff member). Read-only throughout.
 */
test('owner: every operator dashboard page', async ({ browser }) => {
  const s = await startPersona(browser, 'owner');
  const { page } = s;

  await signIn(page, 'owner1', /\/home$/);
  await s.expectReady(['Welcome back to Goldstar Valet', 'Get set up']);
  await s.shot('home');

  const tiles = waitForMapTiles(page);
  await s.visit('/live', 'Every active ticket, right now, across your venues.');
  await tiles;
  const openTicket = page.getByRole('button', { name: /^Open (?!full)/ }).first();
  await expect(openTicket).toBeVisible();
  await s.shot('live-board');
  await openTicket.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('button', { name: 'Open full ticket' })).toBeVisible();
  await s.shot('live-board-drawer');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await s.visit('/dispatch', ['Requested / Quoted', 'Drive home']);
  await s.shot('dispatch');

  await s.visit('/fleet', ['GSC201', 'White Toyota Corolla']);
  await s.shot('fleet');

  await s.visit('/tickets', 'Search every ticket across your venues.');
  await page.getByLabel('Plate', { exact: true }).fill('GSV101');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  // The St. Elmo GSV101 ticket that still has its car (the closed one is an earlier visit).
  const ticketRow = page.getByRole('link').filter({ hasText: 'St. Elmo' }).filter({ hasText: 'GSV101' }).filter({ hasNotText: 'Closed' }).first();
  await expect(ticketRow).toBeVisible();
  await s.shot('tickets-search');
  await ticketRow.click();
  await s.expectReady([/GSV101/, 'Custody timeline', 'Check-in · wide', 'Damage diagrams']);
  await expect
    .poll(() => page.locator('main img').evaluateAll((imgs) => imgs.length > 0 && imgs.every((i) => i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0)))
    .toBe(true);
  await s.shot('ticket-detail-photos');

  // The settled claim (insurer, settlement and full timeline filled in) is the richest one to show.
  const settledPlate = await claimPlate('goldstar', 'settled');
  await s.visit('/claims', ['Damage claims', 'Hartford Garagekeepers', settledPlate]);
  await s.shot('claims');
  await page.getByRole('link').filter({ hasText: settledPlate }).filter({ hasText: 'Settled' }).first().click();
  await s.expectReady([`Claim · ${settledPlate}`, 'Windshield chip from gravel in Lot A; reimbursed repair.', 'HGK-2026-11873']);
  await s.shot('claim-detail');

  await s.visit('/incidents', ['Near miss', 'Property']);
  await s.shot('incidents');
  await page.getByRole('link').filter({ hasText: 'Near miss' }).first().click();
  await s.expectReady(['Incident · Near miss', /Pedestrian stepped out between staged cars/]);
  await s.shot('incident-detail');

  await s.visit('/payments', 'Search transactions, review payouts, and track your Stripe Connect status.');
  await page.getByLabel('From', { exact: true }).fill(isoDate(7));
  await page.getByLabel('To', { exact: true }).fill(isoDate(0));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Succeeded' }).first()).toBeVisible();
  await s.shot('payments');

  await s.visit('/reports', ['RETRIEVAL TIME (P50)', 'VEHICLES / ATTENDANT-HOUR']);
  await page.getByRole('button', { name: 'Last 30 days' }).click();
  await s.expectReady('DIGITAL TIP RATE');
  await s.shot('reports');

  await s.visit('/reports/forecast', ['Staffing forecast', 'Suggested attendants']);
  await s.shot('reports-forecast');

  await s.visit('/executive', ['PORTFOLIO REVENUE', 'Venue P&L', 'The Meridian Hotel']);
  await s.shot('executive');

  await s.visit('/venues', ['Fountain Square Event Hall', 'St. Elmo']);
  await s.shot('venues');
  await page.getByRole('link', { name: 'The Meridian Hotel' }).click();
  await s.expectReady([/^Zones$/, /^Rates$/]);
  await expect(page.getByRole('heading', { level: 1, name: 'The Meridian Hotel' })).toBeVisible();
  await s.shot('venue-detail');

  await s.visit('/staff', ['Dana Whitfield', 'admin1@goldstar.example.com']);
  await s.shot('staff');
  await page.getByRole('link', { name: 'Tyler Brooks' }).click();
  await s.expectReady(['att1@goldstar.example.com', 'Roles & venues']);
  await s.shot('staff-detail');

  await s.visit('/shifts', 'Calendar, assignments, clock audit, and tip pools per venue.');
  await page.locator('main select').first().selectOption({ label: 'St. Elmo' });
  await s.expectReady(/Marcus Reed, Tyler Brooks, Aaliyah Grant/);
  await s.shot('shifts');

  await s.visit('/integrations', ['Twilio SMS', 'Built-in scheduling']);
  await s.shot('integrations');
  await page.getByRole('button', { name: 'Configure' }).first().click();
  const configure = page.getByRole('dialog');
  await expect(configure.getByText('Provider documentation')).toBeVisible();
  await s.shot('integrations-configure');
  await page.keyboard.press('Escape');
  await expect(configure).toBeHidden();

  await s.visit('/branding', ['Colors, logos, and how guests see your brand.', 'Live preview']);
  await s.shot('branding');

  await s.visit('/audit', 'Who changed what, and when.');
  await page.getByLabel('From', { exact: true }).fill(isoDate(7));
  await page.getByLabel('To', { exact: true }).fill(isoDate(0));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await s.expectReady(['staff.invite', 'integrations.set_secret']);
  await s.shot('audit');

  await s.visit('/settings', ['Feature toggles', 'Tip presets', 'Stripe Connect']);
  await s.shot('settings');

  await s.visit('/notifications', ['Damage claim updates', 'Credential expirations']);
  await s.shot('notifications');

  await s.finish();
});
