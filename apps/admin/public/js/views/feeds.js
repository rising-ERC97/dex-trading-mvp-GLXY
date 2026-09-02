import { state } from '../state.js';
import { $ } from '../lib/dom.js';
import { esc, fmtNum, tickerLast } from '../lib/format.js';
import { bindSort, sortBy, th } from '../lib/table.js';

export const feedsView = {
  id: 'feeds',

  template: `
    <div class="page-head row">
      <div>
        <p class="eyebrow">Venue feeds</p>
        <h1 class="page-title">Feed health</h1>
        <p class="sub">Which books are live vs taken down because the source venue went silent.</p>
      </div>
      <div class="toolbar">
        <label class="field">
          <span>Filter</span>
          <select id="feeds-filter">
            <option value="all">All</option>
            <option value="stale">Stale only</option>
            <option value="live">Live only</option>
          </select>
        </label>
      </div>
    </div>
    <div class="table-panel">
      <div class="table-wrap" id="feeds-table"></div>
    </div>
  `,

  bind() {
    $('feeds-filter')?.addEventListener('change', (e) => {
      state.feedsFilter = e.target.value;
      this.render();
    });
    bindSort('feeds-table', state.feedsSort, () => this.render());
  },

  render() {
    const wrap = $('feeds-table');
    if (!wrap) return;

    let rows = state.markets.map((m) => ({
      id: m.id,
      type: m.type || 'spot',
      name: m.englishName || m.base || '',
      stale: Boolean(m.stale),
      last: tickerLast(m) != null ? Number(tickerLast(m)) : null,
      mark: m.mark != null ? Number(m.mark) : null,
    }));

    if (state.feedsFilter === 'stale') rows = rows.filter((r) => r.stale);
    if (state.feedsFilter === 'live') rows = rows.filter((r) => !r.stale);
    rows = sortBy(rows, state.feedsSort);

    if (!rows.length) {
      wrap.innerHTML = '<p class="empty">No markets match this filter.</p>';
      return;
    }

    let html =
      '<table><thead><tr>' +
      th('Market', 'id', state.feedsSort) +
      th('Type', 'type', state.feedsSort) +
      th('Name', 'name', state.feedsSort) +
      th('Status', 'stale', state.feedsSort) +
      th('Last', 'last', state.feedsSort, 'num') +
      th('Mark', 'mark', state.feedsSort, 'num') +
      '</tr></thead><tbody>';

    for (const r of rows) {
      html += `<tr class="${r.stale ? 'stale-row' : ''}"><td>${esc(r.id)}</td><td>${esc(r.type)}</td><td>${esc(r.name || '—')}</td><td><span class="pill ${r.stale ? 'bad' : 'ok'}">${r.stale ? 'stale' : 'live'}</span></td><td class="num">${esc(fmtNum(r.last, 4))}</td><td class="num">${esc(r.type === 'perp' ? fmtNum(r.mark, 4) : '—')}</td></tr>`;
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  },
};
