const test = require('node:test');
const assert = require('node:assert/strict');
const {
  otherActiveAlerts,
  pickPrimaryAlert,
  responderFirstName,
  uniqueActiveAlerts,
} = require('./activeAlerts');

function alert(id, overrides = {}) {
  return {
    id,
    backendStatus: 'pending',
    respondingAt: null,
    respondingMine: false,
    category: 'intrusion',
    priority: 2,
    ts: 1,
    ...overrides,
  };
}

test('claimed alert stays featured for its responder with outcome actions available', () => {
  const claimedCritical = alert('critical', {
    backendStatus: 'responding',
    respondingAt: 10,
    respondingMine: true,
    category: 'drowning',
    priority: 1,
  });
  const pendingHigh = alert('high', { ts: 20 });
  const pendingMedium = alert('medium', { category: 'deep-water', priority: 3, ts: 30 });

  assert.equal(pickPrimaryAlert([claimedCritical, pendingMedium, pendingHigh], claimedCritical.id).id, claimedCritical.id);
});

test('other guards rotate to the next unclaimed alert after a claim', () => {
  const responding = alert('responding', {
    backendStatus: 'responding',
    respondingAt: 10,
    respondingMine: false,
  });
  const pending = alert('pending', { priority: 3 });

  assert.equal(pickPrimaryAlert([responding, pending], responding.id).id, pending.id);
  assert.deepEqual(otherActiveAlerts([responding, pending], pending.id).map((item) => item.id), ['responding']);
});

test('other alerts contain every remaining active incident exactly once', () => {
  const primary = alert('primary');
  const responding = alert('responding', {
    backendStatus: 'responding',
    respondingAt: 10,
  });
  const closed = alert('closed', { backendStatus: 'resolved' });

  const other = otherActiveAlerts(
    [primary, responding, responding, closed, alert('second-pending')],
    primary.id
  );

  assert.deepEqual(other.map((item) => item.id).sort(), ['responding', 'second-pending']);
});

test('active alert normalization excludes closed incidents and duplicate ids', () => {
  assert.deepEqual(
    uniqueActiveAlerts([
      alert('one'),
      alert('one', { ts: 2 }),
      alert('resolved', { backendStatus: 'resolved' }),
      alert('dismissed', { backendStatus: 'dismissed' }),
    ]).map((item) => item.id),
    ['one']
  );
});

test('responder display uses first name with a safe fallback', () => {
  assert.equal(responderFirstName({ responderName: 'Kristine Sabuero' }), 'Kristine');
  assert.equal(responderFirstName({ responderName: '  Pia  Pendergat ' }), 'Pia');
  assert.equal(responderFirstName({ responderName: null }), 'Another lifeguard');
});
