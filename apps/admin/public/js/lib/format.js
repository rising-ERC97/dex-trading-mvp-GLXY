/** Formatting + HTML escape helpers. */

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtNum(n, digits) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x.toLocaleString(undefined, {
    maximumFractionDigits: digits != null ? digits : 2,
  });
}

export function fmtMoney(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

export function fmtPct(rate) {
  if (rate == null || rate === '') return '—';
  const n = Number(rate);
  if (!Number.isFinite(n)) return String(rate);
  return (
    (n * 100).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    }) + '%'
  );
}

export function fmtTs(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e11) return new Date(n).toLocaleString();
  return String(v);
}

export function tickerLast(m) {
  const t = m?.ticker;
  if (!t) return null;
  return t.last ?? t.close ?? t.price ?? t.mid ?? null;
}

export function fundingRate(m) {
  const f = m?.funding;
  if (!f) return null;
  return f.rate ?? f.fundingRate ?? null;
}

/** Parse Prometheus text exposition; sums labeled series by metric name. */
export function parseProm(text) {
  const out = {};
  for (const line of text.split('\n')) {
    if (!line || line.charAt(0) === '#') continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+([^\s]+)/.exec(line);
    if (!m) continue;
    const name = m[1];
    const val = Number(m[2]);
    if (out[name] === undefined) out[name] = val;
    else out[name] += Number.isFinite(val) ? val : 0;
  }
  return out;
}
