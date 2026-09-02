/** Small DOM helpers shared across views. */

export function $(id) {
  return document.getElementById(id);
}

export function setStatus(msg, liveState) {
  const status = $('status');
  if (status) status.textContent = msg;
  const pill = $('live-pill');
  if (!pill) return;
  pill.classList.remove('ok', 'bad');
  if (liveState === 'ok') pill.classList.add('ok');
  if (liveState === 'bad') pill.classList.add('bad');
}

export function setBadge(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('ok', 'bad');
  if (cls) el.classList.add(cls);
}

export function fillDl(el, rows) {
  if (!el) return;
  el.innerHTML = '';
  for (const row of rows) {
    const dt = document.createElement('dt');
    dt.textContent = row.label;
    const dd = document.createElement('dd');
    dd.textContent = row.value;
    if (row.cls) dd.className = row.cls;
    el.appendChild(dt);
    el.appendChild(dd);
  }
}
