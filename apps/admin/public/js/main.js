/**
 * DEX Ops console entry — native ES modules, no bundler.
 *
 * public/
 *   index.html          shell (header / nav / mount / footer)
 *   js/main.js          boot + refresh loop
 *   js/api.js           data fetching
 *   js/state.js         shared state
 *   js/router.js        hash routing
 *   js/lib/*            format / dom / table helpers
 *   js/views/*          one module per screen (template + render)
 */
import { fetchDashboard } from './api.js';
import { state } from './state.js';
import { createRouter } from './router.js';
import { $, setStatus } from './lib/dom.js';
import { overviewView } from './views/overview.js';
import { feedsView } from './views/feeds.js';
import { riskView } from './views/risk.js';
import { marketsView } from './views/markets.js';

const REFRESH_MS = 15_000;

const viewList = [overviewView, feedsView, riskView, marketsView];
const views = Object.fromEntries(viewList.map((v) => [v.id, v]));

function mountViews() {
  const root = $('views');
  if (!root) throw new Error('#views mount point missing');
  root.innerHTML = viewList
    .map((v) => `<section class="view" id="view-${v.id}" hidden>${v.template}</section>`)
    .join('');
  for (const v of viewList) v.bind?.();
}

function updateStaleBanner(ops) {
  const banner = $('stale-banner');
  if (!banner) return;
  const stale = Array.isArray(ops.staleMarkets) ? ops.staleMarkets.length : 0;
  if (stale > 0) {
    const sample = ops.staleMarkets.slice(0, 6).join(', ');
    const more = stale > 6 ? ` +${stale - 6} more` : '';
    banner.hidden = false;
    banner.textContent = `${stale} market feed(s) stale (${sample}${more}) — books may be taken down until the venue recovers.`;
    banner.onclick = () => {
      location.hash = '#feeds';
    };
    banner.style.cursor = 'pointer';
  } else {
    banner.hidden = true;
    banner.textContent = '';
    banner.onclick = null;
    banner.style.cursor = '';
  }
}

async function load() {
  setStatus('Refreshing…');
  try {
    const data = await fetchDashboard();
    state.ops = data.ops;
    state.markets = data.markets;
    updateStaleBanner(data.ops);
    overviewView.update(data);
    views[state.view]?.render();
    const stale = Array.isArray(data.ops.staleMarkets) ? data.ops.staleMarkets.length : 0;
    const healthy = Boolean(data.health.ok) && data.ready.ok && stale === 0;
    setStatus(`Updated ${new Date().toLocaleTimeString()}`, healthy ? 'ok' : 'bad');
  } catch (err) {
    setStatus(`Failed: ${err?.message ?? String(err)}`, 'bad');
  }
}

function boot() {
  mountViews();
  const router = createRouter(views);
  $('refresh')?.addEventListener('click', () => load());
  router.syncFromHash();
  load();
  setInterval(load, REFRESH_MS);
}

boot();
