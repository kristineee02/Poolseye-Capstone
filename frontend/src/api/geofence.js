import { API_BASE } from '../config'

const STORAGE_KEY = 'poolseye-admin-session'

function authHeaders() {
  try {
    const token = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')?.token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Geofence request failed (${res.status})`)
  }
  return data
}

export function getGeofenceStreamUrl() {
  return `${API_BASE}/api/geofence/stream`
}

export async function fetchGeofence() {
  const res = await fetch(`${API_BASE}/api/geofence`, { cache: 'no-store' })
  return parseJson(res)
}

export async function saveGeofence(zones, clientId) {
  const res = await fetch(`${API_BASE}/api/geofence`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ cameraId: 'CAM-01', clientId, zones }),
  })
  return parseJson(res)
}

export async function publishLiveGeofence(zones, clientId) {
  const res = await fetch(`${API_BASE}/api/geofence/live`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ cameraId: 'CAM-01', clientId, zones }),
  })
  return parseJson(res)
}
