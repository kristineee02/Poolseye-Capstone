const test = require('node:test');
const assert = require('node:assert/strict');
const { HISTORY_FILTERS, historyFilterParams } = require('./historyFilters');

test('history filters map to Poolseye event, outcome, and date queries', () => {
  assert.deepEqual(historyFilterParams('drowning'), { category: 'drowning' });
  assert.deepEqual(historyFilterParams('supervision'), {
    category: 'supervision', eventName: 'UNSUPERVISED',
  });
  assert.deepEqual(historyFilterParams('after-hours'), { eventName: 'AFTER_HOURS_PRESENCE' });
  assert.deepEqual(historyFilterParams('dismissed'), { outcome: 'dismissed' });
  assert.ok(historyFilterParams('today', Date.now()).since > 0);
  assert.equal(new Set(HISTORY_FILTERS.map((filter) => filter.key)).size, HISTORY_FILTERS.length);
});
