import { apiFetch } from './client'

/** Map backend event → mobile alert card shape */
export function toMobileAlert(event) {
  if (!event) return null
  const zone = event.zone_label || event.zone || 'Main Pool'
  const backendStatus = event.status || 'pending'
  return {
    id: event.id,
    type: event.type || 'info',
    code: event.code || '',
    title: event.title || 'Alert',
    detail: event.meta || '',
    meta: event.meta || `${zone} · ${event.camera || 'CAM-01'}`,
    time: event.time || '',
    date: event.date || 'Today',
    status: backendStatus === 'pending' ? 'new' : 'ack',
    backendStatus,
    severity: event.severity || 'MEDIUM',
    category: event.category || 'zone',
    confidence: event.confidence,
    camera: event.camera || 'CAM-01',
    zone,
    isAlert: Boolean(event.is_alert),
    ts: event.ts,
  }
}

export async function fetchMobileEvents(token, { alertsOnly = true, status = 'all', limit = 40 } = {}) {
  const params = new URLSearchParams({
    alertsOnly: alertsOnly ? '1' : '0',
    status,
    limit: String(limit),
  })
  const result = await apiFetch(`/api/mobile/events?${params}`, { token })
  if (!result.ok) return result
  return {
    ok: true,
    events: (result.events || []).map(toMobileAlert),
    pendingCount: Number(result.pendingCount || 0),
  }
}

export async function updateMobileEventStatus(token, id, status) {
  const result = await apiFetch(`/api/mobile/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: { status },
  })
  if (!result.ok) return result
  return {
    ok: true,
    event: toMobileAlert(result.event),
    pendingCount: Number(result.pendingCount || 0),
  }
}
