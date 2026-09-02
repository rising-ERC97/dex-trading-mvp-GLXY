/**
 * Typed REST client for the /api contract. Over the wire all 1e8 bigint values
 * are decimal strings (ARCHITECTURE.md); parse* helpers convert them back to
 * bigint. Money values never live in JS number.
 */
import { toUnits } from '@dex/shared';
import type { CandleInterval, MarketType, OrderStatus, OrderType, Side, TimeInForce } from '@dex/shared';

export const API_BASE = '/api';

/** A conditional order fires when the market price moves above/below the trigger. */
export type TriggerDirection = 'above' | 'below';

// ---------------------------------------------------------------------------
// auth token plumbing (registered by lib/auth.ts to avoid an import cycle)
// ---------------------------------------------------------------------------

let tokenProvider: () => string | null = () => null;

export function setTokenProvider(fn: () => string | null): void {
  tokenProvider = fn;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_ORDER: 'Invalid order',
  MARKET_NOT_FOUND: 'Market not found',
  ORDER_NOT_FOUND: 'Order not found',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  INSUFFICIENT_MARGIN: 'Insufficient margin',
  POST_ONLY_WOULD_CROSS: 'Post Only order would execute immediately',
  FOK_NOT_FILLED: 'Unable to fully fill FOK order',
  MIN_NOTIONAL: 'Order value is below the minimum',
  TICK_SIZE: 'Invalid price increment',
  LOT_SIZE: 'Invalid quantity increment',
  SLIPPAGE_EXCEEDED: 'Slippage limit exceeded',
  REDUCE_ONLY_VIOLATION: 'Reduce Only condition violated',
  LEVERAGE_EXCEEDED: 'Maximum leverage exceeded',
  LEVERAGE_IN_USE: 'Cannot change leverage while positions or orders are open',
  NOT_AUTHORIZED: 'Not authorized',
  FAUCET_ALREADY_CLAIMED: 'USDC already credited for this wallet',
  DUPLICATE_CLIENT_ORDER_ID: 'Duplicate order ID',
  RATE_LIMITED: 'Too many requests. Please try again shortly',
  INTERNAL: 'A server error occurred',
};

/** User-facing message for an API error (or anything thrown around fetch). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    return ERROR_MESSAGES[e.code] ?? `An error occurred (${e.code})`;
  }
  if (e instanceof TypeError) return 'Unable to connect to the server';
  if (e instanceof Error && e.message.length > 0 && e.message.length < 160) return e.message;
  return 'An error occurred';
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const token = tokenProvider();
  if (token !== null) headers['authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errBody = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(errBody?.code ?? 'INTERNAL', errBody?.message ?? `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// wire types (bigint fields serialized as decimal strings)
// ---------------------------------------------------------------------------

export interface TickerWire {
  marketId: string;
  price: string;
  change24h: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  ts: number;
}

export interface FundingWire {
  marketId: string;
  rate: string;
  intervalMs: number;
  nextFundingTs: number;
  ts: number;
}

export interface MarketWire {
  id: string;
  type: MarketType;
  base: string;
  quote: string;
  englishName: string | null;
  tickSize: string;
  lotSize: string;
  minNotional: string;
  makerFeeBps: number;
  takerFeeBps: number;
  maxLeverage: number;
  ticker?: TickerWire | null;
  funding?: FundingWire | null;
  mark?: string | null;
}

export interface BookLevelWire {
  price: string;
  qty: string;
}

export interface OrderbookWire {
  marketId: string;
  bids: BookLevelWire[];
  asks: BookLevelWire[];
  seq: number;
  /** True when the upstream venue feed is frozen/down — don't present as live. */
  stale?: boolean;
}

export interface TradeWire {
  id: string;
  marketId: string;
  price: string;
  qty: string;
  takerSide: Side;
  ts: number;
}

