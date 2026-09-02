import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Market, TickerData } from '../lib/api.js';
import { formatPct, formatPrice } from '../lib/format.js';
import { useMarketStore } from '../stores/market.js';

type FilterTab = 'all' | 'spot' | 'perp';

const ROW_PX = 44;
/** below this, plain render (cheap, and keeps jsdom tests measurable) */
const VIRTUALIZE_OVER = 40;

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'spot', label: 'USDC' },
  { key: 'perp', label: 'PERP' },
];

function matches(market: Market, query: string): boolean {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  return (
    market.base.toLowerCase().includes(q) ||
    market.id.toLowerCase().includes(q) ||
    (market.englishName ?? '').toLowerCase().includes(q)
  );
}

function MarketRow({
  m,
  ticker,
  selected,
  onSelect,
  style,
  compact,
}: {
  m: Market;
  ticker: TickerData | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const cls = ticker === undefined ? '' : ticker.change24h > 0n ? 'pos' : ticker.change24h < 0n ? 'neg' : '';
  return (
    <button
      type="button"
      className={`market-row ${compact === true ? 'compact' : ''} ${selected ? 'selected' : ''}`}
      data-testid="market-row"
      style={style}
      onClick={() => onSelect(m.id)}
    >
      <span className="market-row-symbol">
        {m.base}/{m.quote}
        <span className={`badge mini ${m.type === 'perp' ? 'perp' : 'spot'}`}>
          {m.type === 'perp' ? 'PERP' : 'USDC'}
        </span>
      </span>
      {compact !== true && <span className="dim market-row-name">{m.englishName ?? m.base}</span>}
      <span className="market-row-price">
        {ticker !== undefined ? formatPrice(ticker.price, m.tickSize) : '–'}
      </span>
      <span className={`market-row-change ${cls}`}>{ticker !== undefined ? formatPct(ticker.change24h) : ''}</span>
    </button>
  );
}

/** Virtualized list for the full 191+ market universe (only visible rows mount). */
function VirtualMarketList({
  rows,
  tickers,
  selectedId,
  onSelect,
  compact,
}: {
  rows: Market[];
  tickers: Record<string, TickerData>;
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    overscan: 8,
  });
  return (
    <div className="market-list" ref={scrollRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const m = rows[vi.index]!;
          return (
            <MarketRow
              key={m.id}
              m={m}
              ticker={tickers[m.id]}
              selected={m.id === selectedId}
              onSelect={onSelect}
              compact={compact}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function MarketBrowser({
  compact,
  autoFocus,
  showClose,
  onClose,
  onSelect,
  testId,
}: {
  compact?: boolean;
  autoFocus?: boolean;
  showClose?: boolean;
  onClose?: () => void;
  onSelect: (id: string) => void;
  testId?: string;
}) {
  const markets = useMarketStore((s) => s.markets);
  const tickers = useMarketStore((s) => s.tickers);
  const selectedId = useMarketStore((s) => s.selectedId);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');

  const filtered = useMemo(
    () => markets.filter((m) => (tab === 'all' || m.type === tab) && matches(m, query)),
    [markets, tab, query],
  );

  return (
    <div className={`market-browser ${compact === true ? 'compact' : ''}`} data-testid={testId}>
      <div className="market-browser-head">
        <input
          type="text"
          autoFocus={autoFocus === true}
          placeholder="Search markets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showClose === true && onClose !== undefined && (
          <button type="button" className="close-btn dim" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="tabs" role="group" aria-label="Market filter">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="market-list">
          <div className="empty dim">No markets found</div>
        </div>
      ) : filtered.length > VIRTUALIZE_OVER ? (
        <VirtualMarketList
          rows={filtered}
          tickers={tickers}
          selectedId={selectedId}
          onSelect={onSelect}
          compact={compact}
        />
      ) : (
        <div className="market-list">
          {filtered.map((m) => (
            <MarketRow
              key={m.id}
              m={m}
              ticker={tickers[m.id]}
              selected={m.id === selectedId}
              onSelect={onSelect}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Persistent left-rail market list (desktop). */
export function Watchlist() {
  const selectMarket = useMarketStore((s) => s.selectMarket);
  const marketCount = useMarketStore((s) => s.markets.length);
  return (
    <aside className="watchlist-area panel" aria-label="Watchlist">
      <div className="watchlist-title">
        <span>Watchlist</span>
        <span className="dim watchlist-count">{marketCount}</span>
      </div>
      <MarketBrowser compact testId="watchlist" onSelect={selectMarket} />
    </aside>
  );
}

/** Modal market picker — used on narrow viewports via the TopBar market button. */
export function MarketSelector() {
  const open = useMarketStore((s) => s.selectorOpen);
  const setOpen = useMarketStore((s) => s.setSelectorOpen);
  const selectMarket = useMarketStore((s) => s.selectMarket);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  if (!open) return null;

  const close = (): void => {
    setOpen(false);
    restoreFocusRef.current?.focus?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = modalRef.current;
    if (root === null) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-overlay" data-testid="market-selector" onClick={close}>
      <div
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select market"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <MarketBrowser
          autoFocus
          showClose
          onClose={close}
          testId="market-selector-body"
          onSelect={selectMarket}
        />
      </div>
    </div>
  );
}
