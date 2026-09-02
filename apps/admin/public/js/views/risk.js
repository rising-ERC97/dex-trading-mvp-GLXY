import { state } from '../state.js';
import { $ } from '../lib/dom.js';
import { esc, fmtMoney, fmtNum, fmtPct, fmtTs } from '../lib/format.js';
import { renderBalanceTable } from '../lib/table.js';

export const riskView = {
  id: 'risk',

  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">House accounts</p>
        <h1 class="page-title">Risk</h1>
        <p class="sub">Fee revenue, clearing book, and recent anonymized liquidations.</p>
      </div>
    </div>
    <section class="grid risk-grid">
      <article class="card" id="sec-fees">
        <div class="card-head">
          <h2>Fee account</h2>
        </div>
        <div id="fees" class="table-wrap"></div>
      </article>
      <article class="card" id="sec-clearing">
        <div class="card-head">
          <h2>Clearing account</h2>
        </div>
        <div id="clearing" class="table-wrap"></div>
      </article>
      <article class="card wide" id="sec-liqs">
        <div class="card-head">
          <h2>Recent liquidations</h2>
        </div>
        <div id="liquidations" class="table-wrap"></div>
      </article>
      <article class="card wide" id="sec-funding">
        <div class="card-head">
          <h2>Perp funding</h2>
        </div>
        <div id="funding" class="table-wrap"></div>
      </article>
    </section>
  `,

  render() {
    const ops = state.ops || {};
    renderBalanceTable(
      $('fees'),
      ops.fees,
      'No fee balances yet — collected fees will appear here.',
    );
    renderBalanceTable(
      $('clearing'),
      ops.clearing,
      'Clearing book is flat — realized PnL mirrors will show here.',
    );

    const liqs = Array.isArray(ops.liquidations) ? ops.liquidations : [];
    const liqEl = $('liquidations');
    if (!liqEl) return;
    if (!liqs.length) {
      liqEl.innerHTML = '<p class="empty">No liquidations yet.</p>';
    } else {
      let html =
        '<table><thead><tr><th>Market</th><th class="num">Size</th><th class="num">Mark</th><th>Reason</th></tr></thead><tbody>';
      for (const l of liqs) {
        html += `<tr><td>${esc(l.marketId || '—')}</td><td class="num">${esc(fmtNum(l.size, 6))}</td><td class="num">${esc(fmtMoney(l.markPrice))}</td><td>${esc(l.reason || '—')}</td></tr>`;
      }
      html += '</tbody></table>';
      liqEl.innerHTML = html;
    }

    const fundEl = $('funding');
    if (!fundEl) return;
    let funding = Array.isArray(ops.funding) ? ops.funding : [];
    if (!funding.length) {
      fundEl.innerHTML =
        '<p class="empty">No funding rates yet — perps warm up from Hyperliquid.</p>';
      return;
    }

    funding = funding
      .map((f) => ({
        marketId: f.marketId || f.market || '—',
        rate: f.rate != null ? Number(f.rate) : f.fundingRate != null ? Number(f.fundingRate) : null,
        next: f.nextFundingTs || f.nextFundingTime || f.nextSettle || f.ts || null,
      }))
      .sort((a, b) => String(a.marketId).localeCompare(String(b.marketId)));

    let fhtml =
      '<table><thead><tr><th>Market</th><th class="num">Rate</th><th>Next / ts</th></tr></thead><tbody>';
    for (const f of funding) {
      fhtml += `<tr><td>${esc(f.marketId)}</td><td class="num">${esc(fmtPct(f.rate))}</td><td>${esc(fmtTs(f.next))}</td></tr>`;
    }
    fhtml += '</tbody></table>';
    fundEl.innerHTML = fhtml;
  },
};
