import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { errorMessage } from '../lib/api.js';
import { useAuthStore } from '../lib/auth.js';
import { truncateAddress } from '../lib/format.js';
import { getWs } from '../lib/ws.js';
import { toast } from '../stores/toast.js';

/** Persistent platform chrome shared by marketing pages and the trading desk. */
export function PlatformNav() {
  const address = useAuthStore((s) => s.address);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const [connecting, setConnecting] = useState(false);

  const onConnect = async (): Promise<void> => {
    setConnecting(true);
    try {
      const token = await login();
      getWs().auth(token);
      toast.success('Wallet connected');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  const onDisconnect = (): void => {
    logout();
    getWs().auth(null);
    toast.success('Wallet disconnected');
  };

  return (
    <header className="mkt-nav shell-nav">
      <Link to="/" className="mkt-brand" data-testid="mkt-brand">
        <span className="mkt-brand-mark" aria-hidden="true" />
        DEX
      </Link>
      <nav className="mkt-links" aria-label="Primary">
        <NavLink to="/markets" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          Markets
        </NavLink>
        <NavLink to="/portfolio" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          Portfolio
        </NavLink>
        <NavLink to="/docs" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          Support
        </NavLink>
        <NavLink to="/trade" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          Trade
        </NavLink>
      </nav>
      {address !== null ? (
        <div className="mkt-wallet-group">
          <span className="mkt-wallet-addr" title={address}>
            {truncateAddress(address)}
          </span>
          <button type="button" className="mkt-wallet mkt-wallet-disconnect" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="mkt-wallet"
          disabled={connecting}
          title="Connect wallet"
          onClick={() => {
            void onConnect();
          }}
        >
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      )}
    </header>
  );
}
