import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toUnits } from '@dex/shared';
import { api, errorMessage, parsePosition } from '../lib/api.js';
import { formatAmount, truncateAddress } from '../lib/format.js';
import { hasWalletProvider, useAuthStore } from '../lib/auth.js';
import { getWs } from '../lib/ws.js';
import { toast } from '../stores/toast.js';

export default function PortfolioPage() {
  const address = useAuthStore((s) => s.address);
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const [connecting, setConnecting] = useState(false);

  const accountQuery = useQuery({
    queryKey: ['account'],
    queryFn: () => api.account(),
    enabled: token !== null,
    refetchInterval: token !== null ? 8_000 : false,
  });

  const onWallet = async (): Promise<void> => {
    setConnecting(true);
    try {
      const t = await login();
      getWs().auth(t);
      toast.success('Wallet connected');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  const acc = accountQuery.data;
  const positions = useMemo(
    () => (acc?.positions ?? []).map(parsePosition).filter((p) => p.size !== 0n),
    [acc],
  );
  const equity = acc !== undefined ? toUnits(acc.perpEquity ?? '0') : 0n;
  const margin = acc !== undefined ? toUnits(acc.marginUsed ?? '0') : 0n;
  const available = useMemo(() => {
    const usdc = (acc?.balances ?? []).find((b) => b.asset === 'USDC');
    return usdc !== undefined ? toUnits(usdc.available) : 0n;
  }, [acc]);
  const locked = useMemo(() => {
    return (acc?.balances ?? []).reduce((sum, b) => sum + toUnits(b.locked), 0n);
  }, [acc]);
  const marginPct =
    equity > 0n ? Number((margin * 10_000n) / equity) / 100 : 0;
  const freePct = Math.max(0, 100 - marginPct);

  if (token === null) {
    return (
      <div className="mkt-page pf">
        <section className="pf-gate">
          <div className="pf-gate-copy">
            <p className="mkt-kicker">Portfolio</p>
            <h1>Your desk overview</h1>
            <p>
              Equity, margin utilization, balances, and open risk in one view — connect a wallet to sync
              live account state.
            </p>
            <div className="mkt-cta">
              <button
                type="button"
                className="mkt-btn primary"
                disabled={connecting}
                onClick={() => {
                  void onWallet();
                }}
              >
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
              <Link to="/trade" className="mkt-btn ghost">
                Open terminal
              </Link>
            </div>
            {!hasWalletProvider() && (
              <p className="pf-gate-hint dim">Install MetaMask or another browser wallet to continue.</p>
            )}
          </div>
          <div className="pf-gate-art" aria-hidden="true">
            <img src="/brand/equity-curve.svg" alt="" />
            <div className="pf-gate-cards">
              <div>
                <span className="dim">Equity</span>
                <strong>—</strong>
              </div>
              <div>
                <span className="dim">Margin</span>
                <strong>—</strong>
              </div>
              <div>
                <span className="dim">Buying power</span>
                <strong>—</strong>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mkt-page pf">
      <header className="pf-hero">
        <div className="pf-hero-copy">
          <p className="mkt-kicker">Portfolio</p>
          <h1>Account overview</h1>
          <p className="pf-account">
            <span className="mkt-live-dot" />
            <code>{address !== null ? truncateAddress(address) : '—'}</code>
            <span className="dim">Synced over secure session</span>
          </p>
        </div>
        <div className="pf-hero-actions">
          <Link to="/trade" className="mkt-btn primary">
            Trade
          </Link>
          <Link to="/markets" className="mkt-btn ghost sm">
            Markets
          </Link>
        </div>
      </header>

      <div className="pf-layout">
        <section className="pf-main">
          <div className="pf-equity-panel" data-testid="portfolio-summary">
            <div className="pf-equity-top">
              <div>
                <span className="dim">Perp equity</span>
                <strong className="pf-equity-val">{formatAmount(equity)}</strong>
                <span className="pf-equity-unit">USDC</span>
              </div>
              <div className="pf-ring" style={{ ['--pf-pct' as string]: `${freePct}%` }} aria-hidden="true">
                <span>{Math.round(freePct)}%</span>
                <em>Free</em>
              </div>
            </div>
            <img className="pf-equity-chart" src="/brand/equity-curve.svg" alt="" />
            <div className="pf-metric-row">
              <div>
                <span className="dim">Margin used</span>
                <strong>{formatAmount(margin)}</strong>
              </div>
              <div>
                <span className="dim">Available USDC</span>
                <strong className="pos">{formatAmount(available)}</strong>
              </div>
              <div>
                <span className="dim">Locked</span>
                <strong>{formatAmount(locked)}</strong>
              </div>
              <div>
                <span className="dim">Open positions</span>
                <strong>{positions.length}</strong>
              </div>
            </div>
          </div>

          <div className="pf-panel">
            <div className="pf-panel-head">
              <h2>Open positions</h2>
              <Link to="/trade" className="mkt-text-link">
                Manage in terminal →
              </Link>
            </div>
            <div className="mkt-table-wrap">
              <table className="mkt-table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Entry</th>
                    <th>Mark</th>
                    <th>uPnL</th>
                    <th>Lev</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const long = p.size > 0n;
                    const pnl = p.unrealizedPnl;
                    return (
                      <tr key={p.marketId}>
                        <td>
                          <Link to={`/trade/${p.marketId}`}>
                            <strong>{p.marketId}</strong>
                          </Link>
                        </td>
                        <td className={long ? 'pos' : 'neg'}>{long ? 'Long' : 'Short'}</td>
                        <td>{formatAmount(p.size < 0n ? -p.size : p.size)}</td>
                        <td>{formatAmount(p.entryPrice)}</td>
                        <td>{p.markPrice !== null ? formatAmount(p.markPrice) : '—'}</td>
                        <td className={pnl !== null && pnl >= 0n ? 'pos' : 'neg'}>
                          {pnl !== null ? formatAmount(pnl) : '—'}
                        </td>
                        <td>{p.leverage}x</td>
                      </tr>
                    );
                  })}
                  {positions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="dim">
                        No open positions — open a market from the terminal to build exposure.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pf-panel">
            <div className="pf-panel-head">
              <h2>Balances</h2>
              <span className="dim">Spot &amp; collateral</span>
            </div>
            <div className="mkt-table-wrap">
              <table className="mkt-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Available</th>
                    <th>In orders</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(acc?.balances ?? []).map((b) => {
                    const avail = toUnits(b.available);
                    const lock = toUnits(b.locked);
                    return (
                      <tr key={b.asset}>
                        <td>
                          <strong>{b.asset}</strong>
                        </td>
                        <td>{formatAmount(avail)}</td>
                        <td>{formatAmount(lock)}</td>
                        <td>{formatAmount(avail + lock)}</td>
                      </tr>
                    );
                  })}
                  {(acc?.balances ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="dim">
                        No balances yet — open Trade → Balances → Get USDC.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="pf-side">
          <div className="pf-side-card pf-side-glow">
            <p className="mkt-kicker">Buying power</p>
            <strong>{formatAmount(available)}</strong>
            <span className="dim">USDC available</span>
            <Link to="/trade" className="mkt-btn primary sm" style={{ marginTop: 16, width: '100%' }}>
              Fund &amp; trade
            </Link>
          </div>
          <div className="pf-side-card">
            <p className="mkt-kicker">Risk</p>
            <ul className="pf-side-list">
              <li>
                <span>Margin usage</span>
                <strong>{marginPct.toFixed(1)}%</strong>
              </li>
              <li>
                <span>Free equity</span>
                <strong className="pos">{freePct.toFixed(1)}%</strong>
              </li>
              <li>
                <span>Positions</span>
                <strong>{positions.length}</strong>
              </li>
            </ul>
            <div className="pf-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, marginPct)}%` }} />
            </div>
          </div>
          <div className="pf-side-card">
            <p className="mkt-kicker">Shortcuts</p>
            <div className="pf-shortcuts">
              <Link to="/trade/BTC-USDC">BTC spot</Link>
              <Link to="/trade/BTC-PERP">BTC perp</Link>
              <Link to="/trade/ETH-PERP">ETH perp</Link>
              <Link to="/docs#risk">Risk guide</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
