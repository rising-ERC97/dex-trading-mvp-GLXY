/**
 * After a network blip, the live orderbook recovers via WS reconnect / resync.
 */
import { expect, test } from '@playwright/test';

test('orderbook recovers after forced offline/online (WS reconnect)', async ({ page }) => {
  await page.goto('/trade');

  await expect(page.getByTestId('orderbook')).toBeVisible();
  await expect(page.getByTestId('bid-row-0')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ask-row-0')).toBeVisible();

  await page.context().setOffline(true);
  await page.waitForTimeout(800);
  await page.context().setOffline(false);

  await expect(page.getByTestId('bid-row-0')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ask-row-0')).toBeVisible({ timeout: 60_000 });
});
