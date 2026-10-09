// PoolsEye — shared app constants. Alerts, events and the signed-in lifeguard come from the backend.

export const site = {
  name: 'Main Pool',
  shortName: 'Main Pool',
};

// Shown only for the instant before the signed-in profile loads.
export const lifeguard = {
  name: 'Lifeguard',
  initials: 'LG',
  role: 'Lifeguard',
  shiftStart: '06:00 AM',
  shiftEnd:   '06:00 PM',
};

// ── Notification preferences ──────────────────────────────────────────────────

export const notificationSettings = [
  // ids match the backend notification_prefs keys
  { id: 'supervision',   label: 'Unsupervised person alerts', description: 'No one within 0.7 m, or anyone detected after hours', enabled: true  },
  { id: 'boundary',      label: 'Zone boundary alerts',       description: 'Red zone, deep-pool and pool-area crossings',        enabled: true  },
  { id: 'escalation',    label: 'Escalation alerts',          description: 'If unacknowledged after 60 seconds',                 enabled: true  },
  { id: 'system_health', label: 'System health updates',      description: 'CCTV camera status',                                 enabled: false },
];
