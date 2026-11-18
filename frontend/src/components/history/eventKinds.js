import { Icon } from '../ui/Icon'

// Event timestamps are Unix instants. Always display them in the pool site's
// timezone instead of inheriting the browser/device timezone.
export const SITE_TIME_ZONE = import.meta.env.VITE_SITE_TIMEZONE || 'Asia/Manila'

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
  return event?.detection_source === 'Uploaded Video' || event?.camera === 'UPLOAD'
}

function liveCameraNumber(camera) {
  const match = String(camera || 'CAM-01').match(/(\d+)/)
  return match ? Number(match[1]) : 1
}

/** Stable key for grouping one uploaded-video session in history. */
export function uploadSessionKey(event) {
  const name = String(event?.source_name || '').trim()
  if (name) return `upload:${name}`
  return `upload:${event?.camera || 'UPLOAD'}`
}

/**
 * Build sequence numbers for camera labels across a list of events.
 * Uploads are numbered by first-seen source (1, 2, …); live cams use CAM-##.
 */
export function buildCameraSequenceMap(events = []) {
  const uploadByKey = new Map()
  const liveByCamera = new Map()
  const uploadFirstTs = []

  for (const event of events) {
    if (isUploadedVideo(event)) {
      const key = uploadSessionKey(event)
      const ts = Number(event?.ts) || 0
      const prev = uploadFirstTs.find((row) => row.key === key)
      if (!prev) uploadFirstTs.push({ key, ts })
      else if (ts && (!prev.ts || ts < prev.ts)) prev.ts = ts
      continue
    }
    const camera = String(event?.camera || 'CAM-01')
    if (!liveByCamera.has(camera)) {
      liveByCamera.set(camera, liveCameraNumber(camera))
    }
  }

  uploadFirstTs
    .sort((a, b) => a.ts - b.ts || a.key.localeCompare(b.key))
    .forEach((row, index) => {
      uploadByKey.set(row.key, index + 1)
    })

  return { uploadByKey, liveByCamera }
}

/** Human-readable camera column, e.g. "Uploaded CCTV #2" or "Live CCTV #1". */
export function cameraName(event, sequenceMap = null) {
  if (isUploadedVideo(event)) {
    const key = uploadSessionKey(event)
    const n = sequenceMap?.uploadByKey?.get(key)
    return n != null ? `Uploaded CCTV #${n}` : 'Uploaded CCTV'
  }
  const camera = String(event?.camera || 'CAM-01')
  const n = sequenceMap?.liveByCamera?.get(camera) ?? liveCameraNumber(camera)
  return `Live CCTV #${n}`
}

export function sourceLabel(event, sequenceMap = null) {
  return cameraName(event, sequenceMap)
}

/** Who handled an alert, as shown to the admin (only lifeguards can close alerts). */
export function handlingNote(event) {
  if (!isAlertEvent(event)) return null
  if (event.status === 'resolved') return event.closed_by_name ? `by ${event.closed_by_name}` : null
  if (event.status === 'dismissed') {
    const by = event.closed_by_name ? ` · ${event.closed_by_name}` : ''
    const reason = event.closure_reason ? ` · ${event.closure_reason}` : ''
    return `False alarm${by}${reason}`
  }
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
    timeZone: SITE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

export function formatDate(ts) {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleDateString('en', {
    timeZone: SITE_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(ts) {
  if (ts == null) return '—'
  return `${formatDate(ts)} · ${formatTime(ts, true)}`
}
