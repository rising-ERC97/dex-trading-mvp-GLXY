import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, isTickerWire, parseMarket, parseTicker } from '../lib/api.js';
import { formatPct, formatPrice } from '../lib/format.js';
import { getWs } from '../lib/ws.js';
import { useMarketStore } from '../stores/market.js';

function DepthBars({ seed }: { seed: number }) {
  const widths = [92, 78, 64, 88, 52, 70, 45, 38].map((w, i) => Math.max(18, (w + ((seed + i) % 17) * 2) % 96));
  return (
    <div className="mkt-mini-depth" aria-hidden="true">
      {widths.map((w, i) => (
        <span key={i} className={i < 4 ? 'ask' : 'bid'} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

type FeatureIconId = 'liquidity' | 'orders' | 'margin' | 'wallet' | 'portfolio' | 'api';

function FeatureIcon({ id }: { id: FeatureIconId }) {
  const common = {
    viewBox: '0 0 40 40',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const,
  };
  switch (id) {
    case 'liquidity':
      return (
        <svg {...common}>
          <rect x="4" y="22" width="6" height="12" rx="1.5" fill="#00e676" opacity="0.9" />
          <rect x="13" y="14" width="6" height="20" rx="1.5" fill="#00e676" opacity="0.7" />
          <rect x="22" y="8" width="6" height="26" rx="1.5" fill="#00e5ff" opacity="0.85" />
          <rect x="31" y="16" width="6" height="18" rx="1.5" fill="#00e5ff" opacity="0.55" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...common}>
          <rect x="6" y="8" width="28" height="6" rx="2" stroke="#00e5ff" strokeWidth="1.8" />
          <rect x="6" y="17" width="28" height="6" rx="2" stroke="#00e676" strokeWidth="1.8" />
          <rect x="6" y="26" width="18" height="6" rx="2" fill="#00e676" opacity="0.85" />
          <circle cx="30" cy="29" r="3.5" fill="#00e5ff" />
        </svg>
      );
    case 'margin':
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="13" stroke="#00e5ff" strokeWidth="1.8" opacity="0.5" />
          <circle cx="20" cy="20" r="8" stroke="#00e676" strokeWidth="2" />
          <path d="M20 12v8l5 3" stroke="#00e676" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...common}>
          <rect x="5" y="10" width="30" height="20" rx="4" stroke="#00e676" strokeWidth="1.8" />
          <path d="M5 16h30" stroke="#00e676" strokeWidth="1.8" opacity="0.5" />
          <circle cx="28" cy="22" r="2.5" fill="#00e5ff" />
          <rect x="9" y="7" width="14" height="5" rx="1.5" fill="#00e676" opacity="0.7" />
        </svg>
      );
    case 'portfolio':
      return (
        <svg {...common}>
          <path
            d="M6 28 C12 24 16 20 20 16 S28 10 34 8"
            stroke="#00e676"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="34" cy="8" r="3" fill="#00e676" />
          <path d="M6 30h28" stroke="#1c3a4e" strokeWidth="1.5" />
        </svg>
      );
    case 'api':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="11" height="11" rx="2.5" stroke="#00e5ff" strokeWidth="1.8" />
          <rect x="22" y="7" width="11" height="11" rx="2.5" stroke="#00e676" strokeWidth="1.8" />
          <rect x="7" y="22" width="11" height="11" rx="2.5" stroke="#00e676" strokeWidth="1.8" />
          <rect x="22" y="22" width="11" height="11" rx="2.5" fill="#00e5ff" opacity="0.85" />
        </svg>
      );
  }
}

const FEATURES: { icon: FeatureIconId; title: string; body: string }[] = [
  {
    icon: 'liquidity',
    title: 'Deep liquidity',
    body: 'Access tight spreads and real-time order books across hundreds of USDC spot and perpetual markets.',
  },
  {
    icon: 'orders',
    title: 'Advanced order types',
    body: 'Limit, market, post-only, fill-or-kill, reduce-only, and stop orders — built for active execution.',
  },
  {
    icon: 'margin',
    title: 'Margin & risk engine',
    body: 'Isolated margin with maintenance tiers, liquidations, insurance fund, and auto-deleveraging.',
  },
  {
    icon: 'wallet',
    title: 'One-click wallet login',
    body: 'Connect MetaMask or your preferred wallet. Balances, orders, and fills sync instantly to your session.',
  },
  {
    icon: 'portfolio',
    title: 'Portfolio overview',
    body: 'Monitor equity, margin usage, balances, and open positions — then jump back to the book in one click.',
  },
  {
    icon: 'api',
    title: 'Institutional API',
    body: 'Full REST and WebSocket access with public docs, health endpoints, and Prometheus metrics.',
  },
];

export default function LandingPage() {
  const tickers = useMarketStore((s) => s.tickers);
  const byId = useMarketStore((s) => s.byId);

  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: () => api.markets(),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const wires = marketsQuery.data;
    if (wires === undefined) return;
    const store = useMarketStore.getState();
    store.setMarkets(wires.map(parseMarket));
    const seeded = wires
      .map((w) => w.ticker)
      .filter((t): t is NonNullable<typeof t> => t !== null && t !== undefined && isTickerWire(t))
      .map(parseTicker);
    if (seeded.length > 0) store.setTickers(seeded);
  }, [marketsQuery.data]);

  useEffect(() => {
    const ws = getWs();
    return ws.subscribe('allTickers', (data) => {
      const arr = Array.isArray(data) ? data : [data];
      const parsed = arr.filter(isTickerWire).map(parseTicker);
      if (parsed.length > 0) useMarketStore.getState().setTickers(parsed);
    });
  }, []);

  const tape = useMemo(() => {
    const rows = Object.values(byId)
      .map((m) => {
        const t = tickers[m.id];
        if (t === undefined) return null;
        return {
          id: m.id,
          label: `${m.base}/${m.quote}`,
          price: t.price,
          change: t.change24h,
          tick: m.tickSize,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 48);
    return rows.length > 0 ? [...rows, ...rows] : [];
  }, [byId, tickers]);

  const board = useMemo(() => {
    const prefer = [
      'BTC-USDC',
      'ETH-USDC',
      'SOL-USDC',
      'BTC-PERP',
      'ETH-PERP',
      'SOL-PERP',
      'XRP-USDC',
      'DOGE-USDC',
    ];
    const picked = prefer
      .map((id) => {
        const m = byId[id];
        const t = tickers[id];
        if (m === undefined || t === undefined) return null;
        return { m, t };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (picked.length >= 6) return picked.slice(0, 8);

    return Object.values(byId)
      .map((m) => {
        const t = tickers[m.id];
        if (t === undefined) return null;
        return { m, t };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 8);
  }, [byId, tickers]);

  const btc = board.find((x) => x.m.id === 'BTC-USDC') ?? board[0];
  const spotCount = useMemo(() => Object.values(byId).filter((m) => m.type === 'spot').length, [byId]);
  const perpCount = useMemo(() => Object.values(byId).filter((m) => m.type === 'perp').length, [byId]);

  return (
    <div className="mkt-page ld">
      <section className="mkt-hero" data-testid="landing-hero">
        <div className="mkt-hero-glow" aria-hidden="true" />
        <div className="mkt-hero-grid" aria-hidden="true" />

        <div className="mkt-hero-layout">
          <div className="mkt-hero-copy">
            <p className="mkt-brand-hero">
              <span className="mkt-brand-mark" aria-hidden="true" />
              DEX
            </p>
            <h1 className="mkt-headline">
              Trade crypto
              <span className="mkt-headline-em"> with confidence</span>
            </h1>
            <p className="mkt-sub">
              Spot and perpetual markets with deep liquidity — trade securely with your wallet on DEX.
            </p>
            <div className="mkt-cta">
              <Link to="/trade" className="mkt-btn primary" data-testid="cta-trade">
                Start trading
              </Link>
              <Link to="/markets" className="mkt-btn ghost" data-testid="cta-markets">
                View markets
              </Link>
            </div>
            <div className="mkt-hero-metrics">
              <div>
                <span className="dim">Spot</span>
                <strong>{spotCount > 0 ? spotCount : 191}</strong>
              </div>
              <div>
                <span className="dim">Perps</span>
                <strong>{perpCount > 0 ? perpCount : 30}</strong>
              </div>
              <div>
                <span className="dim">Feed</span>
                <strong className="pos">
                  <span className="mkt-live-dot" />
                  LIVE
                </strong>
              </div>
            </div>
          </div>

          <div className="mkt-hero-desk" aria-hidden="true">
            <div className="mkt-hd-top">
              <span className="mkt-hd-pair">
                {btc !== undefined ? `${btc.m.base}/${btc.m.quote}` : 'BTC/USDC'}
                <em>{btc?.m.englishName ?? 'Bitcoin'}</em>
              </span>
              <span className={`mkt-hd-px ${(btc?.t.change24h ?? 0n) >= 0n ? 'pos' : 'neg'}`}>
                {btc !== undefined ? formatPrice(btc.t.price, btc.m.tickSize) : '—'}
              </span>
              <span className={`mkt-hd-chg ${(btc?.t.change24h ?? 0n) >= 0n ? 'pos' : 'neg'}`}>
                {btc !== undefined ? formatPct(btc.t.change24h) : '—'}
              </span>
              <span className="mkt-hd-live">
                <span className="mkt-live-dot" />
                LIVE
              </span>
            </div>
            <div className="mkt-hd-body">
              <div className="mkt-hd-chart">
                <img src="/brand/candles.svg" alt="" />
                <span className="mkt-hd-buy">BUY</span>
                <span className="mkt-hd-sell">SELL</span>
              </div>
              <div className="mkt-hd-side">
                <div className="mkt-hd-panel">
                  <header>Depth</header>
                  <DepthBars seed={3} />
                </div>
                <div className="mkt-hd-panel mkt-hd-ticket">
                  <header>Ticket</header>
                  <div className="mkt-hd-field">Market</div>
                  <div className="mkt-hd-field">0.01 BTC</div>
                  <div className="mkt-hd-buybtn">Buy</div>
                </div>
              </div>
            </div>
            <ul className="mkt-hd-wl">
              {board.slice(0, 5).map(({ m, t }) => (
                <li key={m.id}>
                  <span>{m.base}</span>
                  <span className={t.change24h >= 0n ? 'pos' : 'neg'}>{formatPrice(t.price, m.tickSize)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mkt-tape" aria-label="Live market prices">
          <div className="mkt-tape-track">
            {tape.map((r, i) => (
              <span key={`${r.id}-${i}`} className="mkt-tape-item">
                <strong>{r.label}</strong>
                <span className="mkt-tape-px">{formatPrice(r.price, r.tick)}</span>
                <span className={r.change > 0n ? 'pos' : r.change < 0n ? 'neg' : 'flat'}>
                  {formatPct(r.change)}
                </span>
              </span>
            ))}
            {tape.length === 0 && <span className="mkt-tape-item dim">Connecting to live feeds…</span>}
          </div>
        </div>
      </section>

      <section className="ld-strip">
        <div>
          <span className="dim">Markets</span>
          <strong>{(spotCount || 191) + (perpCount || 30)}+</strong>
        </div>
        <div>
          <span className="dim">Settlement</span>
          <strong>USDC</strong>
        </div>
        <div>
          <span className="dim">Trading fee</span>
          <strong>2 bps</strong>
        </div>
        <div>
          <span className="dim">Access</span>
          <strong>Wallet</strong>
        </div>
        <div>
          <span className="dim">Uptime</span>
          <strong className="pos">24/7</strong>
        </div>
      </section>

      <section className="mkt-board">
        <div className="mkt-board-head">
          <div>
            <p className="mkt-kicker">Markets</p>
            <h2>Top markets</h2>
          </div>
          <Link to="/markets" className="mkt-btn ghost sm">
            View all
          </Link>
        </div>
        <div className="mkt-board-grid">
          {board.map(({ m, t }, i) => {
            const up = t.change24h >= 0n;
            return (
              <Link key={m.id} to={`/trade/${m.id}`} className="mkt-board-row">
                <div className="mkt-board-sym">
                  <strong>
                    {m.base}/{m.quote}
                  </strong>
                  <span className={`mkt-pill ${m.type}`}>{m.type === 'perp' ? 'PERP' : 'SPOT'}</span>
                </div>
                <div className="mkt-board-meta dim">{m.englishName ?? m.base}</div>
                <div className="mkt-board-px">{formatPrice(t.price, m.tickSize)}</div>
                <div className={`mkt-board-chg ${up ? 'pos' : 'neg'}`}>{formatPct(t.change24h)}</div>
                <div className="mkt-board-bar" aria-hidden="true">
                  <span className={up ? 'pos' : 'neg'} style={{ width: `${35 + ((i * 17) % 55)}%` }} />
                </div>
              </Link>
            );
          })}
          {board.length === 0 && (
            <div className="mkt-board-empty dim">Waiting for live tickers…</div>
          )}
        </div>
      </section>

      <section className="ld-products">
        <div className="ld-section-head">
          <p className="mkt-kicker">Products</p>
          <h2>Spot and perpetuals in one account</h2>
          <p className="dim">
            Buy and sell digital assets or trade leveraged contracts — unified wallet, portfolio, and risk
            controls.
          </p>
        </div>
        <div className="ld-product-grid">
          <article className="ld-product">
            <div className="ld-product-art">
              <img src="/brand/depth-panel.svg" alt="" />
            </div>
            <div className="ld-product-copy">
              <span className="mkt-pill spot">SPOT</span>
              <h3>Spot trading</h3>
              <p>
                Trade major USDC pairs with real-time charts, depth, and order execution designed for speed
                and clarity.
              </p>
              <Link to="/trade/BTC-USDC" className="mkt-text-link">
                Trade BTC/USDC →
              </Link>
            </div>
          </article>
          <article className="ld-product">
            <div className="ld-product-art">
              <img src="/brand/perp-panel.svg" alt="" />
            </div>
            <div className="ld-product-copy">
              <span className="mkt-pill perp">PERP</span>
              <h3>USDC-M perpetuals</h3>
              <p>
                Up to high leverage with isolated margin, funding rates, mark price protection, and
                automated liquidation controls.
              </p>
              <Link to="/trade/BTC-PERP" className="mkt-text-link">
                Trade BTC-PERP →
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="ld-features">
        <div className="ld-section-head">
          <p className="mkt-kicker">Why DEX</p>
          <h2>Everything you need to trade</h2>
        </div>
        <div className="ld-feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="ld-feature">
              <div className="ld-feature-icon">
                <FeatureIcon id={f.icon} />
              </div>
              <strong>{f.title}</strong>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ld-portfolio">
        <div className="ld-portfolio-copy">
          <p className="mkt-kicker">Assets</p>
          <h2>Manage your portfolio in real time</h2>
          <p>
            Track balances, unrealized PnL, and margin usage across spot and perps — then trade without
            switching accounts.
          </p>
          <div className="mkt-cta">
            <Link to="/portfolio" className="mkt-btn primary">
              Open portfolio
            </Link>
            <Link to="/docs#risk" className="mkt-btn ghost">
              Risk guide
            </Link>
          </div>
        </div>
        <div className="ld-portfolio-art" aria-hidden="true">
          <img src="/brand/equity-curve.svg" alt="" />
          <div className="ld-portfolio-metrics">
            <div>
              <span className="dim">Equity</span>
              <strong className="pos">Live</strong>
            </div>
            <div>
              <span className="dim">Margin</span>
              <strong>Isolated</strong>
            </div>
            <div>
              <span className="dim">Sync</span>
              <strong>
                <span className="mkt-live-dot" /> WS
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-path">
        <div className="mkt-path-copy">
          <p className="mkt-kicker">Get started</p>
          <h2>Start trading in three steps</h2>
        </div>
        <div className="mkt-path-rail">
          <article className="mkt-path-card">
            <div className="mkt-path-visual mkt-path-wallet">
              <span className="mkt-path-glow" />
              <code>0x7a…c4</code>
              <span className="mkt-path-badge">VERIFIED</span>
            </div>
            <span className="mkt-path-n">01</span>
            <h3>Connect wallet</h3>
            <p>Securely link your wallet to create your trading account.</p>
          </article>
          <article className="mkt-path-card">
            <div className="mkt-path-visual mkt-path-faucet">
              <span className="mkt-path-glow" />
              <strong>100,000</strong>
              <span>USDC</span>
            </div>
            <span className="mkt-path-n">02</span>
            <h3>Deposit funds</h3>
            <p>Add USDC collateral and unlock buying power for spot and perps.</p>
          </article>
          <article className="mkt-path-card">
            <div className="mkt-path-visual mkt-path-trade">
              <span className="mkt-path-glow" />
              <DepthBars seed={9} />
            </div>
            <span className="mkt-path-n">03</span>
            <h3>Place an order</h3>
            <p>Choose a market and execute with advanced order types.</p>
          </article>
        </div>
      </section>

      <section className="ld-trust">
        <div className="ld-section-head">
          <p className="mkt-kicker">Security</p>
          <h2>Protected by design</h2>
        </div>
        <div className="ld-trust-grid">
          <article>
            <h3>Market integrity</h3>
            <p>Real-time monitoring pauses disrupted markets so you never trade on stale prices.</p>
          </article>
          <article>
            <h3>Non-custodial login</h3>
            <p>Your keys stay in your wallet. DEX never stores seed phrases or private keys.</p>
          </article>
          <article>
            <h3>Low, transparent fees</h3>
            <p>A flat 0.02% trading fee on every fill. Funding rates are always visible before you trade.</p>
          </article>
          <article>
            <h3>System status</h3>
            <p>
              Live health checks and public metrics.{' '}
              <Link to="/docs#api" className="mkt-text-link">
                View status →
              </Link>
            </p>
          </article>
        </div>
      </section>

      <section className="ld-cta-band">
        <div>
          <p className="mkt-kicker">Trade now</p>
          <h2>Join traders on DEX</h2>
          <p className="dim">Connect your wallet and start trading spot and perpetuals in minutes.</p>
        </div>
        <div className="mkt-cta">
          <Link to="/trade" className="mkt-btn primary">
            Launch exchange
          </Link>
          <Link to="/docs" className="mkt-btn ghost">
            Learn more
          </Link>
        </div>
      </section>
    </div>
  );
}
