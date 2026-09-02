/**
 * Two REAL users in two isolated browsers trade with each other:
 * A rests a bid inside the live spread, B's market sell crosses it.
 * Wallets, signatures, balances, matching — all real, end to end.
 */
import { expect, test } from '@playwright/test';
import { claimFaucet, connectWallet, expectToast, openTab, bestPrices } from './helpers.js';

const TICK = 1n * 10n ** 8n; // BTC-USDC tick ($1 at tens-of-thousands, 5 sig figs)
const SCALE = 10n ** 8n;

test('user↔user: A limit buy fills against B market sell', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await a.goto('/trade');
    await b.goto('/trade');
    await connectWallet(a);
    await claimFaucet(a);
    await connectWallet(b);
    await claimFaucet(b);

    // ---- A: limit bid a third of the way into the live spread — far enough
    // above the real best bid that it stays best while B acts, far enough
    // below the real ask that it rests ----
    const { bid, ask } = await bestPrices(a, 'BTC-USDC');
    expect(ask - bid >= 2n * TICK).toBe(true); // room for A to sit strictly best
    const insideUnits = bid + TICK; // one tick above the venue best bid
    expect(insideUnits < ask).toBe(true);
    const insidePrice = insideUnits / SCALE; // integer USDC ($1 tick)
    const formA = a.getByTestId('order-form');
    await formA.getByPlaceholder('Price').fill(insidePrice.toString());
    await formA.getByPlaceholder('Quantity').fill('0.001');
    await formA.getByRole('button', { name: /Buy BTC/ }).click();
    await expectToast(a, 'Order submitted');
    await openTab(a, 'Open Orders');
    await expect(a.locator('.data-table tbody tr')).toHaveCount(1);

    // ---- B: buys inventory from the book, then market-sells into A's bid ----
    const formB = b.getByTestId('order-form');
    await formB.getByRole('button', { name: 'Market' }).click();
    await formB.getByPlaceholder('Quantity').fill('0.001');
    await formB.getByRole('button', { name: /Buy BTC/ }).click();
    await expectToast(b, 'Order submitted');

    await formB.getByRole('button', { name: 'Sell' }).first().click();
    await formB.getByPlaceholder('Quantity').fill('0.001');
    await formB.getByRole('button', { name: /Sell BTC/ }).click();
    await expectToast(b, 'Order submitted');

    // ---- both sides see the fill ----
    await openTab(a, 'Trade History');
    const aFill = a.locator('.data-table tbody tr').first();
    await expect(aFill).toContainText('Buy', { timeout: 15_000 });
    await expect(aFill).toContainText('0.001');
    // A bought at A's own resting price (maker fill at the inside price)
    await expect(aFill).toContainText(Number(insidePrice).toLocaleString('en-US'));

    await openTab(b, 'Trade History');
    await expect(b.locator('.data-table tbody tr').first()).toContainText('Sell');

    // A holds the coin now
    await openTab(a, 'Balances');
    await expect(a.locator('.data-table')).toContainText('BTC');
    await expect(a.locator('.data-table')).toContainText('0.001');
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
