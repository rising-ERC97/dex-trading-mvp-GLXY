import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toUnits } from '@dex/shared';
import {
  api,
  isFundingWire,
  isTickerWire,
  isUserWsFrame,
  parseFill,
  parseFunding,
  parseMarket,
  parseOrder,
  parsePosition,
  parseTicker,
  parseUserBalanceDelta,
  parseUserOrderDelta,
  parseUserPositionDelta,
} from '../lib/api.js';
import type { BookLevelWire, TradeWire } from '../lib/api.js';
import { useAuthStore } from '../lib/auth.js';
import { getWs } from '../lib/ws.js';
import { useBookStore } from '../stores/book.js';
import type { Level, TradeRow } from '../stores/book.js';
import { useMarketStore } from '../stores/market.js';
import { useUserStore } from '../stores/user.js';
import { TopBar } from '../components/TopBar.js';
import { ChartPanel } from '../components/ChartPanel.js';
import { OrderBookPanel } from '../components/OrderBookPanel.js';
import { OrderForm } from '../components/OrderForm.js';
import { BottomPanel } from '../components/BottomPanel.js';
import { MarketSelector, Watchlist } from '../components/MarketSelector.js';
import { ErrorBoundary } from '../components/ErrorBoundary.js';

function parseLevels(levels: BookLevelWire[] | undefined): Level[] {
  if (!Array.isArray(levels)) return [];
  return levels.map((l) => ({ price: toUnits(l.price), qty: toUnits(l.qty) }));
}

function parseTradeRow(w: TradeWire): TradeRow {
  return {
    id: w.id,
    price: toUnits(w.price),
    qty: toUnits(w.qty),
    takerSide: w.takerSide,
    ts: w.ts,
  };
}

interface BookMessage {
  type?: string;
  bids?: BookLevelWire[];
  asks?: BookLevelWire[];
  seq?: number;
  stale?: boolean;
}

