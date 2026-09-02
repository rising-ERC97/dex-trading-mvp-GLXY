import { parseProm } from './lib/format.js';

async function jsonOrNull(url) {
  const r = await fetch(url);
  return r.ok ? r.json() : null;
}

async function jsonStatus(url) {
  const r = await fetch(url);
  try {
    const body = await r.json();
    return { ok: r.ok, body, status: r.status };
  } catch {
    return { ok: r.ok, body: null, status: r.status };
  }
}

function normalizeMarkets(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.markets)) return payload.markets;
  return [];
}

function opsFallback(health, prom, markets, feesFallback) {
  return {
    seq: health.seq,
    ordersLive: prom.dex_orders_live,
    ordersTerminalCache: prom.dex_orders_terminal_cache,
    wsConnections: prom.dex_ws_connections,
    marketsTotal: markets.length,
    staleMarkets: markets.filter((m) => m.stale).map((m) => m.id),
    fees: feesFallback ?? [],
    clearing: [],
    liquidations: [],
    funding: markets
      .filter((m) => m.funding)
      .map((m) => Object.assign({ marketId: m.id }, m.funding)),
  };
}

/** Fetch all operator snapshots for one refresh cycle. */
export async function fetchDashboard() {
  const [health, ready, metricsText, opsRaw, feesFallback, marketsPayload, pressure] =
    await Promise.all([
      fetch('/api/health').then((r) => r.json()),
      jsonStatus('/api/ready'),
      fetch('/api/metrics').then((r) => r.text()),
      jsonOrNull('/api/ops/summary'),
      jsonOrNull('/api/stats/fees').then((v) => v ?? []),
      fetch('/api/markets').then((r) => r.json()),
      jsonStatus('/api/pressure'),
    ]);

  const prom = parseProm(metricsText);
  const markets = normalizeMarkets(marketsPayload);
  const ops = opsRaw ?? opsFallback(health, prom, markets, feesFallback);

  return { health, ready, prom, ops, markets, pressure };
}
