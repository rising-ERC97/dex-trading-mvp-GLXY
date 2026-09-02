import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { feeOn, mulUnits, toUnits } from '@dex/shared';
import { OrderForm } from '../src/components/OrderForm.js';
import { Toasts } from '../src/components/Toasts.js';
import { formatAmount } from '../src/lib/format.js';
import { useAuthStore } from '../src/lib/auth.js';
import { useBookStore } from '../src/stores/book.js';
import { useMarketStore } from '../src/stores/market.js';
import { useUserStore } from '../src/stores/user.js';
import { PERP_BTC, SPOT_BTC, renderWithQuery, resetStores, seedMarkets } from './helpers.js';

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response;
}

function errJson(status: number, code: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message: code } }),
  } as unknown as Response;
}

function seedSpot(): void {
  seedMarkets([SPOT_BTC], 'BTC-USDC');
  useBookStore.setState({
    marketId: 'BTC-USDC',
    bids: [{ price: toUnits('99000'), qty: toUnits('5') }],
    asks: [{ price: toUnits('100000'), qty: toUnits('5') }],
    seq: 1,
    trades: [],
  });
  useUserStore.setState({
    balances: {
      USDC: { available: toUnits('1000000'), locked: 0n },
      BTC: { available: toUnits('2'), locked: 0n },
    },
  });
  useAuthStore.setState({ address: '0xabc', token: 'test-token', status: 'connected' });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStores();
  fetchMock = vi.fn(async () => okJson({ order: { id: 'o1' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrderForm validation', () => {
  it('requires a quantity before submitting', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));
    expect(await screen.findByText('Enter a quantity')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a price for limit orders', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));
    expect(await screen.findByText('Enter a price')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the price input in market mode with Market placeholder', () => {
    seedSpot();
    renderWithQuery(<OrderForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    const priceInput = screen.getByPlaceholderText('Market');
    expect(priceInput).toBeDisabled();
  });
});

describe('OrderForm percentage buttons', () => {
  it('derives buy quantity from quote balance net of taker fee', () => {
    seedSpot();
    renderWithQuery(<OrderForm />);
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: '50%' }));
    // budget 500,000 USDC / (100,000 + 100 fee) per BTC → 4.99500499 → lot 0.0001 → 4.995
    expect(screen.getByPlaceholderText('Quantity')).toHaveValue('4.995');
    fireEvent.click(screen.getByRole('button', { name: '100%' }));
    expect(screen.getByPlaceholderText('Quantity')).toHaveValue('9.99');
  });

  it('derives sell quantity from base balance', () => {
    seedSpot();
    renderWithQuery(<OrderForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    fireEvent.click(screen.getByRole('button', { name: '75%' }));
    expect(screen.getByPlaceholderText('Quantity')).toHaveValue('1.5');
  });
});

describe('OrderForm summary', () => {
  it('shows notional and fee matching shared feeOn math', () => {
    seedSpot();
    renderWithQuery(<OrderForm />);
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '100000' } });
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '2' } });
    const notional = mulUnits(toUnits('2'), toUnits('100000'));
    const fee = feeOn(notional, SPOT_BTC.takerFeeBps);
    expect(screen.getByTestId('notional-value')).toHaveTextContent(`${formatAmount(notional)} USDC`);
    expect(screen.getByTestId('fee-value')).toHaveTextContent(`${formatAmount(fee)} USDC`);
    expect(screen.getByTestId('notional-value')).toHaveTextContent('200,000 USDC');
    expect(screen.getByTestId('fee-value')).toHaveTextContent('200 USDC');
  });

  it('shows perp required margin = notional / leverage', () => {
    seedMarkets([PERP_BTC], 'BTC-PERP');
    useBookStore.setState({
      marketId: 'BTC-PERP',
      bids: [{ price: toUnits('99'), qty: toUnits('10') }],
      asks: [{ price: toUnits('100'), qty: toUnits('10') }],
      seq: 1,
      trades: [],
    });
    useUserStore.setState({ balances: { USDC: { available: toUnits('10000'), locked: 0n } } });
    useAuthStore.setState({ address: '0xabc', token: 'test-token', status: 'connected' });
    renderWithQuery(<OrderForm />);

    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '10' } });
    expect(screen.getByTestId('margin-value')).toHaveTextContent('1,000 USDC');

    fireEvent.change(screen.getByLabelText('Leverage'), { target: { value: '4' } });
    expect(screen.getByTestId('margin-value')).toHaveTextContent('250 USDC');
    expect(screen.getByRole('checkbox', { name: 'Reduce Only' })).toBeInTheDocument();
  });
});

