/**
 * Wallet auth: injected EIP-1193 provider (MetaMask, etc.) signs a server
 * nonce via EIP-191 personal_sign; we exchange the signature for a JWT.
 * Session (address + token) is restored from sessionStorage across reloads.
 */
import { create } from 'zustand';
import { apiFetch, setTokenProvider } from './api.js';
import { createInjectedWalletClient, getInjectedProvider, hasInjectedProvider, onAccountsChanged } from './wallet.js';

export const SESSION_STORAGE_KEY = 'dex.session';

export type AuthStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface AuthState {
  address: string | null;
  token: string | null;
  status: AuthStatus;
  login: () => Promise<string>;
  logout: () => void;
}

interface StoredSession {
  address: string;
  token: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.address === 'string' &&
      /^0x[0-9a-f]{40}$/.test(parsed.address) &&
      typeof parsed.token === 'string' &&
      parsed.token.length > 0
    ) {
      return { address: parsed.address, token: parsed.token };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function saveSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* private mode / quota */
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when an injected wallet is available (MetaMask, Rabby, e2e mock, …). */
export function hasWalletProvider(): boolean {
  return hasInjectedProvider();
}

/** Session exists from a prior connect in this tab. */
export function hasStoredSession(): boolean {
  return loadSession() !== null;
}

function isUserRejection(e: unknown): boolean {
  if (e === null || typeof e !== 'object') return false;
  const err = e as { code?: number; name?: string; message?: string; shortMessage?: string };
  if (err.code === 4001) return true;
  const text = `${err.name ?? ''} ${err.message ?? ''} ${err.shortMessage ?? ''}`;
  return /rejected|denied|cancel/i.test(text);
}

/** Dedupes concurrent login() calls (React Strict Mode remounts, double-clicks). */
let loginInFlight: Promise<string> | null = null;

const initial = (() => {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return loadSession();
  } catch {
    return null;
  }
})();

export const useAuthStore = create<AuthState>()((set) => ({
  address: initial?.address ?? null,
  token: initial?.token ?? null,
  status: initial !== null ? 'connected' : 'idle',

  async login(): Promise<string> {
    if (loginInFlight !== null) return loginInFlight;

    loginInFlight = (async () => {
      set({ status: 'connecting' });
      try {
        const wallet = createInjectedWalletClient();
        ensureAccountsListener();
        const accounts = await wallet.requestAddresses();
        const account = accounts[0];
        if (account === undefined) throw new Error('No wallet account selected');
        const address = account.toLowerCase();

        const { nonce } = await apiFetch<{ nonce: string }>('/auth/nonce', {
          method: 'POST',
          body: { address },
        });
        const signature = await wallet.signMessage({ account, message: nonce });
        const { token } = await apiFetch<{ token: string }>('/auth/verify', {
          method: 'POST',
          body: { address, signature },
        });

        saveSession({ address, token });
        set({ address, token, status: 'connected' });
        return token;
      } catch (e) {
        set({ status: 'error' });
        if (isUserRejection(e)) throw new Error('Wallet request rejected');
        throw e;
      } finally {
        loginInFlight = null;
      }
    })();

    return loginInFlight;
  },

  logout(): void {
    clearSession();
    set({ address: null, token: null, status: 'idle' });
  },
}));

// Authed fetches read the live token without creating an import cycle.
setTokenProvider(() => useAuthStore.getState().token);

// Drop session if the user switches or disconnects accounts in the extension.
let accountsListenerBound = false;

function ensureAccountsListener(): void {
  if (accountsListenerBound) return;
  if (getInjectedProvider() === null) return;
  accountsListenerBound = true;
  onAccountsChanged((accounts) => {
    const current = useAuthStore.getState().address;
    if (current === null) return;
    if (accounts.length === 0) {
      useAuthStore.getState().logout();
      return;
    }
    const next = accounts[0]!.toLowerCase();
    if (next !== current) {
      useAuthStore.getState().logout();
    }
  });
}

if (typeof window !== 'undefined') {
  ensureAccountsListener();
}

