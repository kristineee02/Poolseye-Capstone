const CATEGORY_PRIORITY = {
  drowning: 0,
  intrusion: 1,
  'deep-water': 2,
  supervision: 3,
};

function byCategoryPriority(a, b) {
  const priorityDifference = Number(a.priority || 9) - Number(b.priority || 9);
  if (priorityDifference) return priorityDifference;
  const categoryDifference = (CATEGORY_PRIORITY[a.category] ?? 9) - (CATEGORY_PRIORITY[b.category] ?? 9);
  if (categoryDifference) return categoryDifference;
  return Number(b.ts || 0) - Number(a.ts || 0);
}

function uniqueActiveAlerts(alerts) {
  const seen = new Set();
  return (alerts || []).filter((alert) => {
    if (!alert?.id || !['pending', 'responding'].includes(alert.backendStatus) || seen.has(alert.id)) {
      return false;
    }
    seen.add(alert.id);
    return true;
  });
}

/**
 * Keep an incident claimed by this guard on the large card so its Resolve and
 * False Alarm actions remain available. Other guards immediately move that
 * incident to Other alerts and see the next highest-priority unclaimed alert.
 */
function pickPrimaryAlert(alerts, pinnedId) {
  const ranked = uniqueActiveAlerts(alerts).sort(byCategoryPriority);
  if (!ranked.length) return null;

  const mine = ranked.find((alert) => alert.respondingMine);
  if (mine) return mine;

  const unclaimed = ranked.filter((alert) => alert.backendStatus === 'pending' && !alert.respondingAt);
  if (!unclaimed.length) return null;

  // A notification may focus a particular incident, but never at the expense
  // of an unclaimed alert with a higher severity.
  const pinned = pinnedId ? unclaimed.find((alert) => alert.id === pinnedId) : null;
  if (pinned && Number(pinned.priority || 9) === Number(unclaimed[0].priority || 9)) return pinned;
  return unclaimed[0];
}

function otherActiveAlerts(alerts, primaryId) {
  return uniqueActiveAlerts(alerts)
    .filter((alert) => alert.id !== primaryId)
    .sort(byCategoryPriority);
}

function responderFirstName(alert) {
  const fullName = String(alert?.responderName || '').trim();
  return fullName ? fullName.split(/\s+/)[0] : 'Another lifeguard';
}

module.exports = {
  byCategoryPriority,
  otherActiveAlerts,
  pickPrimaryAlert,
  responderFirstName,
  uniqueActiveAlerts,
};
