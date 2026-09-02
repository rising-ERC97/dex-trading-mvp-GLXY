import { describe, it, expect, afterEach } from 'vitest';
import { makeApp } from './helpers.js';

describe('/api/ops/summary', () => {
  /** @type {Awaited<ReturnType<typeof makeApp>> | null} */
  let t = null;
  afterEach(async () => {
    if (t) await t.stop();
    t = null;
  });

  it('returns house balances, stale list, and liquidations tape', async () => {
    t = await makeApp();
    const res = await t.app.inject({ method: 'GET', url: '/api/ops/summary' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.seq).toBeTypeOf('number');
    expect(body.marketsTotal).toBe(2);
    expect(Array.isArray(body.staleMarkets)).toBe(true);
    expect(Array.isArray(body.fees)).toBe(true);
    expect(Array.isArray(body.clearing)).toBe(true);
    expect(Array.isArray(body.liquidations)).toBe(true);
    expect(Array.isArray(body.funding)).toBe(true);
    expect(body.ordersLive).toBeTypeOf('number');
    expect(body.wsConnections).toBeTypeOf('number');
  });

  it('includes stale markets and surfaces stale on /api/markets', async () => {
    t = await makeApp();
    t.svc.hub.setFeedStale('TBT-USDC', true);
    const ops = (await t.app.inject({ method: 'GET', url: '/api/ops/summary' })).json();
    expect(ops.staleMarkets).toContain('TBT-USDC');

    const markets = (await t.app.inject({ method: 'GET', url: '/api/markets' })).json();
    expect(markets.every((m) => typeof m.stale === 'boolean')).toBe(true);
    expect(markets.find((m) => m.id === 'TBT-USDC').stale).toBe(true);
  });
});