export interface CandleWire {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

export interface BalanceWire {
  asset: string;
  available: string;
  locked: string;
}

export interface PositionWire {
  userId?: string;
  marketId: string;
  size: string;
  entryPrice: string;
  leverage: number;
  margin: string;
  markPrice?: string;
  unrealizedPnl?: string;
  liquidationPrice?: string | null;
}

export interface AccountWire {
  address: string;
  balances: BalanceWire[];
  positions: PositionWire[];
  perpEquity: string;
  marginUsed: string;
}

export interface TriggerWire {
  price: string;
  direction: TriggerDirection;
}

export interface OrderWire {
  id: string;
  marketId: string;
  side: Side;
  type: OrderType;
  price: string | null;
  qty: string;
  filledQty: string;
  status: OrderStatus;
  tif: TimeInForce;
  postOnly: boolean;
  reduceOnly: boolean;
  trigger?: TriggerWire | null;
  ts: number;
}

export interface FillWire {
  id?: string;
  marketId: string;
  price: string;
  qty: string;
  side?: Side;
  takerSide?: Side;
  fee?: string;
  ts: number;
}

export interface PlaceOrderBody {
  marketId: string;
  side: Side;
  type: OrderType;
  /** Omitted for a stop-MARKET order — the engine derives the bound at activation. */
  price?: string;
  qty: string;
  tif: TimeInForce;
  postOnly?: boolean;
  reduceOnly?: boolean;
  /** Conditional (stop/take-profit) trigger price — must be sent with triggerDirection. */
  triggerPrice?: string;
  triggerDirection?: TriggerDirection;
  /** Trailing-stop distance — when set, the stop trails the ref by this amount. */
  trailDistance?: string;
}

export interface TwapBody {
  marketId: string;
  side: Side;
  totalQty: string;
  durationMs: number;
  slices: number;
  type?: OrderType;
  limitPrice?: string;
  reduceOnly?: boolean;
}

export interface BracketBody {
  marketId: string;
  side: Side;
  qty: string;
  takeProfitPrice: string;
  stopLossPrice: string;
}

export interface TwapWire {
  id: string;
  marketId: string;
  side: Side;
  totalQty: string;
  filledQty: string;
  sliceQty: string;
  slicesDone: number;
  slicesTotal: number;
  type: OrderType;
  limitPrice: string | null;
  intervalMs: number;
  nextRunTs: number;
  status: 'running' | 'done' | 'cancelled';
  createdTs: number;
}

export interface TwapData {
  id: string;
  marketId: string;
  side: Side;
  totalQty: bigint;
  filledQty: bigint;
  slicesDone: number;
  slicesTotal: number;
  status: 'running' | 'done' | 'cancelled';
}

export function parseTwap(w: TwapWire): TwapData {
  return {
    id: w.id,
    marketId: w.marketId,
    side: w.side,
    totalQty: toUnits(w.totalQty),
    filledQty: toUnits(w.filledQty),
    slicesDone: w.slicesDone,
    slicesTotal: w.slicesTotal,
    status: w.status,
  };
}

// ---------------------------------------------------------------------------
// parsed (bigint) app-side models
// ---------------------------------------------------------------------------

export interface Market {
  id: string;
  type: MarketType;
  base: string;
  quote: string;
  englishName: string | null;
  tickSize: bigint;
  lotSize: bigint;
  minNotional: bigint;
  makerFeeBps: number;
  takerFeeBps: number;
  maxLeverage: number;
}

export interface TickerData {
  marketId: string;
  price: bigint;
  change24h: bigint;
  high24h: bigint;
  low24h: bigint;
  volume24h: bigint;
  ts: number;
}

export interface FundingData {
  marketId: string;
  /** funding rate for one interval, 1e8 units */
  rate: bigint;
  intervalMs: number;
  nextFundingTs: number;
  ts: number;
}

export interface PositionData {
  marketId: string;
  size: bigint;
  entryPrice: bigint;
  leverage: number;
  margin: bigint;
  /** live mark + risk fields (perp positions; absent on legacy/spot snapshots) */
  markPrice: bigint | null;
  unrealizedPnl: bigint | null;
  liquidationPrice: bigint | null;
}

export interface TriggerData {
  price: bigint;
  direction: TriggerDirection;
}

export interface OrderData {
  id: string;
  marketId: string;
  side: Side;
  type: OrderType;
  price: bigint | null;
  qty: bigint;
  filledQty: bigint;
  status: OrderStatus;
  tif: TimeInForce;
  postOnly: boolean;
  reduceOnly: boolean;
  /** Non-null only for conditional orders (status 'untriggered' until it fires). */
  trigger: TriggerData | null;
  ts: number;
}

export interface FillData {
  id: string;
  marketId: string;
  side: Side | null;
  price: bigint;
  qty: bigint;
  fee: bigint | null;
  ts: number;
}

export function parseMarket(w: MarketWire): Market {
  return {
    id: w.id,
    type: w.type,
    base: w.base,
    quote: w.quote,
    englishName: w.englishName ?? null,
    tickSize: toUnits(w.tickSize),
    lotSize: toUnits(w.lotSize),
    minNotional: toUnits(w.minNotional),
    makerFeeBps: w.makerFeeBps,
    takerFeeBps: w.takerFeeBps,
    maxLeverage: w.maxLeverage,
  };
}

export function parseTicker(w: TickerWire): TickerData {
  return {
    marketId: w.marketId,
    price: toUnits(w.price),
    change24h: toUnits(w.change24h),
    high24h: toUnits(w.high24h),
    low24h: toUnits(w.low24h),
    volume24h: toUnits(w.volume24h),
    ts: w.ts,
  };
}

export function isTickerWire(d: unknown): d is TickerWire {
  if (d === null || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return typeof o['marketId'] === 'string' && typeof o['price'] === 'string';
}

export function parseFunding(w: FundingWire): FundingData {
  return {
    marketId: w.marketId,
    rate: toUnits(w.rate),
    intervalMs: w.intervalMs,
    nextFundingTs: w.nextFundingTs,
    ts: w.ts,
  };
}

export function isFundingWire(d: unknown): d is FundingWire {
  if (d === null || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return typeof o['marketId'] === 'string' && typeof o['rate'] === 'string' && typeof o['nextFundingTs'] === 'number';
}

export function parsePosition(w: PositionWire): PositionData {
  return {
    marketId: w.marketId,
    size: toUnits(w.size),
    entryPrice: toUnits(w.entryPrice),
    leverage: w.leverage,
    margin: toUnits(w.margin),
    markPrice: w.markPrice === undefined || w.markPrice === null ? null : toUnits(w.markPrice),
    unrealizedPnl:
      w.unrealizedPnl === undefined || w.unrealizedPnl === null ? null : toUnits(w.unrealizedPnl),
    liquidationPrice:
      w.liquidationPrice === undefined || w.liquidationPrice === null
        ? null
        : toUnits(w.liquidationPrice),
  };
}

export function parseOrder(w: OrderWire): OrderData {
  const trigger =
    w.trigger === null || w.trigger === undefined
      ? null
      : { price: toUnits(w.trigger.price), direction: w.trigger.direction };
  return {
    id: w.id,
    marketId: w.marketId,
    side: w.side,
    type: w.type,
    price: w.price === null || w.price === undefined ? null : toUnits(w.price),
    qty: toUnits(w.qty),
    filledQty: toUnits(w.filledQty),
    status: w.status,
    tif: w.tif,
    postOnly: w.postOnly,
    reduceOnly: w.reduceOnly,
    trigger,
    ts: w.ts,
  };
}

export function parseFill(w: FillWire, index: number): FillData {
  return {
    id: w.id ?? `fill-${w.ts}-${index}`,
    marketId: w.marketId,
    side: w.side ?? w.takerSide ?? null,
    price: toUnits(w.price),
    qty: toUnits(w.qty),
    fee: w.fee !== undefined ? toUnits(w.fee) : null,
    ts: w.ts,
  };
}

/** Incremental WS `user` frame entity arrays (same decimal-string wire as REST). */
export interface UserWsFrame {
  type?: string;
  orders?: unknown[];
  fills?: unknown[];
  balances?: unknown[];
  positions?: unknown[];
  liquidations?: unknown[];
  funding?: unknown[];
}

export function isUserWsFrame(d: unknown): d is UserWsFrame {
  return d !== null && typeof d === 'object';
}

/** Parse a WS order delta — full OrderWire, cancel stub, trigger ratchet, or reject. */
export function parseUserOrderDelta(raw: unknown): OrderData | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if ('rejected' in o) return null;
  if (typeof o['id'] !== 'string') return null;

  // cancel / terminal stub
  if (typeof o['status'] === 'string' && (o['qty'] === undefined || o['side'] === undefined)) {
    return {
      id: o['id'],
      marketId: typeof o['marketId'] === 'string' ? o['marketId'] : '',
      side: 'buy',
      type: 'limit',
      price: null,
      qty: 0n,
      filledQty: 0n,
      status: o['status'] as OrderStatus,
      tif: 'GTC',
      postOnly: false,
      reduceOnly: false,
      trigger: null,
      ts: typeof o['ts'] === 'number' ? o['ts'] : Date.now(),
    };
  }

  // trailing-stop ratchet: only id + triggerPrice
  if (typeof o['triggerPrice'] === 'string' && o['side'] === undefined) {
    return {
      id: o['id'],
      marketId: typeof o['marketId'] === 'string' ? o['marketId'] : '',
      side: 'buy',
      type: 'limit',
      price: null,
      qty: 0n,
      filledQty: 0n,
      status: 'untriggered',
      tif: 'GTC',
      postOnly: false,
      reduceOnly: false,
      trigger: {
        price: toUnits(o['triggerPrice']),
        direction: 'below',
      },
      ts: typeof o['ts'] === 'number' ? o['ts'] : Date.now(),
    };
  }

  if (typeof o['side'] !== 'string' || typeof o['qty'] !== 'string') return null;
  return parseOrder(o as unknown as OrderWire);
}

export function parseUserBalanceDelta(
  raw: unknown,
): { asset: string; available: bigint; locked: bigint } | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o['asset'] !== 'string' || typeof o['available'] !== 'string' || typeof o['locked'] !== 'string') {
    return null;
  }
  return {
    asset: o['asset'],
    available: toUnits(o['available']),
    locked: toUnits(o['locked']),
  };
}

