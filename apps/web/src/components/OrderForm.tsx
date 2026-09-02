import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { divRound, feeOn, fromUnits, mulDiv, mulUnits, roundToLot, roundToTick, toUnits } from '@dex/shared';
import type { OrderType, Side, TimeInForce } from '@dex/shared';
import { api, errorMessage } from '../lib/api.js';
import type { BracketBody, PlaceOrderBody, TriggerDirection, TwapBody } from '../lib/api.js';
import { formatAmount, formatQty } from '../lib/format.js';
import { useAuthStore } from '../lib/auth.js';
import { useBookStore } from '../stores/book.js';
import { useMarketStore } from '../stores/market.js';
import { useOrderFormStore } from '../stores/orderform.js';
import { useUserStore } from '../stores/user.js';
import { toast } from '../stores/toast.js';

const DECIMAL_INPUT_RE = /^\d+(\.\d+)?$/;

function parseUnitsSafe(s: string): bigint | null {
  const trimmed = s.trim();
  if (!DECIMAL_INPUT_RE.test(trimmed)) return null;
  try {
    return toUnits(trimmed);
  } catch {
    return null;
  }
}

const PCT_OPTIONS = [25, 50, 75, 100] as const;

/**
 * Effective price the engine will lock for a market order: best±5% slippage
 * bound, tick-aligned. Buys round up at +5%, sells round down at -5%. Sizing
 * (applyPct) and submission must use the SAME bound, otherwise a 100% market
 * order is sized against the raw best price but locked at the inflated bound →
 * INSUFFICIENT_BALANCE/MARGIN.
 */
export function marketBound(best: bigint, side: Side, tickSize: bigint): bigint {
  const raw = side === 'buy' ? mulDiv(best, 105n, 100n) : mulDiv(best, 95n, 100n);
  return roundToTick(raw, tickSize, side === 'buy' ? 'ceil' : 'floor');
}

