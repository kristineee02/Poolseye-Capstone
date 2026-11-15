const HISTORY_FILTERS = [
  { key: 'all', label: 'All history', group: 'All' },
  { key: 'today', label: 'Today', group: 'Date' },
  { key: '7-days', label: 'Last 7 days', group: 'Date' },
  { key: '30-days', label: 'Last 30 days', group: 'Date' },
  { key: 'resolved', label: 'Resolved', group: 'Outcome' },
  { key: 'dismissed', label: 'False alarms', group: 'Outcome' },
  { key: 'drowning', label: 'Possible Drowning', group: 'Event' },
  { key: 'intrusion', label: 'Red Zone Intrusion', group: 'Event' },
  { key: 'deep-water', label: 'Deep-Pool Entry', group: 'Event' },
  { key: 'supervision', label: 'Unsupervised Person', group: 'Event' },
  { key: 'after-hours', label: 'After-Hours Presence', group: 'Event' },
];

function historyFilterParams(filter, now = Date.now()) {
  if (filter === 'today') {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return { since: midnight.getTime() / 1000 };
  }
  if (filter === '7-days') return { since: (now - 7 * 24 * 60 * 60 * 1000) / 1000 };
  if (filter === '30-days') return { since: (now - 30 * 24 * 60 * 60 * 1000) / 1000 };
  if (filter === 'resolved' || filter === 'dismissed') return { outcome: filter };
  if (filter === 'after-hours') return { eventName: 'AFTER_HOURS_PRESENCE' };
  if (filter === 'supervision') return { category: 'supervision', eventName: 'UNSUPERVISED' };
  if (['drowning', 'intrusion', 'deep-water'].includes(filter)) return { category: filter };
  return {};
}

module.exports = { HISTORY_FILTERS, historyFilterParams };
