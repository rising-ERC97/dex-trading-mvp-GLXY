/** Shared mutable UI state for the ops console. */

export const VIEWS = ['overview', 'feeds', 'risk', 'markets'];

export const state = {
  view: 'overview',
  markets: [],
  ops: null,
  feedsFilter: 'all',
  marketsSearch: '',
  marketsType: 'all',
  feedsSort: { key: 'stale', dir: -1 },
  marketsSort: { key: 'id', dir: 1 },
};
