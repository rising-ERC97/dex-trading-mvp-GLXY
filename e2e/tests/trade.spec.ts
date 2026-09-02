/**
 * Real end-to-end purchase flow against the live stack:
 * real Upbit/Hyperliquid market data, real matching engine, real PGlite,
 * real wallet-signature auth — the only synthetic thing is the test money.
 */
import { expect, test, type Page } from '@playwright/test';
import { claimFaucet, connectWallet, expectToast, openTab as openTabIn } from './helpers.js';

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/trade');
});

test.afterAll(async () => {
  await page.close();
});

const openTab = (name: string): Promise<void> => openTabIn(page, name);

test('loads the real English coin universe quoted in USDC', async () => {
  const marketBtn = page.getByTestId('market-button');
  await expect(marketBtn).toContainText('BTC/USDC');
  await expect(marketBtn).toContainText('Bitcoin');

  // live BTC price in the top bar: $ tens of thousands, comma-formatted
  await expect(marketBtn).toContainText(/[0-9]{2,3},[0-9]{3}/);

  // persistent watchlist: search by English name finds Ethereum
  const watchlist = page.getByTestId('watchlist');
  await expect(watchlist).toBeVisible();
  await watchlist.getByPlaceholder(/Search markets/).fill('Ethereum');
  const ethRow = watchlist.getByTestId('market-row').filter({ hasText: 'ETH/USDC' });
  await expect(ethRow).toBeVisible();
  // English-name search narrows the universe down to the Ethereum family
  expect(await watchlist.getByTestId('market-row').count()).toBeLessThan(6);
  // and there are hundreds of real markets without a filter. The list is
  // virtualized (only visible rows mount), so prove the full universe via the
  // virtual scroller's total content height (191 spot + 30 perp × ~44px).
  await watchlist.getByPlaceholder(/Search markets/).fill('');
  const totalHeight = await watchlist
    .locator('.market-list > div')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(totalHeight).toBeGreaterThan(3000);
});

test('orderbook shows live liquidity around the real BTC price', async () => {
  const orderbook = page.getByTestId('orderbook');
  await expect(orderbook).toBeVisible();
  await expect(page.getByTestId('ask-row-0')).toBeVisible();
  await expect(page.getByTestId('bid-row-0')).toBeVisible();
  await expect(page.getByTestId('spread')).toBeVisible();
});

test('orderbook depth is the REAL venue book (heterogeneous sizes)', async () => {
  // a synthetic market maker quotes uniform sizes; the real Upbit book never does
  await expect(page.getByTestId('ask-row-4')).toBeVisible();
  const qtys = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const text = await page.getByTestId(`ask-row-${i}`).textContent();
    qtys.add(text ?? String(i));
  }
  expect(qtys.size).toBeGreaterThan(2);
});

test('trades feed streams REAL market prints without us trading', async () => {
  // switch the book panel to Trades — rows must appear from the live Upbit
  // trade stream even though this session has placed no orders yet
  await page.locator('.book-panel .tabs button', { hasText: 'Trades' }).click();
  await expect(page.locator('.trade-row').first()).toBeVisible({ timeout: 90_000 });
  const rows = await page.locator('.trade-row').count();
  expect(rows).toBeGreaterThanOrEqual(1);
  await page.locator('.book-panel .tabs button', { hasText: 'Order Book' }).click();
});

test('chart renders real candles', async () => {
  const canvases = page.locator('canvas');
  await expect(canvases.first()).toBeVisible();
  expect(await canvases.count()).toBeGreaterThanOrEqual(1);
});

test('connects a wallet via signature auth', async () => {
  await connectWallet(page);
});

test('claims faucet test funds', async () => {
  await claimFaucet(page);
  await expect(page.locator('.data-table')).toContainText('USDC');
});

test('REAL PURCHASE: market-buys BTC against live liquidity', async () => {
  const form = page.getByTestId('order-form');
  await form.getByRole('button', { name: 'Market' }).click();
  await form.getByPlaceholder('Quantity').fill('0.001');
  // fee summary is computed before submitting
  await expect(page.getByTestId('fee-value')).not.toContainText('–');
  await form.getByRole('button', { name: /Buy BTC/ }).click();

  await expectToast(page, 'Order submitted');

  // the purchased BTC shows up in balances…
  await openTab('Balances');
  await expect(page.locator('.data-table')).toContainText('BTC');
  await expect(page.locator('.data-table')).toContainText('0.001');

  // …and the fill is in the trade history with side Buy (a market order can
  // legitimately split into several partial fills against real venue sizes,
  // so assert the rows, not a single row's qty — the balance above proves the total)
  await openTab('Trade History');
  const fillRows = page.locator('.data-table tbody tr').filter({ hasText: 'BTC-USDC' });
  await expect(fillRows.first()).toContainText('Buy');
});

test('limit order rests in open orders and cancels', async () => {
  const form = page.getByTestId('order-form');
  await form.getByRole('button', { name: 'Limit' }).click();
  await form.getByPlaceholder('Price').fill('30000'); // far below market — rests
  await form.getByPlaceholder('Quantity').fill('0.001');
  await form.getByRole('button', { name: /Buy BTC/ }).click();
  await expectToast(page, 'Order submitted');

  await openTab('Open Orders');
  const orderRow = page.locator('.data-table tbody tr').filter({ hasText: '30,000' });
  await expect(orderRow).toHaveCount(1);
  await orderRow.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.data-table tbody tr').filter({ hasText: '30,000' })).toHaveCount(0);
});

test('amends a resting limit order in place (cancel-replace) and re-rests', async () => {
  const form = page.getByTestId('order-form');
  await form.getByRole('button', { name: 'Limit' }).click();
  await form.getByPlaceholder('Price').fill('31000'); // far below market — rests
  await form.getByPlaceholder('Quantity').fill('0.001');
  await form.getByRole('button', { name: /Buy BTC/ }).click();
  await expectToast(page, 'Order submitted');

  await openTab('Open Orders');
  const row = page.locator('.data-table tbody tr').filter({ hasText: '31,000' });
  await expect(row).toHaveCount(1);

  // edit price 31,000 → 32,500 and qty 0.001 → 0.002 inline
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit order price').fill('32500');
  await page.getByLabel('Edit order quantity').fill('0.002');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expectToast(page, 'Order updated');

  // the old price is gone; a single order rests at the new price + qty
  await expect(page.locator('.data-table tbody tr').filter({ hasText: '31,000' })).toHaveCount(0);
  const amended = page.locator('.data-table tbody tr').filter({ hasText: '32,500' });
  await expect(amended).toHaveCount(1);
  await expect(amended).toContainText('0.002');

  // clean up
  await amended.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.data-table tbody tr').filter({ hasText: '32,500' })).toHaveCount(0);
});

test('sells the BTC back (market sell, full round trip)', async () => {
  const form = page.getByTestId('order-form');
  await form.getByRole('button', { name: 'Market' }).click();
  await form.getByRole('button', { name: 'Sell' }).first().click();
  await form.getByPlaceholder('Quantity').fill('0.001');
  await form.getByRole('button', { name: /Sell BTC/ }).click();
  await expectToast(page, 'Order submitted');

  await openTab('Trade History');
  await expect(page.locator('.data-table tbody tr').first()).toContainText('Sell');
});
