import { VIEWS, state } from './state.js';
import { $ } from './lib/dom.js';

/**
 * Hash router: #overview | #feeds | #risk | #markets
 * @param {Record<string, { render: () => void }>} views
 */
export function createRouter(views) {
  function currentHashView() {
    const h = (location.hash || '#overview').replace(/^#/, '');
    return VIEWS.includes(h) ? h : 'overview';
  }

  function showView(name) {
    if (!VIEWS.includes(name)) name = 'overview';
    state.view = name;
    for (const v of VIEWS) {
      const el = $(`view-${v}`);
      if (el) el.hidden = v !== name;
    }
    document.querySelectorAll('#nav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-view') === name);
    });
    views[name]?.render();
  }

  function syncFromHash() {
    showView(currentHashView());
  }

  window.addEventListener('hashchange', syncFromHash);

  return { showView, syncFromHash, currentHashView };
}
