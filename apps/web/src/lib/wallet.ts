/**
 * Browser wallet (EIP-1193) helpers — MetaMask and other injected providers.
 */
import {
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from 'viem';

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function getInjectedProvider(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null;
  return window.ethereum ?? null;
}

export function hasInjectedProvider(): boolean {
  return getInjectedProvider() !== null;
}

export function createInjectedWalletClient(): WalletClient {
  const provider = getInjectedProvider();
  if (provider === null) {
    throw new Error('No Ethereum wallet found. Install MetaMask or another browser wallet.');
  }
  return createWalletClient({ transport: custom(provider) });
}

/** Prompt the wallet for accounts, then EIP-191 personal_sign the nonce. */
export async function requestWalletSignature(nonce: string): Promise<{
  address: string;
  signature: `0x${string}`;
}> {
  const wallet = createInjectedWalletClient();
  const accounts = await wallet.requestAddresses();
  const account = accounts[0] as Address | undefined;
  if (account === undefined) {
    throw new Error('No wallet account selected');
  }
  const signature = await wallet.signMessage({ account, message: nonce });
  return { address: account.toLowerCase(), signature };
}

export function onAccountsChanged(handler: (accounts: string[]) => void): () => void {
  const provider = getInjectedProvider();
  if (provider === null || typeof provider.on !== 'function') {
    return () => undefined;
  }
  const listener = (accounts: string[]): void => {
    handler(accounts);
  };
  provider.on('accountsChanged', listener);
  return () => {
    provider.removeListener?.('accountsChanged', listener);
  };
}