export function parseUserPositionDelta(raw: unknown): PositionData | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o['marketId'] !== 'string' || typeof o['size'] !== 'string') return null;
  return parsePosition(o as unknown as PositionWire);
}

export interface FundingPaymentWire {
  seq?: number;
  marketId: string;
  rate: string;
  payment: string;
  markPrice?: string;
  ts?: number;
}

export interface FundingPaymentData {
  seq: number;
  marketId: string;
  rate: bigint;
  payment: bigint;
  markPrice: bigint | null;
  ts: number;
}

export interface RealizedPnlSummaryWire {
  total: string;
  byMarket: { marketId: string; amount: string }[];
}

export interface RealizedPnlSummaryData {
  total: bigint;
  byMarket: { marketId: string; amount: bigint }[];
}

export interface LiquidationHistoryWire {
  seq?: number;
  marketId: string;
  size: string;
  markPrice: string;
  ts: number;
}

export interface LiquidationHistoryData {
  seq: number;
  marketId: string;
  size: bigint;
  markPrice: bigint;
  ts: number;
}

export function parseFundingPayment(w: FundingPaymentWire, index: number): FundingPaymentData {
  return {
    seq: w.seq ?? index,
    marketId: w.marketId,
    rate: toUnits(w.rate),
    payment: toUnits(w.payment),
    markPrice: w.markPrice !== undefined ? toUnits(w.markPrice) : null,
    ts: w.ts ?? 0,
  };
}

