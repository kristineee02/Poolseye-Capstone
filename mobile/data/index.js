// PoolsEye — shared data (mirrors web dashboard data files)

export const site = {
  name: 'Sablan Residence — South Patio Pool',
  shortName: 'South Patio Pool',
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
    meta: 'CAM-01 · South Patio · Zone A',
    time: '10:42:11 AM',
    date: 'Jun 22',
    status: 'pending',
    confidence: 0.93,
    camera: 'CAM-01',
    zone: 'Zone A',
  },
  {
    id: 'evt-3',
    type: 'warn',
    title: 'PIR motion trigger — camera inference activated',
    detail: 'Motion sensor woke the camera. No human confirmed after 3s of inference.',
    meta: 'CAM-01 · South Patio · standby exit',
    time: '10:31:02 AM',
    date: 'Jun 22',
    status: 'pending',
    confidence: null,
    camera: 'CAM-01',
    zone: 'Zone A',
  },
];

// ── Event log ─────────────────────────────────────────────────────────────────

export const events = [
  {
    id: 'evt-1',
    type: 'alarm',
    title: 'Unsupervised intrusion — child detected in restricted zone',
    meta: 'CAM-01 · South Patio · confidence 0.93',
    time: '10:42 AM',
    date: 'Jun 22',
    status: 'pending',
    confidence: 0.93,
  },
  {
    id: 'evt-2',
    type: 'safe',
    title: 'Supervised access confirmed — adult within proximity',
    meta: 'CAM-01 · South Patio · adult + child both tracked',
    time: '10:31 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: 0.97,
  },
  {
    id: 'evt-3',
    type: 'warn',
    title: 'PIR motion trigger — camera inference activated',
    meta: 'CAM-01 · South Patio · standby exit',
    time: '10:31 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: null,
  },
  {
    id: 'evt-4',
    type: 'info',
    title: 'System self-check completed',
    meta: 'All sensors nominal · ESP32 alarm node responsive',
    time: '09:00 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: null,
  },
  {
    id: 'evt-5',
    type: 'safe',
    title: 'No intrusion overnight — geofence clear',
    meta: 'CAM-01 · South Patio · 11:00 PM – 6:00 AM',
    time: '06:00 AM',
    date: 'Jun 22',
    status: 'resolved',
    confidence: null,
  },
  {
    id: 'evt-6',
    type: 'alarm',
    title: 'Child near boundary, adult arrived in 4s',
    meta: 'CAM-01 · South Patio',
    time: '4:18 PM',
    date: 'Jun 21',
    status: 'dismissed',
    confidence: 0.89,
  },
  {
    id: 'evt-7',
    type: 'warn',
    title: 'Motion trigger — debris on water, no human confirmed',
    meta: 'CAM-01 · South Patio',
    time: '2:05 PM',
    date: 'Jun 21',
    status: 'dismissed',
    confidence: 0.21,
  },
  {
    id: 'evt-8',
    type: 'safe',
    title: 'Two adults, no children — logged, no alert',
    meta: 'CAM-01 · South Patio',
    time: '11:52 AM',
    date: 'Jun 21',
    status: 'resolved',
    confidence: 0.95,
  },
];

// ── Zones ─────────────────────────────────────────────────────────────────────

export const zones = [
  {
    id: 'zone-1',
    name: 'Zone A · South Patio',
    camera: 'CAM-01',
    threshold: 1.5,
    status: 'alarm',
    statusLabel: 'ALARM',
    detail: 'Child detected · no supervising adult',
    activeDuringStandby: true,
  },
  {
    id: 'zone-2',
    name: 'Zone B · Pool Edge',
    camera: 'CAM-02',
    threshold: 1.5,
    status: 'safe',
    statusLabel: 'CLEAR',
    detail: 'Geofence clear · no objects detected',
    activeDuringStandby: true,
  },
  {
    id: 'zone-3',
    name: 'Zone C · Deep End',
    camera: 'CAM-03',
    threshold: 1.5,
    status: 'safe',
    statusLabel: 'CLEAR',
    detail: 'Geofence clear · no objects detected',
    activeDuringStandby: false,
  },
  {
    id: 'zone-4',
    name: 'Zone D · Side Gate',
    camera: 'CAM-01',
    threshold: 1.2,
    status: 'warn',
    statusLabel: 'MOTION',
    detail: 'PIR triggered · camera inference pending',
    activeDuringStandby: true,
  },
];

// ── Cameras ───────────────────────────────────────────────────────────────────

export const cameras = [
  { id: 'CAM-01', name: 'South Patio',    status: 'online',  fps: 13 },
  { id: 'CAM-02', name: 'Pool Edge',      status: 'online',  fps: 13 },
  { id: 'CAM-03', name: 'Deep End',       status: 'standby', fps: 0  },
];

// ── Profile / contacts ────────────────────────────────────────────────────────

export const contacts = [
  {
    id: 'c-1',
    initials: 'JR',
    name: 'Jonas Ramos',
    role: 'On-duty lifeguard · primary',
    channels: ['App push', 'SMS'],
    isPrimary: true,
  },
  {
    id: 'c-2',
    initials: 'MD',
    name: 'Mara De Leon',
    role: 'Backup lifeguard',
    channels: ['App push'],
    isPrimary: false,
  },
  {
    id: 'c-3',
    initials: 'PB',
    name: 'Pia B.',
    role: 'Site owner',
    channels: ['SMS', 'Email'],
    isPrimary: false,
  },
];

export const notificationSettings = [
  { id: 'ns-1', label: 'Unsupervised intrusion alerts',    description: 'Immediate push + buzzer', enabled: true  },
  { id: 'ns-2', label: 'PIR motion triggers',             description: 'Warn-level push only',     enabled: true  },
  { id: 'ns-3', label: 'System health updates',           description: 'Camera and sensor status', enabled: false },
  { id: 'ns-4', label: 'Escalation alerts',               description: 'If unacknowledged 60s',    enabled: true  },
  { id: 'ns-5', label: 'Overnight monitoring summary',    description: 'Daily digest at 6:00 AM',  enabled: false },
];