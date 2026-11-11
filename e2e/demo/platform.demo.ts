import { expect, test } from '@playwright/test';
import { signIn, startPersona } from './demo-helpers';

/**
 * Platform console walkthrough (platform1): the operator list in all three lifecycle states, an
 * active and a suspended operator, and the first step of the onboarding wizard. Nothing is
 * assumed, suspended, reactivated or created.
 */
test('platform admin: operator console', async ({ browser }) => {
  const s = await startPersona(browser, 'platform');
  const { page } = s;

  await signIn(page, 'platform1', /\/home$/);

  await s.visit('/operators', ['Every valet operator on the platform.', 'Northside Valet', 'Circle City Parking', 'Valet Co B']);
  for (const status of ['active', 'suspended', 'onboarding']) {
    await expect(page.getByRole('cell', { name: status, exact: true }).first()).toBeVisible();
  }
  await s.shot('operators');

  await page.getByRole('link', { name: 'Goldstar', exact: true }).click();
  await s.expectReady(['Overview', 'Modules', 'Features', 'Goldstar Valet']);
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();
  await s.shot('operator-active');

  await s.visit('/operators', 'Every valet operator on the platform.');
  await page.getByRole('link', { name: 'Circle City Parking' }).click();
  await s.expectReady(['Overview', 'suspended']);
  await expect(page.getByRole('button', { name: 'Reactivate' })).toBeVisible();
  await s.shot('operator-suspended');

  await s.visit('/operators/new', ['Onboard an operator', 'Identity', 'Live preview']);
  await page.getByLabel('Company name', { exact: true }).fill('Riverside Valet');
  await expect(page.getByText('Riverside Valet').last()).toBeVisible();
  await s.shot('new-operator-step1');

  await s.finish();
});
