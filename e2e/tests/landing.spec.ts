/**
 * Marketing landing → terminal entry.
 */
import { expect, test } from '@playwright/test';

test('landing hero links into the trading terminal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-hero')).toBeVisible();
  await expect(page.getByTestId('mkt-brand')).toContainText('DEX');
  await page.getByTestId('cta-trade').click();
  await expect(page).toHaveURL(/\/trade/);
  await expect(page.getByTestId('market-button')).toBeVisible({ timeout: 60_000 });
});

test('markets page opens a market in the terminal', async ({ page }) => {
  await page.goto('/markets');
  await expect(page.getByTestId('markets-table')).toBeVisible({ timeout: 60_000 });
  const row = page.locator('[data-testid^="market-row-"]').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/trade\//);
  await expect(page.getByTestId('market-button')).toBeVisible({ timeout: 30_000 });
});
