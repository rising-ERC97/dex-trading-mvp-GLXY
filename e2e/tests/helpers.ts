import { expect, type BrowserContext, type Page } from '@playwright/test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hexToString, isHex } from 'viem';

/** Click a bottom-panel tab (Positions / Open Orders / Trade History / Balances). */
export async function openTab(page: Page, name: string): Promise<void> {
  await page.locator('.tabs button', { hasText: name }).first().click();
}

const mockInstalled = new WeakSet<BrowserContext>();
const mockAddress = new WeakMap<BrowserContext, string>();

function installEthereum(addr: string): void {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const ethereum = {
    isMetaMask: true,
    selectedAddress: addr,
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return [addr];
      }
      if (method === 'personal_sign') {
        const data = (params?.[0] ?? '') as string;
        return (window as unknown as { __dexE2eSign: (d: string) => Promise<string> }).__dexE2eSign(
          data,
        );
      }
      if (method === 'eth_chainId') return '0x1';
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_requestPermissions') {
        return null;
      }
      throw new Error(`Mock wallet: unsupported method ${method}`);
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
    },
  };
  Object.defineProperty(window, 'ethereum', {
    value: ethereum,
    configurable: true,
    writable: true,
  });
}

/**
 * Install an EIP-1193 mock (MetaMask-shaped) so Connect Wallet uses real
 * signature auth without a browser extension. Safe to call after navigation.
 */
export async function installMockWallet(page: Page): Promise<void> {
  const ctx = page.context();

  if (!mockInstalled.has(ctx)) {
    mockInstalled.add(ctx);
    const account = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    mockAddress.set(ctx, address);

    await ctx.exposeFunction('__dexE2eSign', async (data: string) => {
      const message = isHex(data) ? hexToString(data) : data;
      return account.signMessage({ message });
    });
    await ctx.addInitScript(installEthereum, address);
  }

  const address = mockAddress.get(ctx);
  if (address === undefined) throw new Error('mock wallet address missing');

  const has = await page.evaluate(() => typeof window.ethereum !== 'undefined');
  if (!has) {
    await page.evaluate(installEthereum, address);
  }
}

/** Connect via injected mock (or real) wallet and complete signature login. */
export async function connectWallet(page: Page): Promise<void> {
  await installMockWallet(page);
  await page.getByRole('button', { name: 'Connect Wallet' }).click();
  await expect(page.locator('.mkt-wallet-addr, .wallet-btn')).toContainText(/^0x/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
}

/** Open the trading terminal (post-landing routes). */
export async function openTerminal(page: Page): Promise<void> {
  await page.goto('/trade');
  await expect(page.getByTestId('market-button')).toBeVisible({ timeout: 60_000 });
}

/** Claim the demo USDC collateral and wait until it shows in the balances table. */
export async function claimFaucet(page: Page): Promise<void> {
  await openTab(page, 'Balances');
  await page.getByRole('button', { name: 'Get USDC' }).click();
  await expect(page.locator('.data-table')).toContainText('USDC');
  await expect(page.locator('.data-table')).toContainText('100,000');
}

export async function expectToast(page: Page, text: string): Promise<void> {
  await expect(page.locator('.toast, [class*=toast]').first()).toContainText(text);
}

/** Exact current best bid/ask (1e8-scaled ints as strings) straight from the API. */
export async function bestPrices(
  page: Page,
  marketId: string,
): Promise<{ bid: bigint; ask: bigint }> {
  const res = await page.request.get(`/api/markets/${marketId}/orderbook?depth=1`);
  const body = (await res.json()) as {
    bids: { price: string }[];
    asks: { price: string }[];
  };
  const toUnits = (s: string): bigint => {
    const [i = '0', f = ''] = s.split('.');
    return BigInt(i) * 10n ** 8n + BigInt(f.padEnd(8, '0').slice(0, 8));
  };
  if (!body.bids[0] || !body.asks[0]) throw new Error('book empty');
  return { bid: toUnits(body.bids[0].price), ask: toUnits(body.asks[0].price) };
}
