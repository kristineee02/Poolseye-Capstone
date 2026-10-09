/**
 * Event history — backed by Express API.
 */

import { API_BASE } from '../config'

const ADMIN_SESSION_KEY = 'poolseye-admin-session'

function getAdminToken() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)?.token || null
  } catch {
    return null
  }
}

async function apiFetch(path, options = {}) {
  const token = getAdminToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    return { ok: false, error: 'Cannot reach backend server.' }
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: data.error || `Request failed (${res.status})` }
  }
  return { ok: true, ...data }
}

export async function fetchEvents({
  search = '',
  type = 'all',
  status = 'all',
  camera = 'all',
  kind = 'all',
  since = null,
  page = 1,
  pageSize = 4,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    type,
    status,
    camera,
    kind,
  })
  if (since) params.set('since', String(since))
  if (search.trim()) params.set('search', search.trim())

  return apiFetch(`/api/events?${params.toString()}`)
}

export async function fetchEventCameras() {
  return apiFetch('/api/events/cameras')
}

export async function fetchActiveAlert() {
  return apiFetch('/api/events/active')
}

export async function fetchEventSummary() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return apiFetch(`/api/events/summary?since=${todayStart.getTime() / 1000}`)
}

export async function fetchAnalytics(range = '7d') {
  return apiFetch(`/api/analytics?range=${encodeURIComponent(range)}`)
}

export async function createTestAlert(kind) {
  return apiFetch('/api/events/test', { method: 'POST', body: JSON.stringify({ kind }) })
}

export async function dispatchEvent(id) {
  return apiFetch(`/api/events/${encodeURIComponent(id)}/dispatch`, { method: 'POST' })
}