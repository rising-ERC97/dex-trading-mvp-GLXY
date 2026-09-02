import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MarketSelector, Watchlist } from '../src/components/MarketSelector.js';
import { useMarketStore } from '../src/stores/market.js';
import { PERP_BTC, SPOT_BTC, SPOT_ETH, resetStores, seedMarkets, ticker } from './helpers.js';

function seedSelector(): void {
  seedMarkets([SPOT_BTC, SPOT_ETH, PERP_BTC], 'BTC-USDC');
  useMarketStore.setState({
    selectorOpen: true,
    tickers: {
      'BTC-USDC': ticker('BTC-USDC', '67500', '0.05'),
      'ETH-USDC': ticker('ETH-USDC', '3500', '-0.02'),
      'BTC-PERP': ticker('BTC-PERP', '68000', '0.01'),
    },
  });
}

beforeEach(() => {
  resetStores();
  seedSelector();
});

describe('Watchlist', () => {
  it('lists all markets with live price and colored 24h change', () => {
    render(<Watchlist />);
    const rows = screen.getAllByTestId('market-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('67,500');
    expect(rows[0]).toHaveTextContent('+5.00%');
    expect(rows[1]).toHaveTextContent('-2.00%');
  });

  it('searches by English name across spot and perp', () => {
    render(<Watchlist />);
    fireEvent.change(screen.getByPlaceholderText('Search markets...'), { target: { value: 'bitcoin' } });
    const rows = screen.getAllByTestId('market-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('BTC/USDC');
    expect(rows[1]).toHaveTextContent('BTC/USDC');
  });

  it('searches by a second English name', () => {
    render(<Watchlist />);
    fireEvent.change(screen.getByPlaceholderText('Search markets...'), { target: { value: 'ethereum' } });
    const rows = screen.getAllByTestId('market-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('ETH/USDC');
  });

  it('searches by symbol across spot and perp', () => {
    render(<Watchlist />);
    fireEvent.change(screen.getByPlaceholderText('Search markets...'), { target: { value: 'btc' } });
    expect(screen.getAllByTestId('market-row')).toHaveLength(2);
  });

  it('filters by USDC / PERP / All tabs', () => {
    render(<Watchlist />);
    fireEvent.click(screen.getByRole('button', { name: 'USDC' }));
    expect(screen.getAllByTestId('market-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'PERP' }));
    expect(screen.getAllByTestId('market-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByTestId('market-row')).toHaveLength(3);
  });

  it('selects a market on row click', () => {
    render(<Watchlist />);
    fireEvent.click(screen.getByRole('button', { name: 'PERP' }));
    fireEvent.click(screen.getAllByTestId('market-row')[0]!);
    expect(useMarketStore.getState().selectedId).toBe('BTC-PERP');
  });
});

describe('MarketSelector modal', () => {
  it('selects a market and closes on row click', () => {
    render(<MarketSelector />);
    fireEvent.click(screen.getByRole('button', { name: 'PERP' }));
    fireEvent.click(screen.getAllByTestId('market-row')[0]!);
    expect(useMarketStore.getState().selectedId).toBe('BTC-PERP');
    expect(useMarketStore.getState().selectorOpen).toBe(false);
  });
});
