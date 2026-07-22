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
    detail: 'Person crossed the shallow–deep Orange Boundary. Admin notification sent.',
    meta: 'CAM-01 · Main Pool · Orange Boundary',
    time: '10:31:02 AM',
    date: 'Jun 22',
    status: 'pending',
    confidence: 0.88,
    camera: 'CAM-01',
    zone: 'Orange Boundary',
  },
];

// ── Event log ─────────────────────────────────────────────────────────────────

export const events = [
  {
    id: 'evt-1',
    type: 'alarm',
    title: 'Unsupervised intrusion — child detected in restricted zone',
    meta: 'CAM-01 · Main Pool · confidence 0.93',
    time: '10:42 AM',
    date: 'Jun 22',
    status: 'pending',
    confidence: 0.93,
  },
  {
    id: 'evt-2',
    type: 'safe',
    title: 'Supervised access confirmed — adult within proximity',
    meta: 'CAM-01 · Main Pool · adult + child both tracked',
    time: '10:31 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: 0.97,
  },
  {
    id: 'evt-3',
    type: 'warn',
    title: 'Transition boundary crossed — shallow to deep',
    meta: 'CAM-01 · Main Pool · Orange Boundary',
    time: '10:31 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: 0.88,
  },
  {
    id: 'evt-4',
    type: 'info',
    title: 'System self-check completed',
    meta: 'CAM-01 online · CCTV stream healthy',
    time: '09:00 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: null,
  },
  {
    id: 'evt-5',
    type: 'safe',
    title: 'No intrusion overnight — geofence clear',
    meta: 'CAM-01 · Main Pool · 11:00 PM – 6:00 AM',
    time: '06:00 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: null,
  },
  {
    id: 'evt-6',
    type: 'alarm',
    title: 'Child near boundary, adult arrived in 4s',
    meta: 'CAM-01 · Main Pool',
    time: '4:18 PM',
    date: 'Jun 21',
    status: 'dismissed',
    confidence: 0.89,
  },
  {
    id: 'evt-7',
    type: 'warn',
    title: 'Yellow Zone entry — warning alert issued',
    meta: 'CAM-01 · Main Pool · Yellow Zone',
    time: '2:05 PM',
    date: 'Jun 21',
    status: 'dismissed',
    confidence: 0.84,
  },
  {
    id: 'evt-8',
    type: 'safe',
    title: 'Two adults, no children — logged, no alert',
    meta: 'CAM-01 · Main Pool',
    time: '11:52 AM',
    date: 'Jun 21',
    status: 'resolved',
    confidence: 0.95,
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