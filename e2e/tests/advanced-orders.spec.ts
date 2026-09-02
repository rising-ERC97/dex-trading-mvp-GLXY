/**
 * Advanced order UI: place a far stop (trigger) buy and cancel it.
 */
import { expect, test } from '@playwright/test';
import { claimFaucet, connectWallet, expectToast, openTab } from './helpers.js';

test.describe.configure({ mode: 'serial' });

test('places a trigger order and cancels it from Open Orders', async ({ page }) => {
  await page.goto('/trade');
  await connectWallet(page);
  await claimFaucet(page);

  const form = page.getByTestId('order-form');
  await form.getByRole('button', { name: 'Market' }).click();
  await form.getByRole('button', { name: 'Buy' }).first().click();

  await form.locator('label.trigger-toggle').filter({ hasText: 'Trigger Order' }).click();
  await form.getByLabel('Trigger price').fill('500000');
  await form.getByRole('button', { name: /Above/ }).click();
  await form.getByPlaceholder('Quantity').fill('0.001');
  await form.getByRole('button', { name: /Buy BTC/ }).click();
  await expectToast(page, 'Order submitted');

  await openTab(page, 'Open Orders');
  const triggerRow = page.locator('.data-table tbody tr').filter({ hasText: 'Trigger' });
  await expect(triggerRow.first()).toBeVisible({ timeout: 15_000 });
  await triggerRow.first().getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.data-table tbody tr').filter({ hasText: 'Trigger' })).toHaveCount(0, {
    timeout: 10_000,
  });
});
