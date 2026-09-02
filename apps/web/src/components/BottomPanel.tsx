import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { absBig, divUnits, fromUnits, mulDiv, mulUnits, roundToTick, SCALE } from '@dex/shared';
import {
  api,
  errorMessage,
  parseFundingPayment,
  parseLiquidationHistory,
  parsePnlSummary,
} from '../lib/api.js';
import type { PlaceOrderBody } from '../lib/api.js';
import { formatAmount, formatPct, formatPrice, formatQty, formatTime } from '../lib/format.js';
import { useAuthStore } from '../lib/auth.js';
import { useMarketStore } from '../stores/market.js';
import { useUserStore } from '../stores/user.js';
import { toast } from '../stores/toast.js';

type BottomTab =
  | 'positions'
  | 'orders'
  | 'fills'
  | 'balances'
  | 'funding'
  | 'pnl'
  | 'liquidations';

function AccountSummary() {
  const positions = useUserStore((s) => s.positions);
  const tickers = useMarketStore((s) => s.tickers);
  const marginUsed = useUserStore((s) => s.marginUsed);
  const perpEquity = useUserStore((s) => s.perpEquity);

  const { totalUPnl, known, minLiqDist } = useMemo(() => {
    let total = 0n;
    let knownCount = 0;
    let minDist: bigint | null = null;
    for (const p of positions) {
      const mark = tickers[p.marketId]?.price;
      if (mark === undefined) continue;
      total += mulUnits(p.size, mark - p.entryPrice);
      knownCount += 1;
      if (p.liquidationPrice !== null && mark > 0n) {
        // |mark - liq| / mark as 1e8-scaled fraction
        const dist = (absBig(mark - p.liquidationPrice) * SCALE) / mark;
        if (minDist === null || dist < minDist) minDist = dist;
      }
    }
    return { totalUPnl: total, known: knownCount, minLiqDist: minDist };
  }, [positions, tickers]);

  const pnlCls = !known ? '' : totalUPnl > 0n ? 'pos' : totalUPnl < 0n ? 'neg' : '';
  const roe = marginUsed > 0n && known > 0 ? divUnits(totalUPnl, marginUsed) : null;
  const liqCls =
    minLiqDist === null ? '' : minLiqDist < SCALE / 20n ? 'neg' : minLiqDist < SCALE / 10n ? '' : 'pos';

  return (
    <div className="account-summary" data-testid="account-summary">
      <div className="summary-card">
        <span className="dim">Open Positions</span>
        <strong>{positions.length}</strong>
      </div>
      <div className="summary-card">
        <span className="dim">Unrealized PnL</span>
        <strong className={pnlCls}>
          {known === 0
            ? '—'
            : `${totalUPnl > 0n ? '+' : ''}${formatAmount(totalUPnl)}`}
        </strong>
      </div>
      <div className="summary-card">
        <span className="dim">Margin Used</span>
        <strong>{formatAmount(marginUsed)}</strong>
      </div>
      <div className="summary-card">
        <span className="dim">Perp Equity</span>
        <strong>{formatAmount(perpEquity)}</strong>
      </div>
      <div className="summary-card">
        <span className="dim">ROI</span>
        <strong className={pnlCls}>{roe === null ? '—' : formatPct(roe)}</strong>
      </div>
      <div className="summary-card" data-testid="liq-distance">
        <span className="dim">Liq Distance</span>
        <strong className={liqCls}>{minLiqDist === null ? '—' : formatPct(minLiqDist)}</strong>
      </div>
    </div>
  );
}

