import { useState } from 'react';
import { fromUnits } from '@dex/shared';
import { OrderBook } from './OrderBook.js';
import { RecentTrades } from './RecentTrades.js';
import { useBookStore } from '../stores/book.js';
import { useMarketStore } from '../stores/market.js';
import { useOrderFormStore } from '../stores/orderform.js';

export function OrderBookPanel() {
  const [tab, setTab] = useState<'book' | 'trades'>('book');
  const market = useMarketStore((s) => s.byId[s.selectedId]);
  const bids = useBookStore((s) => s.bids);
  const asks = useBookStore((s) => s.asks);
  const stale = useBookStore((s) => s.stale);
  const setPriceStr = useOrderFormStore((s) => s.setPriceStr);

  const showStale = tab === 'book' && stale;

  return (
    <div className={`book-panel${showStale ? ' stale' : ''}`}>
      <div className="tabs" role="tablist" aria-label="Order Book and Trades">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'book'}
          className={`tab ${tab === 'book' ? 'active' : ''}`}
          onClick={() => setTab('book')}
        >
          Order Book
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'trades'}
          className={`tab ${tab === 'trades' ? 'active' : ''}`}
          onClick={() => setTab('trades')}
        >
          Trades
        </button>
        {showStale && (
          <span className="stale-badge" data-testid="orderbook-stale" role="status" title="Data is delayed">
            Data Delayed
          </span>
        )}
      </div>
      {tab === 'book' ? (
        <OrderBook
          tickSize={market?.tickSize ?? 1n}
          bids={bids}
          asks={asks}
          onPriceClick={(price) => setPriceStr(fromUnits(price))}
        />
      ) : (
        <RecentTrades />
      )}
    </div>
  );
}
