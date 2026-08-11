// PoolsEye — shared data (mirrors web dashboard data files)

export const site = {
  name: 'Main Pool',
  shortName: 'Main Pool',
  edgeNodeOnline: true,
  mode: 'Offline / local-only',
};

export const lifeguard = {
  name: 'Jonas Ramos',
  initials: 'JR',
  role: 'On-duty lifeguard · primary',
  shiftStart: '06:00 AM',
  shiftEnd:   '06:00 PM',
};

// ── Alerts ───────────────────────────────────────────────────────────────────

export const alerts = [
  {
    id: 'evt-1',
    type: 'alarm',
    title: 'Unsupervised intrusion detected',
    detail: 'Child class object inside restricted zone. No adult within 2.4 m proximity threshold.',
    meta: 'CAM-01 · Main Pool · Red Zone',
    time: '10:42:11 AM',
    date: 'Jun 22',
    status: 'pending',
    confidence: 0.93,
    camera: 'CAM-01',
    zone: 'Red Zone',
  },
  {
    id: 'evt-3',
    type: 'warn',
    title: 'Transition boundary crossed',
    detail: 'Person crossed the shallow–deep Yellow Zone boundary. Admin notification sent.',
    meta: 'CAM-01 · Main Pool · Yellow Zone',
    time: '10:18:05 AM',
    date: 'Jun 22',
    status: 'pending',
    confidence: 0.88,
    camera: 'CAM-01',
    zone: 'Yellow Zone',
  },
];

// ── Event log (All Alerts content) ────────────────────────────────────────────

export const events = [
  {
    id: 'evt-1',
    code: 'DRN',
    title: 'Possible Drowning',
    description: 'A person was detected motionless in the Red Zone. No nearby adult movement was found within the safety threshold. Immediate lifeguard response is recommended.',
    meta: 'Red Zone · 2:15 PM · HIGH',
    zone: 'Red Zone',
    time: '2:15 PM',
    date: 'Today',
    severity: 'HIGH',
    status: 'new',
    category: 'drowning',
    type: 'alarm',
    confidence: 0.94,
  },
  {
    id: 'evt-2',
    code: 'INT',
    title: 'Unauthorized Intrusion',
    description: 'An unauthorized entry was detected in the Red Zone. The tracked person does not match an allowed supervised pattern. Area was flagged for review.',
    meta: 'Red Zone · 2:10 PM · HIGH',
    zone: 'Red Zone',
    time: '2:10 PM',
    date: 'Today',
    severity: 'HIGH',
    status: 'ack',
    category: 'intrusion',
    type: 'alarm',
    confidence: 0.91,
  },
  {
    id: 'evt-3',
    code: 'CH',
    title: 'Unsupervised Child',
    description: 'A child-class detection was found in the Yellow Zone without an adult within the proximity threshold. Lifeguard acknowledgment was recorded.',
    meta: 'Yellow Zone · 1:58 PM · MEDIUM',
    zone: 'Yellow Zone',
    time: '1:58 PM',
    date: 'Today',
    severity: 'MEDIUM',
    status: 'ack',
    category: 'child',
    type: 'warn',
    confidence: 0.87,
  },
  {
    id: 'evt-4',
    code: 'DP',
    title: 'Deep-Water Entry',
    description: 'A person crossed the Deep-Water Boundary from the shallow side. Transition monitoring logged the event for situational awareness.',
    meta: 'Deep-Water Boundary · 1:55 PM · MEDIUM',
    zone: 'Deep-Water Boundary',
    time: '1:55 PM',
    date: 'Today',
    severity: 'MEDIUM',
    status: 'ack',
    category: 'deep-water',
    type: 'info',
    confidence: 0.85,
  },
  {
    id: 'evt-5',
    code: 'YL',
    title: 'Yellow Zone Warning',
    description: 'Activity in the Yellow Zone triggered a low-priority warning. No immediate danger pattern was confirmed, but continued observation is advised.',
    meta: 'Yellow Zone · 1:40 PM · LOW',
    zone: 'Yellow Zone',
    time: '1:40 PM',
    date: 'Today',
    severity: 'LOW',
    status: 'ack',
    category: 'yellow',
    type: 'warn',
    confidence: 0.78,
  },
];

// ── Zones (matches web geofence: Yellow / Orange / Red) ───────────────────────

export const zones = [
  {
    id: 'zone-warning',
    name: 'Yellow Zone',
    typeLabel: 'Warning',
    camera: 'CAM-01',
    threshold: 1.5,
    status: 'warn',
    statusLabel: 'WARNING',
    detail: 'General warning zone · shallow approach area',
    activeDuringStandby: true,
  },
  {
    id: 'zone-transition',
    name: 'Orange Boundary',
    typeLabel: 'Transition',
    camera: 'CAM-01',
    threshold: null,
    status: 'alarm',
    statusLabel: 'CROSSED',
    detail: 'Shallow–deep line crossed · admin notification sent',
    activeDuringStandby: true,
  },
  {
    id: 'zone-danger',
    name: 'Red Zone',
    typeLabel: 'Danger',
    camera: 'CAM-01',
    threshold: 1.5,
    status: 'safe',
    statusLabel: 'CLEAR',
    detail: 'Deep-end danger zone · no intrusion detected',
    activeDuringStandby: true,
  },
];

// ── Cameras (single CCTV for Main Pool) ───────────────────────────────────────

export const cameras = [
  { id: 'CAM-01', name: 'Main Pool', status: 'online', fps: 13 },
];

// ── Notification preferences ──────────────────────────────────────────────────

export const notificationSettings = [
  { id: 'ns-1', label: 'Unsupervised intrusion alerts', description: 'Immediate push for danger/warning zones', enabled: true  },
  { id: 'ns-2', label: 'Transition boundary alerts',    description: 'Notify when shallow–deep line is crossed', enabled: true  },
  { id: 'ns-3', label: 'Escalation alerts',             description: 'If unacknowledged after 60 seconds',      enabled: true  },
  { id: 'ns-4', label: 'System health updates',         description: 'CCTV camera status',                     enabled: false },
];