export function parsePnlSummary(w: RealizedPnlSummaryWire): RealizedPnlSummaryData {
  return {
    total: toUnits(w.total),
    byMarket: (w.byMarket ?? []).map((r) => ({
      marketId: r.marketId,
      amount: toUnits(r.amount),
    })),
  };
}

export function parseLiquidationHistory(w: LiquidationHistoryWire, index: number): LiquidationHistoryData {
  return {
    seq: w.seq ?? index,
    marketId: w.marketId,
    size: toUnits(w.size),
    markPrice: toUnits(w.markPrice),
    ts: w.ts,
  };
}

/** Tolerate both bare arrays and `{key: [...]}` wrappers. */
function unwrapArray<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === 'object') {
    const inner = (value as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

// ---------------------------------------------------------------------------
// endpoints
// ---------------------------------------------------------------------------

export const api = {
  async markets(): Promise<MarketWire[]> {
    return unwrapArray<MarketWire>(await apiFetch<unknown>('/markets'), 'markets');
  },
  orderbook(marketId: string, depth = 20): Promise<OrderbookWire> {
    return apiFetch<OrderbookWire>(`/markets/${marketId}/orderbook?depth=${depth}`);
  },
  async trades(marketId: string, limit = 50): Promise<TradeWire[]> {
    return unwrapArray<TradeWire>(await apiFetch<unknown>(`/markets/${marketId}/trades?limit=${limit}`), 'trades');
  },
  async candles(marketId: string, interval: CandleInterval, limit = 200): Promise<CandleWire[]> {
    return unwrapArray<CandleWire>(
      await apiFetch<unknown>(`/markets/${marketId}/candles?interval=${interval}&limit=${limit}`),
      'candles',
    );
  },
  async account(): Promise<AccountWire> {
    const raw = await apiFetch<unknown>('/account');
    const obj = raw as Record<string, unknown> | null;
    if (obj !== null && typeof obj === 'object' && 'account' in obj && !('balances' in obj)) {
      return obj['account'] as AccountWire;
    }
    return raw as AccountWire;
  },
  faucet(): Promise<unknown> {
    return apiFetch<unknown>('/account/faucet', { method: 'POST' });
  },
  async openOrders(): Promise<OrderWire[]> {
    return unwrapArray<OrderWire>(await apiFetch<unknown>('/orders?status=open'), 'orders');
  },
  async fills(): Promise<FillWire[]> {
    return unwrapArray<FillWire>(await apiFetch<unknown>('/fills'), 'fills');
  },
  placeOrder(body: PlaceOrderBody): Promise<unknown> {
    return apiFetch<unknown>('/orders', { method: 'POST', body });
  },
  cancelOrder(orderId: string): Promise<unknown> {
    return apiFetch<unknown>(`/orders/${orderId}`, { method: 'DELETE' });
  },
  amendOrder(orderId: string, changes: { price?: string; qty?: string }): Promise<unknown> {
    return apiFetch<unknown>(`/orders/${orderId}`, { method: 'PATCH', body: changes });
  },
  setLeverage(marketId: string, leverage: number): Promise<unknown> {
    return apiFetch<unknown>('/account/leverage', { method: 'POST', body: { marketId, leverage } });
  },
  createTwap(body: TwapBody): Promise<unknown> {
    return apiFetch<unknown>('/twap', { method: 'POST', body });
  },
  async twaps(): Promise<TwapWire[]> {
    const raw = await apiFetch<unknown>('/twap');
    return Array.isArray(raw) ? (raw as TwapWire[]) : [];
  },
  cancelTwap(id: string): Promise<unknown> {
    return apiFetch<unknown>(`/twap/${id}`, { method: 'DELETE' });
  },
  createBracket(body: BracketBody): Promise<unknown> {
    return apiFetch<unknown>('/bracket', { method: 'POST', body });
  },
  async accountFunding(limit = 50): Promise<FundingPaymentWire[]> {
    return unwrapArray<FundingPaymentWire>(
      await apiFetch<unknown>(`/account/funding?limit=${limit}`),
      'funding',
    );
  },
  async accountPnl(): Promise<RealizedPnlSummaryWire> {
    return apiFetch<RealizedPnlSummaryWire>('/account/pnl');
  },
  async accountLiquidations(limit = 50): Promise<LiquidationHistoryWire[]> {
    return unwrapArray<LiquidationHistoryWire>(
      await apiFetch<unknown>(`/account/liquidations?limit=${limit}`),
      'liquidations',
    );
  },
};
