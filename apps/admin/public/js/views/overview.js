import { state } from '../state.js';
import { $, fillDl, setBadge } from '../lib/dom.js';
import { esc, fmtNum } from '../lib/format.js';

function pressureRows(body, ok, status) {
  if (!body || typeof body !== 'object') {
    return [{ label: 'status', value: String(status), cls: ok ? 'ok' : 'bad' }];
  }
  const rows = [{ label: 'http', value: ok ? 'ok' : `shed (${status})`, cls: ok ? 'ok' : 'bad' }];
  for (const k of Object.keys(body)) {
    if (k === 'error') continue;
    const cls = k === 'status' ? (String(body[k]) === 'ok' ? 'ok' : 'bad') : '';
    rows.push({ label: k, value: String(body[k]), cls });
  }
  return rows;
}

function renderKpis(prom, ops, stale) {
  const strip = $('kpi');
  if (!strip) return;
  const items = [
    { label: 'Engine seq', value: ops?.seq ?? prom.dex_engine_seq ?? '—' },
    { label: 'WS clients', value: ops?.wsConnections ?? prom.dex_ws_connections ?? '—' },
    { label: 'Live orders', value: ops?.ordersLive ?? prom.dex_orders_live ?? '—' },
    { label: 'Markets', value: ops?.marketsTotal ?? state.markets.length },
    { label: 'Stale feeds', value: String(stale), cls: stale > 0 ? 'bad' : 'ok' },
  ];
  strip.innerHTML = items
    .map(
      (item) =>
        `<div class="kpi"><span class="kpi-label">${esc(item.label)}</span><span class="kpi-value${item.cls ? ` ${item.cls}` : ''}">${esc(item.value)}</span></div>`,
    )
    .join('');
}

let lastParts = null;

export const overviewView = {
  id: 'overview',

  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Operator console</p>
        <h1 class="page-title">System status</h1>
        <p class="sub">Live health, readiness, activity counters, and pressure from the trading API.</p>
      </div>
    </div>
    <section class="kpi-strip" id="kpi" aria-label="Key metrics"></section>
    <section class="grid" id="stats">
      <article class="card" id="sec-health">
        <div class="card-head">
          <h2>Health</h2>
          <span class="card-badge" id="health-badge">—</span>
        </div>
        <dl id="health"></dl>
      </article>
      <article class="card" id="sec-ready">
        <div class="card-head">
          <h2>Ready</h2>
          <span class="card-badge" id="ready-badge">—</span>
        </div>
        <dl id="ready"></dl>
      </article>
      <article class="card" id="sec-pressure">
        <div class="card-head">
          <h2>Pressure</h2>
          <span class="card-badge" id="pressure-badge">—</span>
        </div>
        <dl id="pressure"></dl>
      </article>
      <article class="card" id="sec-activity">
        <div class="card-head">
          <h2>Activity</h2>
        </div>
        <dl id="activity"></dl>
      </article>
      <article class="card span-2" id="sec-metrics">
        <div class="card-head">
          <h2>Process</h2>
        </div>
        <dl id="metrics" class="metrics-dl"></dl>
      </article>
    </section>
  `,

  update(parts) {
    lastParts = parts;
    if (state.view === 'overview') this.render();
  },

  render() {
    if (!lastParts) return;
    const { health, ready, prom, pressure, ops } = lastParts;
    const stale =
      (ops?.staleMarkets ? ops.staleMarkets.length : 0) || Number(prom.dex_feed_stale_markets || 0);

    fillDl($('health'), [
      { label: 'ok', value: String(health.ok), cls: health.ok ? 'ok' : 'bad' },
      { label: 'seq', value: String(health.seq ?? '—') },
    ]);
    setBadge('health-badge', health.ok ? 'ok' : 'down', health.ok ? 'ok' : 'bad');

    const readyBody = ready.body || {};
    fillDl($('ready'), [
      {
        label: 'ready',
        value: ready.ok ? 'yes' : `no (${ready.status})`,
        cls: ready.ok ? 'ok' : 'bad',
      },
      { label: 'tickers warm', value: String(readyBody.tickersWarm ?? '—') },
      { label: 'perp marks', value: String(readyBody.perpMarks ?? '—') },
      { label: 'seq', value: String(readyBody.seq ?? '—') },
    ]);
    setBadge('ready-badge', ready.ok ? 'ready' : 'not ready', ready.ok ? 'ok' : 'bad');

    fillDl($('pressure'), pressureRows(pressure.body, pressure.ok, pressure.status));
    setBadge('pressure-badge', pressure.ok ? 'ok' : 'shed', pressure.ok ? 'ok' : 'bad');

    fillDl($('activity'), [
      { label: 'orders accepted', value: fmtNum(prom.dex_orders_accepted_total, 0) },
      { label: 'orders rejected', value: fmtNum(prom.dex_orders_rejected_total, 0) },
      { label: 'trades executed', value: fmtNum(prom.dex_trades_executed_total, 0) },
      {
        label: 'terminal cache',
        value:
          ops?.ordersTerminalCache != null
            ? fmtNum(ops.ordersTerminalCache, 0)
            : fmtNum(prom.dex_orders_terminal_cache, 0),
      },
    ]);

    const heapUsed = prom.process_resident_memory_bytes
      ? fmtNum(prom.process_resident_memory_bytes / (1024 * 1024), 1)
      : prom.nodejs_heap_size_used_bytes
        ? fmtNum(prom.nodejs_heap_size_used_bytes / (1024 * 1024), 1)
        : '—';

    fillDl($('metrics'), [
      { label: 'heap used (MB)', value: heapUsed },
      {
        label: 'heap total (MB)',
        value: prom.nodejs_heap_size_total_bytes
          ? fmtNum(prom.nodejs_heap_size_total_bytes / (1024 * 1024), 1)
          : '—',
      },
      {
        label: 'event loop lag (s)',
        value:
          prom.nodejs_eventloop_lag_seconds != null
            ? fmtNum(prom.nodejs_eventloop_lag_seconds, 4)
            : '—',
      },
      {
        label: 'active handles',
        value: prom.nodejs_active_handles != null ? fmtNum(prom.nodejs_active_handles, 0) : '—',
      },
      { label: 'engine seq', value: fmtNum(prom.dex_engine_seq, 0) },
      { label: 'ws connections', value: fmtNum(prom.dex_ws_connections, 0) },
    ]);

    renderKpis(prom, ops, stale);
  },
};