export function PositionsTable() {
  const positions = useUserStore((s) => s.positions);
  const byId = useMarketStore((s) => s.byId);
  const tickers = useMarketStore((s) => s.tickers);
  const queryClient = useQueryClient();

  const closePosition = async (marketId: string, size: bigint, mark: bigint, tickSize: bigint): Promise<void> => {
    const side = size > 0n ? 'sell' : 'buy';
    const raw = side === 'buy' ? mulDiv(mark, 105n, 100n) : mulDiv(mark, 95n, 100n);
    const bound = roundToTick(raw, tickSize, side === 'buy' ? 'ceil' : 'floor');
    const body: PlaceOrderBody = {
      marketId,
      side,
      type: 'market',
      price: fromUnits(bound),
      qty: fromUnits(absBig(size)),
      tif: 'IOC',
      reduceOnly: true,
    };
    try {
      await api.placeOrder(body);
      toast.success('Position close order submitted');
      await queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (positions.length === 0) return <div className="empty dim">No open positions</div>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Market</th>
          <th>Side</th>
          <th>Size</th>
          <th>Entry Price</th>
          <th>Liquidation Price</th>
          <th>Mark Price</th>
          <th>Unrealized PnL</th>
          <th>Margin</th>
          <th>Leverage</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const market = byId[p.marketId];
          const tickSize = market?.tickSize ?? 1n;
          // Only a real ticker price is a valid mark. When the feed is missing,
          // do NOT substitute entryPrice — that fabricates a +0 / 0.00% PnL.
          const mark = tickers[p.marketId]?.price ?? null;
          const uPnl = mark !== null ? mulUnits(p.size, mark - p.entryPrice) : null;
          const roe = mark !== null && p.margin > 0n ? divUnits(uPnl ?? 0n, p.margin) : 0n;
          const cls = uPnl === null ? '' : uPnl > 0n ? 'pos' : uPnl < 0n ? 'neg' : '';
          const long = p.size > 0n;
          return (
            <tr key={p.marketId}>
              <td>{p.marketId}</td>
              <td>
                <span className={`badge mini ${long ? 'long' : 'short'}`}>{long ? 'Long' : 'Short'}</span>
              </td>
              <td>{formatQty(absBig(p.size))}</td>
              <td>{formatPrice(p.entryPrice, tickSize)}</td>
              <td>
                {p.liquidationPrice !== null ? (
                  <span className="neg" data-testid={`liq-${p.marketId}`}>
                    {formatPrice(p.liquidationPrice, tickSize)}
                  </span>
                ) : (
                  <span className="dim" data-testid={`liq-${p.marketId}`}>
                    —
                  </span>
                )}
              </td>
              <td>{mark !== null ? formatPrice(mark, tickSize) : <span className="dim">—</span>}</td>
              <td>
                {uPnl !== null ? (
                  <span className={`pnl ${cls}`} data-testid={`pnl-${p.marketId}`}>
                    {uPnl > 0n ? '+' : ''}
                    {formatAmount(uPnl)} ({formatPct(roe)})
                  </span>
                ) : (
                  <span className="pnl dim" data-testid={`pnl-${p.marketId}`}>
                    —
                  </span>
                )}
              </td>
              <td>{formatAmount(p.margin)}</td>
              <td>{p.leverage}x</td>
              <td>
                <button
                  type="button"
                  className="small-btn danger"
                  aria-label={`Close ${p.marketId}`}
                  disabled={mark === null}
                  onClick={() => {
                    if (mark === null) return;
                    void closePosition(p.marketId, p.size, mark, tickSize);
                  }}
                >
                  Close
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface EditState {
  id: string;
  price: string;
  qty: string;
}

export function OpenOrdersTable() {
  const orders = useUserStore((s) => s.openOrders);
  const byId = useMarketStore((s) => s.byId);
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState<EditState | null>(null);

  const refresh = (): Promise<unknown> =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['orders'] }),
      queryClient.invalidateQueries({ queryKey: ['account'] }),
    ]);

  const cancel = async (orderId: string): Promise<void> => {
    try {
      await api.cancelOrder(orderId);
      toast.success('Order cancelled');
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const submitEdit = async (): Promise<void> => {
    if (edit === null) return;
    try {
      await api.amendOrder(edit.id, { price: edit.price, qty: edit.qty });
      setEdit(null);
      toast.success('Order updated');
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (orders.length === 0) return <div className="empty dim">No open orders</div>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Market</th>
          <th>Side</th>
          <th>Type</th>
          <th>Price</th>
          <th>Quantity</th>
          <th>Filled</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const tickSize = byId[o.marketId]?.tickSize ?? 1n;
          const trigger = o.trigger;
          const editing = edit?.id === o.id;
          // only a plain resting limit order (no trigger) can be amended in place
          const amendable = o.type === 'limit' && trigger === null && o.price !== null;
          return (
            <tr key={o.id} data-testid={`open-order-${o.id}`}>
              <td className="dim">{formatTime(o.ts)}</td>
              <td>{o.marketId}</td>
              <td className={o.side === 'buy' ? 'pos' : 'neg'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</td>
              <td>
                {o.type === 'limit' ? 'Limit' : 'Market'}
                {trigger !== null && (
                  <span className="badge mini trigger" data-testid={`trigger-badge-${o.id}`}>
                    Trigger
                  </span>
                )}
              </td>
              <td>
                {editing ? (
                  <input
                    className="inline-edit"
                    aria-label="Edit order price"
                    value={edit.price}
                    onChange={(e) => {
                      setEdit({ ...edit, price: e.target.value });
                    }}
                  />
                ) : trigger !== null ? (
                  <span className="trigger-cond" data-testid={`trigger-cond-${o.id}`}>
                    {trigger.direction === 'above' ? '≥' : '≤'} {formatPrice(trigger.price, tickSize)}
                  </span>
                ) : o.price !== null ? (
                  formatPrice(o.price, tickSize)
                ) : (
                  'Market'
                )}
              </td>
              <td>
                {editing ? (
                  <input
                    className="inline-edit"
                    aria-label="Edit order quantity"
                    value={edit.qty}
                    onChange={(e) => {
                      setEdit({ ...edit, qty: e.target.value });
                    }}
                  />
                ) : (
                  formatQty(o.qty)
                )}
              </td>
              <td>{formatQty(o.filledQty)}</td>
              <td className="order-actions">
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="small-btn primary"
                      onClick={() => {
                        void submitEdit();
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => {
                        setEdit(null);
                      }}
                    >
                      Revert
                    </button>
                  </>
                ) : (
                  <>
                    {amendable && (
                      <button
                        type="button"
                        className="small-btn"
                        data-testid={`amend-${o.id}`}
                        onClick={() => {
                          setEdit({ id: o.id, price: fromUnits(o.price as bigint), qty: fromUnits(o.qty) });
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className="small-btn"
                      data-testid={`cancel-order-${o.id}`}
                      onClick={() => {
                        void cancel(o.id);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function FillsTable() {
  const fills = useUserStore((s) => s.fills);
  const byId = useMarketStore((s) => s.byId);

  if (fills.length === 0) return <div className="empty dim">No trade history</div>;

  return (
    <table className="data-table" data-testid="fills-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Market</th>
          <th>Side</th>
          <th>Price</th>
          <th>Quantity</th>
          <th>Fee</th>
        </tr>
      </thead>
      <tbody>
        {fills.map((f) => {
          const tickSize = byId[f.marketId]?.tickSize ?? 1n;
          return (
            <tr key={f.id} data-testid={`fill-row-${f.id}`}>
              <td className="dim">{formatTime(f.ts)}</td>
              <td>{f.marketId}</td>
              <td className={f.side === 'buy' ? 'pos' : f.side === 'sell' ? 'neg' : ''}>
                {f.side === 'buy' ? 'Buy' : f.side === 'sell' ? 'Sell' : '–'}
              </td>
              <td>{formatPrice(f.price, tickSize)}</td>
              <td>{formatQty(f.qty)}</td>
              <td>{f.fee !== null ? formatAmount(f.fee) : '–'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function BalancesTable() {
  const balances = useUserStore((s) => s.balances);
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);

  const claimFaucet = async (): Promise<void> => {
    setClaiming(true);
    try {
      await api.faucet();
      toast.success('USDC credited');
      await queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setClaiming(false);
    }
  };

  const entries = Object.entries(balances);

  return (
    <div className="balances">
      <div className="balances-actions">
        <p className="balances-hint dim">Fund your account with USDC to place orders. One credit per wallet.</p>
        <button
          type="button"
          className="small-btn accent-btn"
          disabled={claiming}
          onClick={() => {
            void claimFaucet();
          }}
        >
          Get USDC
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="empty dim">No balances yet. Get USDC to start trading.</div>
      ) : (
        <table className="data-table" data-testid="balances-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Available</th>
              <th>In Orders</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([asset, b]) => (
              <tr key={asset} data-testid={`balance-${asset}`}>
                <td>{asset}</td>
                <td data-testid={`balance-avail-${asset}`}>{formatAmount(b.available)}</td>
                <td>{formatAmount(b.locked)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FundingHistoryTable() {
  const token = useAuthStore((s) => s.token);
  const byId = useMarketStore((s) => s.byId);
  const q = useQuery({
    queryKey: ['fundingHistory'],
    queryFn: async () => {
      const rows = await api.accountFunding();
      return rows.map(parseFundingPayment);
    },
    enabled: token !== null,
  });

  if (q.isLoading) return <div className="empty dim">Loading funding history…</div>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <div className="empty dim">No funding payments yet</div>;

  return (
    <table className="data-table" data-testid="funding-history">
      <thead>
        <tr>
          <th>Time</th>
          <th>Market</th>
          <th>Rate</th>
          <th>Payment</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const tickSize = byId[r.marketId]?.tickSize ?? 1n;
          const cls = r.payment > 0n ? 'pos' : r.payment < 0n ? 'neg' : '';
          return (
            <tr key={`${r.seq}-${r.marketId}`}>
              <td className="dim">{r.ts > 0 ? formatTime(r.ts) : '—'}</td>
              <td>{r.marketId}</td>
              <td>{formatPct(r.rate)}</td>
              <td className={cls}>
                {r.payment > 0n ? '+' : ''}
                {formatAmount(r.payment)}
              </td>
              <td className="dim" style={{ display: 'none' }}>
                {r.markPrice !== null ? formatPrice(r.markPrice, tickSize) : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PnlSummaryTable() {
  const token = useAuthStore((s) => s.token);
  const q = useQuery({
    queryKey: ['pnlSummary'],
    queryFn: async () => parsePnlSummary(await api.accountPnl()),
    enabled: token !== null,
  });

  if (q.isLoading) return <div className="empty dim">Loading realized PnL…</div>;
  const data = q.data;
  if (data === undefined) return <div className="empty dim">No realized PnL yet</div>;
  const cls = data.total > 0n ? 'pos' : data.total < 0n ? 'neg' : '';

  return (
    <div data-testid="pnl-summary">
      <div className="account-summary" style={{ marginBottom: 12 }}>
        <div className="summary-card">
          <span className="dim">Total Realized</span>
          <strong className={cls}>
            {data.total > 0n ? '+' : ''}
            {formatAmount(data.total)}
          </strong>
        </div>
      </div>
      {data.byMarket.length === 0 ? (
        <div className="empty dim">No per-market realized PnL yet</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Realized PnL</th>
            </tr>
          </thead>
          <tbody>
            {data.byMarket.map((r) => {
              const rowCls = r.amount > 0n ? 'pos' : r.amount < 0n ? 'neg' : '';
              return (
                <tr key={r.marketId}>
                  <td>{r.marketId}</td>
                  <td className={rowCls}>
                    {r.amount > 0n ? '+' : ''}
                    {formatAmount(r.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LiquidationsHistoryTable() {
  const token = useAuthStore((s) => s.token);
  const byId = useMarketStore((s) => s.byId);
  const q = useQuery({
    queryKey: ['liquidationHistory'],
    queryFn: async () => {
      const rows = await api.accountLiquidations();
      return rows.map(parseLiquidationHistory);
    },
    enabled: token !== null,
  });

  if (q.isLoading) return <div className="empty dim">Loading liquidations…</div>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <div className="empty dim">No liquidations</div>;

  return (
    <table className="data-table" data-testid="liquidation-history">
      <thead>
        <tr>
          <th>Time</th>
          <th>Market</th>
          <th>Size</th>
          <th>Mark</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const tickSize = byId[r.marketId]?.tickSize ?? 1n;
          return (
            <tr key={`${r.seq}-${r.marketId}-${r.ts}`}>
              <td className="dim">{formatTime(r.ts)}</td>
              <td>{r.marketId}</td>
              <td>{formatQty(absBig(r.size))}</td>
              <td>{formatPrice(r.markPrice, tickSize)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function BottomPanel() {
  const [tab, setTab] = useState<BottomTab>('positions');
  const positions = useUserStore((s) => s.positions);
  const orders = useUserStore((s) => s.openOrders);

  const tabs: { key: BottomTab; label: string }[] = [
    { key: 'positions', label: `Positions (${positions.length})` },
    { key: 'orders', label: `Open Orders (${orders.length})` },
    { key: 'fills', label: 'Trade History' },
    { key: 'balances', label: 'Balances' },
    { key: 'funding', label: 'Funding' },
    { key: 'pnl', label: 'PnL' },
    { key: 'liquidations', label: 'Liquidations' },
  ];

  return (
    <div className="bottom-panel">
      <div className="tabs" role="tablist" aria-label="Account information">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <AccountSummary />
      <div className="bottom-body">
        {tab === 'positions' && <PositionsTable />}
        {tab === 'orders' && <OpenOrdersTable />}
        {tab === 'fills' && <FillsTable />}
        {tab === 'balances' && <BalancesTable />}
        {tab === 'funding' && <FundingHistoryTable />}
        {tab === 'pnl' && <PnlSummaryTable />}
        {tab === 'liquidations' && <LiquidationsHistoryTable />}
      </div>
    </div>
  );
}