export default function TradePage() {
  const { marketId: routeMarketId } = useParams<{ marketId?: string }>();
  const selectedId = useMarketStore((s) => s.selectedId);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  // ---- markets (REST, slow refresh; live prices come over WS) ----
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
    for (const w of wires) {
      if (w.funding !== null && w.funding !== undefined && isFundingWire(w.funding)) {
        store.setFunding(parseFunding(w.funding));
      }
    }
    const fresh = useMarketStore.getState();
    if (routeMarketId !== undefined && fresh.byId[routeMarketId] !== undefined) {
      if (fresh.selectedId !== routeMarketId) fresh.selectMarket(routeMarketId);
      return;
    }
    if (fresh.byId[fresh.selectedId] === undefined && wires.length > 0) {
      fresh.selectMarket(wires[0]!.id);
    }
  }, [marketsQuery.data, routeMarketId]);

  useEffect(() => {
    if (routeMarketId === undefined) return;
    const store = useMarketStore.getState();
    if (store.byId[routeMarketId] !== undefined && store.selectedId !== routeMarketId) {
      store.selectMarket(routeMarketId);
    }
  }, [routeMarketId]);

  // ---- global allTickers stream ----
  useEffect(() => {
    const ws = getWs();
    return ws.subscribe('allTickers', (data) => {
      const arr = Array.isArray(data) ? data : [data];
      const parsed = arr.filter(isTickerWire).map(parseTicker);
      if (parsed.length > 0) useMarketStore.getState().setTickers(parsed);
    });
  }, []);

  // ---- authed WS + user channel (incremental apply; gap → REST resync) ----
  useEffect(() => {
    if (token === null) return;
    const ws = getWs();
    ws.auth(token);
    const resyncUser = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['account'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['fills'] });
      void queryClient.invalidateQueries({ queryKey: ['fundingHistory'] });
      void queryClient.invalidateQueries({ queryKey: ['pnlSummary'] });
      void queryClient.invalidateQueries({ queryKey: ['liquidationHistory'] });
    };
    const unsubscribe = ws.subscribe(
      'user',
      (data) => {
        if (!isUserWsFrame(data)) return;
        const store = useUserStore.getState();
        if (Array.isArray(data.balances)) {
          const rows = data.balances.map(parseUserBalanceDelta).filter((b): b is NonNullable<typeof b> => b !== null);
          if (rows.length > 0) store.applyBalances(rows);
        }
        if (Array.isArray(data.orders)) {
          const orders = data.orders.map(parseUserOrderDelta).filter((o): o is NonNullable<typeof o> => o !== null);
          if (orders.length > 0) store.upsertOrders(orders);
        }
        if (Array.isArray(data.fills)) {
          const fills = data.fills
            .map((f, i) => {
              if (f === null || typeof f !== 'object') return null;
              const w = f as { price?: unknown };
              if (typeof w.price !== 'string') return null;
              return parseFill(f as Parameters<typeof parseFill>[0], i);
            })
            .filter((f): f is NonNullable<typeof f> => f !== null);
          if (fills.length > 0) store.prependFills(fills);
        }
        if (Array.isArray(data.positions)) {
          const positions = data.positions
            .map(parseUserPositionDelta)
            .filter((p): p is NonNullable<typeof p> => p !== null);
          if (positions.length > 0) store.upsertPositions(positions);
        }
        const kinds = typeof data.type === 'string' ? data.type : '';
        if (kinds.includes('funding') || (data.funding?.length ?? 0) > 0) {
          void queryClient.invalidateQueries({ queryKey: ['fundingHistory'] });
        }
        if (kinds.includes('liquidation') || (data.liquidations?.length ?? 0) > 0) {
          void queryClient.invalidateQueries({ queryKey: ['liquidationHistory'] });
          void queryClient.invalidateQueries({ queryKey: ['pnlSummary'] });
        }
        if (kinds.includes('fill') || kinds.includes('position')) {
          void queryClient.invalidateQueries({ queryKey: ['pnlSummary'] });
        }
      },
      { onGap: resyncUser },
    );
    return unsubscribe;
  }, [token, queryClient]);

  // ---- per-market streams: ticker / orderbook (snapshots only) / trades ----
  useEffect(() => {
    const ws = getWs();
    const book = useBookStore.getState();
    book.resetFor(selectedId);

    const unTicker = ws.subscribe(`ticker:${selectedId}`, (data) => {
      if (isTickerWire(data)) useMarketStore.getState().setTicker(parseTicker(data));
    });

    const resyncBook = (): void => {
      api
        .orderbook(selectedId, 20)
        .then((ob) => {
          useBookStore
            .getState()
            .setSnapshot(selectedId, parseLevels(ob.bids), parseLevels(ob.asks), ob.seq, ob.stale === true);
        })
        .catch(() => undefined);
    };
    const unBook = ws.subscribe(
      `orderbook:${selectedId}`,
      (data, seq) => {
        const msg = data as BookMessage | null;
        if (msg === null || typeof msg !== 'object') return;
        const bids = parseLevels(msg.bids);
        const asks = parseLevels(msg.asks);
        const msgSeq = typeof msg.seq === 'number' ? msg.seq : (seq ?? 0);
        useBookStore.getState().setSnapshot(selectedId, bids, asks, msgSeq, msg.stale === true);
      },
      { onGap: resyncBook },
    );

    const unTrades = ws.subscribe(`trades:${selectedId}`, (data) => {
      const arr = (Array.isArray(data) ? data : [data]) as TradeWire[];
      const rows = arr
        .filter((t) => t !== null && typeof t === 'object' && typeof t.price === 'string')
        .map(parseTradeRow)
        .sort((a, b) => b.ts - a.ts);
      useBookStore.getState().pushTrades(selectedId, rows);
    });

    const unFunding = ws.subscribe(`funding:${selectedId}`, (data) => {
      if (isFundingWire(data)) useMarketStore.getState().setFunding(parseFunding(data));
    });

    api
      .orderbook(selectedId, 20)
      .then((ob) => {
        useBookStore
          .getState()
          .setSnapshot(selectedId, parseLevels(ob.bids), parseLevels(ob.asks), ob.seq, ob.stale === true);
      })
      .catch(() => undefined);
    api
      .trades(selectedId, 50)
      .then((rows) => {
        useBookStore
          .getState()
          .setTrades(selectedId, rows.map(parseTradeRow).sort((a, b) => b.ts - a.ts));
      })
      .catch(() => undefined);

    return () => {
      unTicker();
      unBook();
      unTrades();
      unFunding();
    };
  }, [selectedId]);

  const accountQuery = useQuery({
    queryKey: ['account'],
    queryFn: () => api.account(),
    enabled: token !== null,
  });

  useEffect(() => {
    const acc = accountQuery.data;
    if (acc === undefined) return;
    const balances: Record<string, { available: bigint; locked: bigint }> = {};
    for (const b of acc.balances ?? []) {
      balances[b.asset] = { available: toUnits(b.available), locked: toUnits(b.locked) };
    }
    useUserStore.getState().setAccount({
      balances,
      positions: (acc.positions ?? []).map(parsePosition),
      perpEquity: toUnits(acc.perpEquity ?? '0'),
      marginUsed: toUnits(acc.marginUsed ?? '0'),
    });
  }, [accountQuery.data]);

  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.openOrders(),
    enabled: token !== null,
  });

  useEffect(() => {
    if (ordersQuery.data === undefined) return;
    useUserStore.getState().setOpenOrders(ordersQuery.data.map(parseOrder));
  }, [ordersQuery.data]);

  const fillsQuery = useQuery({
    queryKey: ['fills'],
    queryFn: () => api.fills(),
    enabled: token !== null,
  });

  useEffect(() => {
    if (fillsQuery.data === undefined) return;
    useUserStore.getState().setFills(fillsQuery.data.map(parseFill));
  }, [fillsQuery.data]);

  useEffect(() => {
    if (token === null) useUserStore.getState().clear();
  }, [token]);

  return (
    <div className="app">
      <TopBar />
      <Watchlist />
      <main className="chart-area panel">
        <ErrorBoundary
          fallback={
            <div className="error-fallback chart-error" role="alert">
              Unable to load chart
            </div>
          }
        >
          <ChartPanel />
        </ErrorBoundary>
      </main>
      <section className="book-area panel">
        <OrderBookPanel />
      </section>
      <aside className="form-area panel">
        <OrderForm />
      </aside>
      <section className="bottom-area panel">
        <BottomPanel />
      </section>
      <MarketSelector />
    </div>
  );
}
