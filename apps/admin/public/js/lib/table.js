import { esc, fmtMoney } from './format.js';

export function sortBy(list, sort) {
  const { key, dir } = sort;
  return list.slice().sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (typeof av === 'boolean') {
      av = av ? 1 : 0;
      bv = bv ? 1 : 0;
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
  });
}

export function th(label, key, sort, cls) {
  const sorted = sort.key === key ? ' sorted' : '';
  const arrow = sort.key === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : '';
  return (
    `<th class="${cls || ''}${sorted}" data-sort="${esc(key)}">${esc(label)}${arrow}</th>`
  );
}

export function bindSort(tableId, sortState, onSort) {
  const wrap = document.getElementById(tableId);
  if (!wrap) return;
  wrap.addEventListener('click', (e) => {
    const thEl = e.target.closest('th[data-sort]');
    if (!thEl) return;
    const key = thEl.getAttribute('data-sort');
    if (sortState.key === key) sortState.dir = -sortState.dir;
    else {
      sortState.key = key;
      sortState.dir = key === 'stale' ? -1 : 1;
    }
    onSort();
  });
}

function balanceRows(payload) {
  let rows = Array.isArray(payload) ? payload : [];
  if (!rows.length && payload && typeof payload === 'object' && Array.isArray(payload.balances)) {
    rows = payload.balances;
  }
  return rows;
}

export function renderBalanceTable(el, payload, emptyMsg) {
  if (!el) return;
  const rows = balanceRows(payload);
  if (!rows.length) {
    el.innerHTML = `<p class="empty">${esc(emptyMsg)}</p>`;
    return;
  }
  let html =
    '<table><thead><tr><th>Asset</th><th class="num">Available</th><th class="num">Locked</th></tr></thead><tbody>';
  for (const b of rows) {
    html += `<tr><td>${esc(b.asset || '—')}</td><td class="num">${esc(fmtMoney(b.available))}</td><td class="num">${esc(fmtMoney(b.locked))}</td></tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}
