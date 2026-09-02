import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, isTickerWire, parseMarket, parseTicker, type Market, type TickerData } from '../lib/api.js';
import { formatAmount, formatPct, formatPrice } from '../lib/format.js';
import { getWs } from '../lib/ws.js';
import { useMarketStore } from '../stores/market.js';

type Kind = 'all' | 'spot' | 'perp';
type SortKey = 'name' | 'change' | 'volume' | 'price';

function changeClass(t: TickerData | undefined): string {
  if (t === undefined) return '';
  if (t.change24h > 0n) return 'pos';
  if (t.change24h < 0n) return 'neg';
  return '';
}

function absChange(t: TickerData | undefined): bigint {
  if (t === undefined) return 0n;
  return t.change24h < 0n ? -t.change24h : t.change24h;
}

export default function MarketsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<SortKey>('volume');
  const byId = useMarketStore((s) => s.byId);
  const tickers = useMarketStore((s) => s.tickers);
  const selectMarket = useMarketStore((s) => s.selectMarket);

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

  const allMarkets = useMemo(() => Object.values(byId), [byId]);
  const spotCount = useMemo(() => allMarkets.filter((m) => m.type === 'spot').length, [allMarkets]);
  const perpCount = useMemo(() => allMarkets.filter((m) => m.type === 'perp').length, [allMarkets]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = allMarkets
      .filter((m) => (kind === 'all' ? true : m.type === kind))
      .filter((m) => {
        if (needle === '') return true;
        return (
          m.id.toLowerCase().includes(needle) ||
          m.base.toLowerCase().includes(needle) ||
          (m.englishName?.toLowerCase().includes(needle) ?? false)
        );
      });

    list.sort((a, b) => {
      const ta = tickers[a.id];
      const tb = tickers[b.id];
      if (sort === 'name') return a.id.localeCompare(b.id);
      if (sort === 'price') {
        const pa = ta?.price ?? 0n;
        const pb = tb?.price ?? 0n;
        if (pa === pb) return a.id.localeCompare(b.id);
        return pa > pb ? -1 : 1;
      }
      if (sort === 'change') {
        const ca = ta?.change24h ?? 0n;
        const cb = tb?.change24h ?? 0n;
        if (ca === cb) return a.id.localeCompare(b.id);
        return ca > cb ? -1 : 1;
      }
      const va = ta?.volume24h ?? 0n;
      const vb = tb?.volume24h ?? 0n;
      if (va === vb) return a.id.localeCompare(b.id);
      return va > vb ? -1 : 1;
    });
    return list;
  }, [allMarkets, q, kind, sort, tickers]);

  const movers = useMemo(() => {
    const withTicker = allMarkets
      .map((m) => ({ m, t: tickers[m.id] }))
      .filter((x): x is { m: Market; t: TickerData } => x.t !== undefined);
    return [...withTicker].sort((a, b) => (absChange(a.t) > absChange(b.t) ? -1 : 1)).slice(0, 6);
  }, [allMarkets, tickers]);

  const openMarket = (id: string): void => {
    selectMarket(id);
    void navigate(`/trade/${id}`);
  };

  return (
    <div className="mkt-page mkts">
      <section className="mkts-hero">
        <div className="mkts-hero-copy">
          <p className="mkt-kicker">Markets</p>
          <h1>Trade the full book</h1>
          <p>
            Live prices across spot and perpetual markets — filter, sort, and jump straight into the
            terminal.
          </p>
          <div className="mkts-stats" aria-label="Market coverage">
            <div className="mkts-stat">
              <span className="mkts-stat-label">Spot</span>
              <strong>{spotCount || '—'}</strong>
            </div>
            <div className="mkts-stat">
              <span className="mkts-stat-label">Perps</span>
              <strong>{perpCount || '—'}</strong>
            </div>
            <div className="mkts-stat">
              <span className="mkts-stat-label">Listed</span>
              <strong>{allMarkets.length || '—'}</strong>
            </div>
            <div className="mkts-stat live">
              <span className="mkts-stat-label">Feed</span>
              <strong>
                <span className="mkts-live-dot" aria-hidden="true" />
                Live
              </strong>
            </div>
          </div>
          <div className="mkt-cta">
            <Link to="/trade" className="mkt-btn primary">
              Open terminal
            </Link>
            <Link to="/portfolio" className="mkt-btn ghost">
              View portfolio
            </Link>
          </div>
        </div>
        <div className="mkts-movers" aria-label="Top movers">
          <div className="mkts-movers-head">
            <h2>Top movers</h2>
            <span className="dim">24h</span>
          </div>
          <div className="mkts-movers-grid">
            {movers.length === 0 ? (
              <p className="dim mkts-movers-empty">Waiting for live tickers…</p>
            ) : (
              movers.map(({ m, t }) => {
                const up = t.change24h >= 0n;
                const bar = Math.min(100, Math.max(8, Number(absChange(t) / 50_000n)));
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="mkts-mover"
                    onClick={() => openMarket(m.id)}
                  >
                    <span className="mkts-mover-sym">
                      <strong>
                        {m.base}/{m.quote}
                      </strong>
                      <span className={`mkts-type ${m.type}`}>{m.type === 'perp' ? 'PERP' : 'SPOT'}</span>
                    </span>
                    <span className="mkts-mover-px">{formatPrice(t.price, m.tickSize)}</span>
                    <span className={`mkts-mover-chg ${up ? 'pos' : 'neg'}`}>{formatPct(t.change24h)}</span>
                    <span className="mkts-mover-bar" aria-hidden="true">
                      <span className={up ? 'pos' : 'neg'} style={{ width: `${bar}%` }} />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="mkts-board">
        <div className="mkts-toolbar">
          <input
            type="search"
            placeholder="Search symbol or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search markets"
            data-testid="markets-search"
          />
          <div className="mkt-kind" role="group" aria-label="Market type">
            {(['all', 'spot', 'perp'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={kind === k ? 'active' : ''}
                onClick={() => setKind(k)}
              >
                {k === 'all' ? 'All' : k === 'spot' ? 'Spot' : 'Perps'}
              </button>
            ))}
          </div>
          <label className="mkts-sort">
            <span className="dim">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort markets">
              <option value="volume">Volume</option>
              <option value="change">24h change</option>
              <option value="price">Price</option>
              <option value="name">Name</option>
            </select>
          </label>
          <span className="mkts-count dim">{rows.length} markets</span>
        </div>

        <div className="mkt-table-wrap mkts-table-wrap">
          <table className="mkt-table mkts-table" data-testid="markets-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Type</th>
                <th className="num">Last</th>
                <th className="num">24h</th>
                <th className="num">High</th>
                <th className="num">Low</th>
                <th className="num">Volume</th>
                <th className="action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const t = tickers[m.id];
                const cls = changeClass(t);
                return (
                  <tr
                    key={m.id}
                    data-testid={`market-row-${m.id}`}
                    onClick={() => openMarket(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openMarket(m.id);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <td>
                      <div className="mkts-sym">
                        <strong>
                          {m.base}
                          <span className="dim">/{m.quote}</span>
                        </strong>
                        <span className="dim mkts-name">{m.englishName ?? m.base}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`mkts-type ${m.type}`}>{m.type === 'perp' ? 'PERP' : 'SPOT'}</span>
                    </td>
                    <td className="num mono">{t !== undefined ? formatPrice(t.price, m.tickSize) : '—'}</td>
                    <td className="num">
                      <span className={`mkts-chg ${cls}`}>
                        {t !== undefined ? formatPct(t.change24h) : '—'}
                      </span>
                    </td>
                    <td className="num mono dim">
                      {t !== undefined ? formatPrice(t.high24h, m.tickSize) : '—'}
                    </td>
                    <td className="num mono dim">
                      {t !== undefined ? formatPrice(t.low24h, m.tickSize) : '—'}
                    </td>
                    <td className="num mono">
                      {t !== undefined ? `${formatAmount(t.volume24h)} ${m.quote}` : '—'}
                    </td>
                    <td className="action">
                      <span className="mkts-trade">Trade</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="dim mkt-empty">No markets match your filter.</p>}
        </div>
      </section>
    </div>
  );
}