describe('OrderForm submission', () => {
  it('POSTs the exact limit order JSON body with Bearer auth', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '100000' } });
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));

    expect(await screen.findByText('Order submitted')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/orders');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({
      marketId: 'BTC-USDC',
      side: 'buy',
      type: 'limit',
      price: '100000',
      qty: '1.5',
      tif: 'GTC',
      postOnly: false,
    });
  });

  it('submits market orders as IOC with a best±5% price bound', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));

    expect(await screen.findByText('Order submitted')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      marketId: 'BTC-USDC',
      side: 'buy',
      type: 'market',
      price: '105000', // best ask 100,000 × 1.05
      qty: '1',
      tif: 'IOC',
    });
  });

  it('submits a stop-MARKET sell with triggerPrice/triggerDirection and NO price', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trigger Order (Stop/Take Profit)' }));
    fireEvent.change(screen.getByLabelText('Trigger price'), { target: { value: '90000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sell BTC' }));

    expect(await screen.findByText('Order submitted')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      marketId: 'BTC-USDC',
      side: 'sell',
      type: 'market',
      qty: '0.5',
      tif: 'IOC',
      triggerPrice: '90000',
      triggerDirection: 'below', // sell default = stop-loss
    });
  });

  it('submits a stop-LIMIT buy with a tick-aligned trigger and above direction', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '100000' } });
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trigger Order (Stop/Take Profit)' }));
    // BTC tick size is 1, so 99000.4 rounds to 99000
    fireEvent.change(screen.getByLabelText('Trigger price'), { target: { value: '99000.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));

    expect(await screen.findByText('Order submitted')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      marketId: 'BTC-USDC',
      side: 'buy',
      type: 'limit',
      price: '100000',
      qty: '1',
      tif: 'GTC',
      postOnly: false,
      triggerPrice: '99000', // tick-aligned
      triggerDirection: 'above', // buy default
    });
  });

  it('submits a trailing stop-MARKET sell with trailDistance and NO triggerPrice (gap #4)', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trigger Order (Stop/Take Profit)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trailing Stop' }));
    fireEvent.change(screen.getByLabelText('Trail distance'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sell BTC' }));

    expect(await screen.findByText('Order submitted')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      marketId: 'BTC-USDC',
      side: 'sell',
      type: 'market',
      qty: '0.5',
      tif: 'IOC',
      trailDistance: '500',
      triggerDirection: 'below', // sell default = trailing stop-loss
    });
  });

  it('submits a perp bracket (market entry + TP/SL) to /api/bracket (gap #6)', async () => {
    seedMarkets([PERP_BTC], 'BTC-PERP');
    useUserStore.setState({ balances: { USDC: { available: toUnits('100000'), locked: 0n } } });
    useAuthStore.setState({ address: '0xabc', token: 'test-token', status: 'connected' });
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bracket (Market Entry + TP/SL)' }));
    fireEvent.change(screen.getByLabelText('Take-profit price'), { target: { value: '110' } });
    fireEvent.change(screen.getByLabelText('Stop-loss price'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));

    expect(await screen.findByText('Bracket order submitted')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/bracket');
    expect(JSON.parse(init.body as string)).toEqual({
      marketId: 'BTC-PERP',
      side: 'buy',
      qty: '1',
      takeProfitPrice: '110',
      stopLossPrice: '90',
    });
  });

  it('submits a TWAP parent order to /api/twap with slices + duration (gap #3)', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'TWAP Order' }));
    fireEvent.change(screen.getByLabelText('Number of slices'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Duration in minutes'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));

    expect(await screen.findByText('TWAP order started')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/twap');
    expect(JSON.parse(init.body as string)).toEqual({
      marketId: 'BTC-USDC',
      side: 'buy',
      totalQty: '6',
      durationMs: 1_800_000, // 30 min
      slices: 3,
      type: 'market',
    });
  });

  it('rejects a trailing stop with no trail distance', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trigger Order (Stop/Take Profit)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trailing Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));
    expect(await screen.findByText('Enter a trail distance')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a trigger order with no trigger price', async () => {
    seedSpot();
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trigger Order (Stop/Take Profit)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));
    expect(await screen.findByText('Enter a trigger price')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps API error codes to English toasts', async () => {
    seedSpot();
    fetchMock.mockResolvedValueOnce(errJson(422, 'INSUFFICIENT_BALANCE'));
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '100000' } });
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));
    expect(await screen.findByText('Insufficient balance')).toBeInTheDocument();
  });

  it('requires a connected wallet', async () => {
    seedSpot();
    useAuthStore.setState({ address: null, token: null, status: 'idle' });
    renderWithQuery(
      <>
        <OrderForm />
        <Toasts />
      </>,
    );
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '100000' } });
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy BTC' }));
    expect(await screen.findByText('Connect your wallet first')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
