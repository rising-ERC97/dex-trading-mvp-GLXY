/**
 * Account state should update from the WS `user` channel without waiting for
 * a multi-second REST poll window.
 */
import { expect, test } from '@playwright/test';
import { claimFaucet, connectWallet, expectToast, openTab } from './helpers.js';

test.describe.configure({ mode: 'serial' });

test('balances and fills update quickly after a market buy (WS user push)', async ({
  page,
}) => {
  await page.goto('/trade');
  await connectWallet(page);
  await claimFaucet(page);

  const form = page.getByTestId('order-form');
  await form.getByRole('button', { name: 'Market' }).click();
  await form.getByPlaceholder('Quantity').fill('0.001');
  await form.getByRole('button', { name: /Buy BTC/ }).click();
  await expectToast(page, 'Order submitted');

  // Must appear well under the old 5s poll interval
  await openTab(page, 'Balances');
  await expect(page.getByTestId('balance-BTC')).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId('balance-avail-BTC')).toContainText('0.001', {
    timeout: 3_000,
  });

  await openTab(page, 'Trade History');
  await expect(page.getByTestId('fills-table').locator('tbody tr').first()).toBeVisible({
    timeout: 3_000,
  });
});
