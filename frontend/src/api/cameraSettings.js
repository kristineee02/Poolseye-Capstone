import { API_BASE, STREAM_BASE } from '../config'

const ADMIN_SESSION_KEY = 'poolseye-admin-session'

function authHeaders() {
  try {
    const token = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || '{}')?.token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) },
    })
  } catch {
    return { ok: false, error: 'Cannot reach backend server.' }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error || `Request failed (${res.status})` }
  return { ok: true, ...data }
}

export function fetchCameraSettings() {
  return request('/api/camera-settings', { cache: 'no-store' })
}

export function saveCameraSettings({ ipAddress, rtspPort }) {
  return request('/api/camera-settings', {
    method: 'PUT',
    body: JSON.stringify({ ipAddress, rtspPort }),
  })
}

export async function fetchStreamHealth() {
  try {
    const res = await fetch(`${STREAM_BASE}/health`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
