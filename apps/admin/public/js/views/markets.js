import { state } from '../state.js';
import { $ } from '../lib/dom.js';
import { esc, fmtNum, fmtPct, fundingRate, tickerLast } from '../lib/format.js';
import { bindSort, sortBy, th } from '../lib/table.js';

export const marketsView = {
  id: 'markets',

  template: `
    <div class="page-head row">
      <div>
        <p class="eyebrow">Universe</p>
        <h1 class="page-title">Markets</h1>
        <p class="sub">Search spot and perp markets with mark, funding, and feed status.</p>
      </div>
      <div class="toolbar">
        <label class="field grow">
          <span>Search</span>
          <input id="markets-search" type="search" placeholder="BTC, ETH-PERP…" autocomplete="off" />
        </label>
        <label class="field">
          <span>Type</span>
          <select id="markets-type">
            <option value="all">All</option>
            <option value="spot">Spot</option>
            <option value="perp">Perp</option>
          </select>
        </label>
      </div>
    </div>
    <div class="table-panel">
      <div class="table-meta" id="markets-meta"></div>
      <div class="table-wrap" id="markets-table"></div>
    </div>
  `,

  bind() {
    $('markets-search')?.addEventListener('input', (e) => {
      state.marketsSearch = e.target.value;
      this.render();
    });
    $('markets-type')?.addEventListener('change', (e) => {
      state.marketsType = e.target.value;
      this.render();
    });
    bindSort('markets-table', state.marketsSort, () => this.render());
  },

  render() {
    const wrap = $('markets-table');
    const meta = $('markets-meta');
    if (!wrap) return;

    const q = state.marketsSearch.trim().toLowerCase();
    let rows = state.markets.map((m) => ({
      id: m.id,
      type: m.type || 'spot',
      name: m.englishName || '',
      stale: Boolean(m.stale),
      last: tickerLast(m) != null ? Number(tickerLast(m)) : null,
      mark: m.mark != null ? Number(m.mark) : null,
      funding: fundingRate(m) != null ? Number(fundingRate(m)) : null,
    }));

    if (state.marketsType !== 'all') {
      rows = rows.filter((r) => r.type === state.marketsType);
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q)),
      );
    }
    rows = sortBy(rows, state.marketsSort);

    if (meta) meta.textContent = `${rows.length} market${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      wrap.innerHTML = '<p class="empty">No markets match this search.</p>';
      return;
    }

    let html =
      '<table><thead><tr>' +
      th('Market', 'id', state.marketsSort) +
      th('Type', 'type', state.marketsSort) +
      th('Name', 'name', state.marketsSort) +
      th('Feed', 'stale', state.marketsSort) +
      th('Last', 'last', state.marketsSort, 'num') +
      th('Mark', 'mark', state.marketsSort, 'num') +
      th('Funding', 'funding', state.marketsSort, 'num') +
      '</tr></thead><tbody>';

    for (const r of rows) {
      html += `<tr class="${r.stale ? 'stale-row' : ''}"><td>${esc(r.id)}</td><td><span class="pill muted">${esc(r.type)}</span></td><td>${esc(r.name || '—')}</td><td><span class="pill ${r.stale ? 'bad' : 'ok'}">${r.stale ? 'stale' : 'live'}</span></td><td class="num">${esc(fmtNum(r.last, 4))}</td><td class="num">${esc(r.type === 'perp' ? fmtNum(r.mark, 4) : '—')}</td><td class="num">${esc(r.type === 'perp' ? fmtPct(r.funding) : '—')}</td></tr>`;
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  },
};
