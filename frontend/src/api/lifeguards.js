/**
 * Lifeguard accounts — backed by Express API (admin-provisioned only).
 */

import { API_BASE } from '../config'

const ADMIN_SESSION_KEY = 'poolseye-admin-session'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

export function isValidEmail(email) {
  return EMAIL_RE.test(String(email || '').trim().toLowerCase())
}

export async function fetchLifeguards() {
  const result = await apiFetch('/api/lifeguards')
  if (!result.ok) {
    console.warn('[lifeguards]', result.error)
    return []
  }
  return result.guards || []
}

export async function isEmailVerified(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return false
  const result = await apiFetch(
    `/api/lifeguards/verify-email/status?email=${encodeURIComponent(normalized)}`
  )
  return Boolean(result.ok && result.verified)
}

export async function sendVerificationCode(email) {
  return apiFetch('/api/lifeguards/verify-email/send', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function confirmVerificationCode(email, code) {
  return apiFetch('/api/lifeguards/verify-email/confirm', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export async function sendWelcomeEmail({ email, name, tempPassword }) {
  return apiFetch('/api/lifeguards/welcome-email', {
    method: 'POST',
    body: JSON.stringify({ email, name, tempPassword }),
  })
}

export async function createLifeguard({
  name,
  email,
  phone,
  role,
  assignedZones,
  tempPassword,
  photoUri = null,
}) {
  return apiFetch('/api/lifeguards', {
    method: 'POST',
    body: JSON.stringify({
      name,
      email,
      phone,
      role,
      assignedZones,
      tempPassword,
      photoUri,
    }),
  })
}

export async function updateLifeguard(id, updates) {
  return apiFetch(`/api/lifeguards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function archiveLifeguard(id) {
  return apiFetch(`/api/lifeguards/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  })
}

export async function restoreLifeguard(id) {
  return apiFetch(`/api/lifeguards/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  })
}
