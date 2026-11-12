import { API_BASE, apiFetch } from './client'

export function getMobileAlertStreamUrl(token) {
  return token ? `${API_BASE}/api/mobile/events/stream?token=${encodeURIComponent(token)}` : null
}

/** Map backend event → mobile alert card shape */
export function toMobileAlert(event) {
  if (!event) return null
  const zone = event.zone_label || event.zone || 'Main Pool'
  const backendStatus = event.status || 'pending'
  const detectionSource = event.detection_source || (event.camera === 'UPLOAD' ? 'Uploaded Video' : 'Live CCTV')
  const sourceDisplay = event.source_name ? `${detectionSource}: ${event.source_name}` : detectionSource
  return {
    id: event.id,
    type: event.type || 'info',
    code: event.code || '',
    title: event.title || 'Alert',
    detail: event.meta || '',
    meta: event.meta || `${zone} · ${sourceDisplay}`,
    time: event.time || '',
    date: event.date || 'Today',
    status: backendStatus === 'pending' ? 'new' : 'ack',
    backendStatus,
    severity: event.severity || 'MEDIUM',
    category: event.category || 'zone',
    confidence: event.confidence,
    camera: event.camera || 'CAM-01',
    detectionSource,
    sourceName: event.source_name || null,
    zone,
    isAlert: Boolean(event.is_alert),
    ts: event.ts,
    personId: event.person_id ?? null,
    dispatchedAt: event.dispatched_at ?? null,
    escalatedAt: event.escalated_at ?? null,
    acknowledgedAt: event.acknowledged_at ?? null,
    acknowledgedByName: event.acknowledged_by_name || null,
    closedAt: event.closed_at ?? null,
    closedByName: event.closed_by_name || null,
    closureReason: event.closure_reason || null,
    priority: Number(event.priority || 5),
    priorityLabel: event.priority_label || 'informational',
    incidentKey: event.incident_key || null,
    occurrenceCount: Number(event.occurrence_count || 1),
    personIds: Array.isArray(event.person_ids) ? event.person_ids : [],
    affectedCount: Number(event.affected_count || 1),
    respondingAt: event.responding_at ?? null,
    responseTimeSeconds: event.response_time_seconds ?? null,
    responderName: event.responder_name || null,
    respondingMine: Boolean(event.responding_mine),
  }
}

export async function acknowledgeMobileEvent(token, id) {
  const result = await apiFetch(`/api/mobile/events/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
    token,
  })
  if (!result.ok) return result
  return { ok: true, event: toMobileAlert(result.event) }
}

export async function respondToMobileEvent(token, id) {
  const result = await apiFetch(`/api/mobile/events/${encodeURIComponent(id)}/respond`, {
    method: 'POST',
    token,
  })
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      event: result.event ? toMobileAlert(result.event) : null,
    }
  }
  return { ok: true, event: toMobileAlert(result.event) }
}

export async function fetchMobileEvents(token, {
  alertsOnly = true,
  status = 'all',
  limit = 40,
  offset = 0,
  beforeTs,
  beforeId,
  ackSince,
} = {}) {
  const params = new URLSearchParams({
    alertsOnly: alertsOnly ? '1' : '0',
    status,
    limit: String(limit),
    offset: String(offset),
  })
  if (ackSince) params.set('ackSince', String(ackSince))
  if (Number.isFinite(beforeTs) && beforeId) {
    params.set('beforeTs', String(beforeTs))
    params.set('beforeId', String(beforeId))
  }
  const result = await apiFetch(`/api/mobile/events?${params}`, { token })
  if (!result.ok) return result
  return {
    ok: true,
    events: (result.events || []).map(toMobileAlert),
    hasMore: Boolean(result.hasMore),
    nextOffset: Number(result.nextOffset ?? offset + (result.events || []).length),
    nextCursor: result.nextCursor || null,
    totalCount: Number(result.totalCount ?? (result.events || []).length),
    pendingCount: Number(result.pendingCount || 0),
    acknowledgedToday: result.acknowledgedToday ?? null,
  }
}

export async function updateMobileEventStatus(token, id, status, reason = '') {
  const result = await apiFetch(`/api/mobile/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: { status, reason },
  })
  if (!result.ok) return result
  return {
    ok: true,
    event: toMobileAlert(result.event),
    pendingCount: Number(result.pendingCount || 0),
  }
}
