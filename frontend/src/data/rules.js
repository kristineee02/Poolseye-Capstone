export const rules = [
  {
    id: 'rule-1',
    flow: [
      { text: 'Person in pool zone', tone: 'warn' },
      { text: 'No one within 0.7m', tone: 'alarm' },
      { text: 'Notify on-duty lifeguard', tone: 'accent', isResult: true },
    ],
    description:
      'Unsupervised person detection using 0.7m proximity rule. Sends a push alert to the lifeguard app when a person in the pool has no one within 0.7 meters.',
    enabled: true,
  },
  {
    id: 'rule-2',
    flow: [
      { text: 'Unacknowledged alert', tone: 'alarm' },
      { text: '60s elapsed', tone: 'neutral' },
      { text: 'Escalate to backup contact', tone: 'accent', isResult: true },
    ],
    description:
      "If the primary lifeguard doesn't acknowledge in time, the next contact on the roster is notified.",
    enabled: true,
  },
  {
    id: 'rule-3',
    flow: [
      { text: 'Low-confidence camera detection', tone: 'safe' },
      { text: 'no person confirmed', tone: 'neutral' },
      { text: 'Log only, no notification', tone: 'neutral', isResult: true },
    ],
    description:
      "Filters out debris, shadows, and non-person detections so the lifeguard isn't paged for visual noise.",
    enabled: true,
  },
  {
    id: 'rule-4',
    flow: [
      { text: 'Facility closure hours', tone: 'neutral' },
      { text: 'Any human detected', tone: 'warn' },
      { text: 'Notify lifeguard + site owner', tone: 'accent', isResult: true },
    ],
    description:
      'After-hours presence is always treated as unsupervised, regardless of proximity to other people. Set the hours in Settings → Operating Hours.',
    enabled: false,
  },
]

export const contacts = [
  {
    id: 'contact-1',
    initials: 'JR',
    name: 'Jonas Ramos',
    role: 'On-duty lifeguard · primary',
    channels: [{ label: 'App push', primary: true }, { label: 'SMS' }],
  },
  {
    id: 'contact-2',
    initials: 'MD',
    name: 'Mara De Leon',
    role: 'Backup lifeguard',
    channels: [{ label: 'App push', primary: true }],
  },
  {
    id: 'contact-3',
    initials: 'PB',
    name: 'Pia B.',
    role: 'Site owner',
    channels: [{ label: 'SMS' }, { label: 'Email' }],
  },
]
