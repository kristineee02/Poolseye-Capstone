import { Icon } from '../ui/Icon'

export const EVENT_KINDS = {
  distress: { id: 'distress', label: 'Distress', icon: Icon.AlertCircle, rank: 4 },
  intrusion: { id: 'intrusion', label: 'Intrusion', icon: Icon.AlertTriangle, rank: 3 },
  deep: { id: 'deep', label: 'Deep pool', icon: Icon.Waves, rank: 2 },
  normal: { id: 'normal', label: 'Normal', icon: Icon.User, rank: 1 },
}

export function eventKind(event) {
  if (event?.category === 'drowning') return EVENT_KINDS.distress
  if (event?.category === 'deep-water' && (event?.is_alert || event?.type === 'alarm')) return EVENT_KINDS.deep
  if (event?.is_alert || event?.type === 'alarm') return EVENT_KINDS.intrusion
  return EVENT_KINDS.normal
}

export function isAlertEvent(event) {
  return eventKind(event).id !== 'normal'
}

export const CAMERA_LABEL = 'Pool CCTV'

export function zoneLabel(event) {
  // Broadcasts store their priority in zone_label; they have no detection zone
  if (event?.category === 'broadcast') return null
  const raw = String(event?.zone_label || event?.zone || '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'outside' || raw === 'clear') return 'Outside zones'
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)} zone`
}

export function formatTime(ts, withSeconds = false) {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleTimeString('en', {
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

export function formatDate(ts) {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(ts) {
  if (ts == null) return '—'
  return `${formatDate(ts)} · ${formatTime(ts, true)}`
}