export function OrderForm() {
  const market = useMarketStore((s) => s.byId[s.selectedId]);
  const bestAsk = useBookStore((s) => s.asks[0]?.price);
  const bestBid = useBookStore((s) => s.bids[0]?.price);
  const balances = useUserStore((s) => s.balances);
  const token = useAuthStore((s) => s.token);
  const priceStr = useOrderFormStore((s) => s.priceStr);
  const setPriceStr = useOrderFormStore((s) => s.setPriceStr);
  const queryClient = useQueryClient();

  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<OrderType>('limit');
  const [qtyStr, setQtyStr] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);
  const [triggerOn, setTriggerOn] = useState(false);
  const [triggerStr, setTriggerStr] = useState('');
  const [trailingOn, setTrailingOn] = useState(false);
  const [trailStr, setTrailStr] = useState('');
  const [twapOn, setTwapOn] = useState(false);
  const [twapSlices, setTwapSlices] = useState('5');
  const [twapMinutes, setTwapMinutes] = useState('30');
  const [bracketOn, setBracketOn] = useState(false);
  const [tpStr, setTpStr] = useState('');
  const [slStr, setSlStr] = useState('');
  // null = user hasn't overridden, so the direction follows the side default
  // (sell → below = stop-loss, buy → above = stop-buy).
  const [triggerDir, setTriggerDir] = useState<TriggerDirection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const leverageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const marketId = market?.id;
  useEffect(() => {
    setQtyStr('');
    setPriceStr('');
    setLeverage(1);
    setReduceOnly(false);
    setPostOnly(false);
    setTriggerOn(false);
    setTriggerStr('');
    setTriggerDir(null);
  }, [marketId, setPriceStr]);

  useEffect(
    () => () => {
      if (leverageTimer.current !== null) clearTimeout(leverageTimer.current);
    },
    [],
  );

  if (market === undefined) {
    return <div className="order-form dim">Loading market…</div>;
  }

  const isPerp = market.type === 'perp';
  const limitPrice = parseUnitsSafe(priceStr);
  const referencePrice =
    type === 'market' ? ((side === 'buy' ? bestAsk : bestBid) ?? null) : limitPrice;
  const qty = parseUnitsSafe(qtyStr);

  const notional = qty !== null && qty > 0n && referencePrice !== null ? mulUnits(qty, referencePrice) : null;
  const feeBps = type === 'limit' && postOnly ? market.makerFeeBps : market.takerFeeBps;
  const fee = notional !== null ? feeOn(notional, feeBps) : null;
  const margin = isPerp && notional !== null ? divRound(notional, BigInt(leverage), 'ceil') : null;

  const availableAsset = !isPerp && side === 'sell' ? market.base : market.quote;
  const available = balances[availableAsset]?.available ?? 0n;

  // Default: sell → stop-loss (below), buy → stop-buy / breakout (above). The
  // user can override via the selector; once overridden we keep their choice.
  const defaultTriggerDir: TriggerDirection = side === 'sell' ? 'below' : 'above';
  const effectiveTriggerDir = triggerDir ?? defaultTriggerDir;

  const applyPct = (pct: number): void => {
    if (!isPerp && side === 'sell') {
      const target = roundToLot((available * BigInt(pct)) / 100n, market.lotSize);
      setQtyStr(fromUnits(target));
      return;
    }
    if (referencePrice === null || referencePrice <= 0n) {
      toast.error(type === 'market' ? 'Order book data is unavailable' : 'Enter a price first');
      return;
    }
    // For market orders, the engine locks at the slippage-bound price (best±5%),
    // not the raw best. Size against that SAME bound so 100% never over-sizes.
    const priceForSizing =
      type === 'market' ? marketBound(referencePrice, side, market.tickSize) : referencePrice;
    if (priceForSizing <= 0n) return;
    // 100% market orders get a 0.1% safety haircut so tick/fee rounding can't
    // tip the locked cost just past the available balance.
    const budget =
      type === 'market' && pct === 100
        ? (available * 999n) / 1000n
        : (available * BigInt(pct)) / 100n;
    // per-unit cost: margin (notional/leverage for perps) + worst-case taker fee
    const lev = isPerp ? BigInt(leverage) : 1n;
    const perUnit = divRound(priceForSizing, lev, 'ceil') + feeOn(priceForSizing, market.takerFeeBps);
    if (perUnit <= 0n) return;
    const target = roundToLot(divRound(budget * 10n ** 8n, perUnit, 'floor'), market.lotSize);
    setQtyStr(fromUnits(target));
  };

  const onLeverageChange = (next: number): void => {
    setLeverage(next);
    if (token === null) return;
    if (leverageTimer.current !== null) clearTimeout(leverageTimer.current);
    leverageTimer.current = setTimeout(() => {
      leverageTimer.current = null;
      api.setLeverage(market.id, next).catch((e: unknown) => toast.error(errorMessage(e)));
    }, 400);
  };

  const submit = async (): Promise<void> => {
    if (token === null) {
      toast.error('Connect your wallet first');
      return;
    }
    if (qty === null || qty <= 0n) {
      toast.error('Enter a quantity');
      return;
    }

    // TWAP: slice the parent order over time (its own endpoint, mutually
    // exclusive with the trigger/trailing conditional path)
    if (twapOn) {
      const slices = Number(twapSlices);
      const minutes = Number(twapMinutes);
      if (!Number.isInteger(slices) || slices < 2) {
        toast.error('Number of slices must be at least 2');
        return;
      }
      if (!Number.isFinite(minutes) || minutes <= 0) {
        toast.error('Enter a duration in minutes');
        return;
      }
      if (type === 'limit' && (limitPrice === null || limitPrice <= 0n)) {
        toast.error('Enter a price');
        return;
      }
      const tbody: TwapBody = {
        marketId: market.id,
        side,
        totalQty: fromUnits(qty),
        durationMs: Math.round(minutes * 60_000),
        slices,
        type,
        ...(type === 'limit' && limitPrice !== null ? { limitPrice: fromUnits(limitPrice) } : {}),
        ...(isPerp ? { reduceOnly } : {}),
      };
      setSubmitting(true);
      try {
        await api.createTwap(tbody);
        toast.success('TWAP order started');
        setQtyStr('');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['twaps'] }),
          queryClient.invalidateQueries({ queryKey: ['account'] }),
        ]);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Bracket: a market entry plus an OCO take-profit / stop-loss pair (perp only)
    if (bracketOn) {
      if (!isPerp) {
        toast.error('Bracket orders are only available for perpetual futures');
        return;
      }
      const tp = parseUnitsSafe(tpStr);
      const sl = parseUnitsSafe(slStr);
      if (tp === null || tp <= 0n) {
        toast.error('Enter a take-profit price');
        return;
      }
      if (sl === null || sl <= 0n) {
        toast.error('Enter a stop-loss price');
        return;
      }
      const bbody: BracketBody = {
        marketId: market.id,
        side,
        qty: fromUnits(qty),
        takeProfitPrice: fromUnits(roundToTick(tp, market.tickSize, 'half-up')),
        stopLossPrice: fromUnits(roundToTick(sl, market.tickSize, 'half-up')),
      };
      setSubmitting(true);
      try {
        await api.createBracket(bbody);
        toast.success('Bracket order submitted');
        setQtyStr('');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['account'] }),
          queryClient.invalidateQueries({ queryKey: ['orders'] }),
        ]);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // A conditional order needs either a tick-valid trigger price, or — for a
    // trailing stop — a tick-valid trail distance (the engine seeds the stop).
    let triggerPrice: bigint | null = null;
    let trailDistance: bigint | null = null;
    if (triggerOn && trailingOn) {
      const parsed = parseUnitsSafe(trailStr);
      const dist = parsed === null ? null : roundToTick(parsed, market.tickSize, 'half-up');
      if (dist === null || dist <= 0n) {
        toast.error('Enter a trail distance');
        return;
      }
      trailDistance = dist;
    } else if (triggerOn) {
      const parsed = parseUnitsSafe(triggerStr);
      if (parsed === null || parsed <= 0n) {
        toast.error('Enter a trigger price');
        return;
      }
      triggerPrice = roundToTick(parsed, market.tickSize, 'half-up');
      if (triggerPrice <= 0n) {
        toast.error('Enter a trigger price');
        return;
      }
    }

    let price: bigint | null;
    let tif: TimeInForce;
    if (type === 'limit') {
      if (limitPrice === null || limitPrice <= 0n) {
        toast.error('Enter a price');
        return;
      }
      price = limitPrice;
      tif = 'GTC';
    } else if (triggerOn) {
      // stop-MARKET: send NO price — the engine derives the bound at activation.
      price = null;
      tif = 'IOC';
    } else {
      // market order: IOC with a best±5% slippage bound, tick-aligned
      const base = side === 'buy' ? bestAsk : bestBid;
      if (base === undefined || base <= 0n) {
        toast.error('Order book data is unavailable');
        return;
      }
      price = marketBound(base, side, market.tickSize);
      tif = 'IOC';
    }

    const body: PlaceOrderBody = {
      marketId: market.id,
      side,
      type,
      qty: fromUnits(qty),
      tif,
    };
    if (price !== null) body.price = fromUnits(price);
    if (type === 'limit' && !isPerp) body.postOnly = postOnly;
    if (isPerp) body.reduceOnly = reduceOnly;
    if (trailDistance !== null) {
      body.trailDistance = fromUnits(trailDistance);
      body.triggerDirection = effectiveTriggerDir;
    } else if (triggerPrice !== null) {
      body.triggerPrice = fromUnits(triggerPrice);
      body.triggerDirection = effectiveTriggerDir;
    }

    setSubmitting(true);
    try {
      await api.placeOrder(body);
      toast.success('Order submitted');
      setQtyStr('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['account'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['fills'] }),
      ]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="order-form" data-testid="order-form">
      <div className="order-form-head">
        <span className="order-form-title">Place Order</span>
        <span className="dim order-form-pair">
          {market.base}/{market.quote}
          <span className={`badge mini ${isPerp ? 'perp' : 'spot'}`}>{isPerp ? 'PERP' : 'USDC'}</span>
        </span>
      </div>

      <div className="side-toggle" role="group" aria-label="Order side">
        <button
          type="button"
          aria-pressed={side === 'buy'}
          className={`side-btn buy ${side === 'buy' ? 'active' : ''}`}
          onClick={() => setSide('buy')}
        >
          {isPerp ? 'Buy / Long' : 'Buy'}
        </button>
        <button
          type="button"
          aria-pressed={side === 'sell'}
          className={`side-btn sell ${side === 'sell' ? 'active' : ''}`}
          onClick={() => setSide('sell')}
        >
          {isPerp ? 'Sell / Short' : 'Sell'}
        </button>
      </div>

      <div className="tabs type-tabs" role="group" aria-label="Order type">
        <button
          type="button"
          aria-pressed={type === 'limit'}
          className={`tab ${type === 'limit' ? 'active' : ''}`}
          onClick={() => setType('limit')}
        >
          Limit
        </button>
        <button
          type="button"
          aria-pressed={type === 'market'}
          className={`tab ${type === 'market' ? 'active' : ''}`}
          onClick={() => setType('market')}
        >
          Market
        </button>
      </div>

      <label className="field">
        <span className="field-label dim">Price ({market.quote})</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder={type === 'market' ? 'Market' : 'Price'}
          value={type === 'market' ? '' : priceStr}
          disabled={type === 'market'}
          onChange={(e) => setPriceStr(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label dim">Quantity ({market.base})</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Quantity"
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
        />
      </label>

      <div className="pct-row">
        {PCT_OPTIONS.map((pct) => (
          <button key={pct} type="button" className="pct-btn" onClick={() => applyPct(pct)}>
            {pct}%
          </button>
        ))}
      </div>

      {isPerp ? (
        <>
          <label className="field">
            <span className="field-label dim">
              Leverage <strong className="accent">{leverage}x</strong>
            </span>
            <input
              type="range"
              min={1}
              max={market.maxLeverage}
              step={1}
              value={leverage}
              aria-label="Leverage"
              onChange={(e) => onLeverageChange(Number(e.target.value))}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
            <span>Reduce Only</span>
          </label>
        </>
      ) : (
        type === 'limit' && (
          <label className="check">
            <input type="checkbox" checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} />
            <span>Post Only</span>
          </label>
        )
      )}

      <div className="trigger-section">
        <label className="check trigger-toggle">
          <input
            type="checkbox"
            checked={twapOn}
            onChange={(e) => setTwapOn(e.target.checked)}
          />
          <span>TWAP Order</span>
        </label>
        {twapOn && (
          <div className="trigger-body">
            <label className="field">
              <span className="field-label dim">Slices</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Number of slices"
                value={twapSlices}
                onChange={(e) => setTwapSlices(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label dim">Duration (minutes)</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Duration in minutes"
                value={twapMinutes}
                onChange={(e) => setTwapMinutes(e.target.value)}
              />
            </label>
            <p className="trigger-hint dim">
              Executes in {twapSlices || '…'} slices over {twapMinutes || '…'} minutes
            </p>
          </div>
        )}
      </div>

      {isPerp && !twapOn && (
        <div className="trigger-section">
          <label className="check trigger-toggle">
            <input
              type="checkbox"
              checked={bracketOn}
              onChange={(e) => setBracketOn(e.target.checked)}
            />
            <span>Bracket (Market Entry + TP/SL)</span>
          </label>
          {bracketOn && (
            <div className="trigger-body">
              <label className="field">
                <span className="field-label dim">Take-Profit Price ({market.quote})</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Take-profit price"
                  value={tpStr}
                  onChange={(e) => setTpStr(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label dim">Stop-Loss Price ({market.quote})</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Stop-loss price"
                  value={slStr}
                  onChange={(e) => setSlStr(e.target.value)}
                />
              </label>
              <p className="trigger-hint dim">
                Enters at market and protects the position with two OCO exit orders
              </p>
            </div>
          )}
        </div>
      )}

      {!twapOn && !bracketOn && (
      <div className="trigger-section">
        <label className="check trigger-toggle">
          <input
            type="checkbox"
            checked={triggerOn}
            onChange={(e) => setTriggerOn(e.target.checked)}
          />
          <span>Trigger Order (Stop/Take Profit)</span>
        </label>
        {triggerOn && (
          <div className="trigger-body">
            <label className="check trailing-toggle">
              <input
                type="checkbox"
                checked={trailingOn}
                onChange={(e) => setTrailingOn(e.target.checked)}
              />
              <span>Trailing Stop</span>
            </label>
            {trailingOn ? (
              <label className="field">
                <span className="field-label dim">Trail Distance ({market.quote})</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Trail distance"
                  aria-label="Trail distance"
                  value={trailStr}
                  onChange={(e) => setTrailStr(e.target.value)}
                />
              </label>
            ) : (
              <label className="field">
                <span className="field-label dim">Trigger Price ({market.quote})</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Trigger price"
                  aria-label="Trigger price"
                  value={triggerStr}
                  onChange={(e) => setTriggerStr(e.target.value)}
                />
              </label>
            )}
            <div className="trigger-dir" role="group" aria-label="Trigger direction">
              <button
                type="button"
                aria-pressed={effectiveTriggerDir === 'above'}
                className={`trigger-dir-btn ${effectiveTriggerDir === 'above' ? 'active' : ''}`}
                onClick={() => setTriggerDir('above')}
              >
                Above ↑
              </button>
              <button
                type="button"
                aria-pressed={effectiveTriggerDir === 'below'}
                className={`trigger-dir-btn ${effectiveTriggerDir === 'below' ? 'active' : ''}`}
                onClick={() => setTriggerDir('below')}
              >
                Below ↓
              </button>
            </div>
            <p className="trigger-hint dim">
              {trailingOn
                ? `The stop trails the market ${effectiveTriggerDir === 'above' ? 'upward' : 'downward'} by ${trailStr || '…'}`
                : `The order activates when the market is ${effectiveTriggerDir === 'above' ? 'at or above' : 'at or below'} the trigger`}
            </p>
          </div>
        )}
      </div>
      )}

      <div className="summary">
        <div className="summary-row">
          <span className="dim">Available</span>
          <span data-testid="available-value">
            {formatQty(available)} {availableAsset}
          </span>
        </div>
        <div className="summary-row">
          <span className="dim">Order Value</span>
          <span data-testid="notional-value">
            {notional !== null ? `${formatAmount(notional)} ${market.quote}` : '–'}
          </span>
        </div>
        <div className="summary-row">
          <span className="dim">Fee</span>
          <span data-testid="fee-value">{fee !== null ? `${formatAmount(fee)} ${market.quote}` : '–'}</span>
        </div>
        {isPerp && (
          <div className="summary-row">
            <span className="dim">Required Margin</span>
            <span data-testid="margin-value">{margin !== null ? `${formatAmount(margin)} USDC` : '–'}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`submit-btn ${side}`}
        disabled={submitting}
        onClick={() => {
          void submit();
        }}
      >
        {side === 'buy' ? 'Buy' : 'Sell'} {market.base}
      </button>
    </div>
  );
}
