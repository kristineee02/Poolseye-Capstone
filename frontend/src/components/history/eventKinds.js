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

/** Detections from a video the admin uploaded to the feed are stored with camera = 'UPLOAD'. */
export function isUploadedVideo(event) {
  return event?.camera === 'UPLOAD'
}

export function cameraName(event) {
  if (isUploadedVideo(event)) return 'Uploaded video'
  return event?.camera || '—'
}

export function sourceLabel(event) {
  return isUploadedVideo(event) ? 'Uploaded video' : `${event?.camera || 'CAM-01'} · ${CAMERA_LABEL}`
}

/** Who handled an alert, as shown to the admin (only lifeguards can close alerts). */
export function handlingNote(event) {
  if (!isAlertEvent(event)) return null
  if (event.status === 'resolved') return event.acknowledged_by_name ? `by ${event.acknowledged_by_name}` : null
  if (event.status === 'dismissed') return event.acknowledged_by_name ? `False alarm · ${event.acknowledged_by_name}` : 'False alarm'
  if (event.responding_at) return `${event.responder_name || 'A lifeguard'} responding`
  if (event.escalated_at) return 'No response yet'
  if (event.dispatched_at) return 'Sent to lifeguards'
  return 'Not sent yet'
}

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
