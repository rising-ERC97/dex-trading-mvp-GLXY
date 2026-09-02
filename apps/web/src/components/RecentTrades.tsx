import { formatPrice, formatQty, formatTime } from '../lib/format.js';
import { useBookStore } from '../stores/book.js';
import { useMarketStore } from '../stores/market.js';

export function RecentTrades() {
  const trades = useBookStore((s) => s.trades);
  const market = useMarketStore((s) => s.byId[s.selectedId]);
  const tickSize = market?.tickSize ?? 1n;

  return (
    <div className="trades" data-testid="recent-trades">
      <div className="ob-head">
        <span>Price</span>
        <span>Quantity</span>
        <span>Time</span>
      </div>
      <div className="trades-body">
        {trades.length === 0 ? (
          <div className="empty dim">No trade history</div>
        ) : (
          trades.map((t) => (
            <div key={t.id} className="trade-row">
              <span className={t.takerSide === 'buy' ? 'pos' : 'neg'}>{formatPrice(t.price, tickSize)}</span>
              <span className="ob-qty">{formatQty(t.qty)}</span>
              <span className="dim">{formatTime(t.ts)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
