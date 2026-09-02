import { create } from 'zustand';
import type { FillData, OrderData, PositionData } from '../lib/api.js';

export interface BalanceEntry {
  available: bigint;
  locked: bigint;
}

const TERMINAL_ORDER = new Set(['filled', 'cancelled', 'rejected']);

function recomputeRisk(
  balances: Record<string, BalanceEntry>,
  positions: PositionData[],
): { perpEquity: bigint; marginUsed: bigint } {
  let marginUsed = 0n;
  let upnlSum = 0n;
  for (const p of positions) {
    marginUsed += p.margin;
    if (p.unrealizedPnl !== null) upnlSum += p.unrealizedPnl;
  }
  const usdc = balances['USDC'] ?? { available: 0n, locked: 0n };
  return {
    marginUsed,
    perpEquity: usdc.available + usdc.locked + marginUsed + upnlSum,
  };
}

export interface UserState {
  balances: Record<string, BalanceEntry>;
  positions: PositionData[];
  openOrders: OrderData[];
  fills: FillData[];
  perpEquity: bigint;
  marginUsed: bigint;
  setAccount: (acc: {
    balances: Record<string, BalanceEntry>;
    positions: PositionData[];
    perpEquity: bigint;
    marginUsed: bigint;
  }) => void;
  setOpenOrders: (orders: OrderData[]) => void;
  setFills: (fills: FillData[]) => void;
  applyBalances: (rows: { asset: string; available: bigint; locked: bigint }[]) => void;
  upsertOrders: (orders: OrderData[]) => void;
  prependFills: (fills: FillData[]) => void;
  upsertPositions: (positions: PositionData[]) => void;
  clear: () => void;
}

export const useUserStore = create<UserState>()((set) => ({
  balances: {},
  positions: [],
  openOrders: [],
  fills: [],
  perpEquity: 0n,
  marginUsed: 0n,

  setAccount: (acc) =>
    set({
      balances: acc.balances,
      positions: acc.positions,
      perpEquity: acc.perpEquity,
      marginUsed: acc.marginUsed,
    }),

  setOpenOrders: (openOrders) => set({ openOrders }),
  setFills: (fills) => set({ fills }),

  applyBalances: (rows) =>
    set((state) => {
      const balances = { ...state.balances };
      for (const r of rows) {
        balances[r.asset] = { available: r.available, locked: r.locked };
      }
      const risk = recomputeRisk(balances, state.positions);
      return { balances, ...risk };
    }),

  upsertOrders: (incoming) =>
    set((state) => {
      const byId = new Map(state.openOrders.map((o) => [o.id, o]));
      for (const o of incoming) {
        if (TERMINAL_ORDER.has(o.status)) {
          byId.delete(o.id);
          continue;
        }
        const prev = byId.get(o.id);
        if (prev === undefined) {
          // skip stub-only frames (cancel/trigger) when we never had the order
          if (o.qty === 0n && o.price === null && o.trigger === null) continue;
          if (o.qty === 0n && o.side === 'buy' && o.trigger !== null) {
            // trigger ratchet without resting order — ignore until REST seed
            continue;
          }
          byId.set(o.id, o);
          continue;
        }
        // partial WS frames merge onto the resting order
        const merged: OrderData = {
          ...prev,
          status: o.status !== 'untriggered' || prev.status === 'untriggered' ? o.status : prev.status,
          filledQty: o.qty === 0n && o.price === null ? prev.filledQty : o.filledQty || prev.filledQty,
          qty: o.qty === 0n && o.price === null && o.trigger !== null ? prev.qty : o.qty === 0n ? prev.qty : o.qty,
          price: o.price ?? prev.price,
          side: o.qty === 0n && o.price === null ? prev.side : o.side,
          type: o.qty === 0n && o.price === null ? prev.type : o.type,
          trigger:
            o.trigger !== null
              ? {
                  price: o.trigger.price,
                  direction: o.trigger.direction === 'below' && prev.trigger ? prev.trigger.direction : o.trigger.direction,
                }
              : prev.trigger,
          ts: o.ts || prev.ts,
        };
        // full order frames always win
        if (o.qty > 0n || (o.price !== null && o.side !== undefined)) {
          byId.set(o.id, { ...prev, ...o, trigger: o.trigger ?? prev.trigger });
        } else {
          byId.set(o.id, merged);
        }
      }
      return {
        openOrders: [...byId.values()].sort((a, b) => b.ts - a.ts),
      };
    }),

  prependFills: (incoming) =>
    set((state) => {
      if (incoming.length === 0) return state;
      const seen = new Set(state.fills.map((f) => f.id));
      const fresh = incoming.filter((f) => !seen.has(f.id));
      if (fresh.length === 0) return state;
      return { fills: [...fresh, ...state.fills].slice(0, 200) };
    }),

  upsertPositions: (incoming) =>
    set((state) => {
      const byMarket = new Map(state.positions.map((p) => [p.marketId, p]));
      for (const p of incoming) {
        if (p.size === 0n) {
          byMarket.delete(p.marketId);
          continue;
        }
        const prev = byMarket.get(p.marketId);
        byMarket.set(p.marketId, {
          ...p,
          markPrice: p.markPrice ?? prev?.markPrice ?? null,
          unrealizedPnl: p.unrealizedPnl ?? prev?.unrealizedPnl ?? null,
          liquidationPrice: p.liquidationPrice ?? prev?.liquidationPrice ?? null,
        });
      }
      const positions = [...byMarket.values()];
      const risk = recomputeRisk(state.balances, positions);
      return { positions, ...risk };
    }),

  clear: () =>
    set({
      balances: {},
      positions: [],
      openOrders: [],
      fills: [],
      perpEquity: 0n,
      marginUsed: 0n,
    }),
}));
