import { API_BASE } from '../config'

const ADMIN_SESSION_KEY = 'poolseye-admin-session'

// Fired on window after a reset so panels showing events reload right away.
export const DATA_RESET_EVENT = 'poolseye:data-reset'

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
  if (!res.ok) return { ok: false, status: res.status, code: data.code, error: data.error || `Request failed (${res.status})` }
  return { ok: true, ...data }
}

async function sha256Hex(buffer) {
  if (!globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function saveFile(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function readBackupBytes(res, onProgress) {
  const total = Number(res.headers.get('Content-Length')) || 0
  if (!res.body?.getReader) {
    onProgress({ percent: null, stage: 'Receiving database file…', indeterminate: true })
    const buffer = await res.arrayBuffer()
    await new Promise((resolve) => setTimeout(resolve, 900))
    onProgress({ percent: 100, stage: 'File received. Checking integrity…' })
    return buffer
  }

  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  let actualPercent = 0
  let displayedPercent = 0
  let finishSmoothing
  const smoothingDone = new Promise((resolve) => { finishSmoothing = resolve })
  const smoothingTimer = total
    ? setInterval(() => {
        if (displayedPercent >= actualPercent) return
        displayedPercent = Math.min(actualPercent, displayedPercent + 2)
        onProgress({
          percent: displayedPercent,
          stage: displayedPercent === 100
            ? 'File received. Checking integrity…'
            : `Receiving database file… ${displayedPercent}%`,
        })
        if (displayedPercent === 100) finishSmoothing()
      }, 40)
    : null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      const ratio = total ? Math.min(received / total, 1) : 0
      if (total) {
        // Keep 100% reserved for the point where the stream has actually ended.
        actualPercent = Math.min(Math.round(ratio * 100), 99)
      } else {
        onProgress({ percent: null, stage: 'Receiving database file…', indeterminate: true })
      }
    }

    if (total) {
      actualPercent = 100
      await smoothingDone
    }
  } finally {
    if (smoothingTimer) clearInterval(smoothingTimer)
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (!total) onProgress({ percent: 100, stage: 'File received. Checking integrity…' })
  return bytes.buffer
}

export function fetchDataSummary() {
  return request('/api/admin/data/summary', { cache: 'no-store' })
}

export function fetchResetLog(limit = 5) {
  return request(`/api/admin/data/reset-log?limit=${limit}`, { cache: 'no-store' })
}

/**
 * Downloads a fresh backup, saves it to the computer, then has the server confirm
 * the saved bytes match what it produced. Only a verified backup unlocks Reset.
 */
export async function createBackup(onProgress = () => {}) {
  // Snapshot creation has no meaningful byte total yet, so show an honest
  // indeterminate state instead of a simulated percentage.
  onProgress({ percent: null, stage: 'Preparing a consistent database snapshot…', indeterminate: true })

  let res
  try {
    res = await fetch(`${API_BASE}/api/admin/data/backup`, {
      method: 'POST',
      headers: authHeaders(),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, error: 'Cannot reach backend server.' }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || `Backup failed (${res.status})` }
  }

  const backupId = res.headers.get('X-Backup-Id')
  const disposition = res.headers.get('Content-Disposition') || ''
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] || 'poolseye-backup.sqlite3'

  let buffer
  try {
    onProgress({ percent: 0, stage: 'Receiving database file…' })
    buffer = await readBackupBytes(res, onProgress)
  } catch {
    return { ok: false, error: 'The backup download was interrupted. Try again.' }
  }
  if (!backupId || !buffer.byteLength) {
    return { ok: false, error: 'The server sent an empty backup. Try again.' }
  }

  onProgress({ percent: 100, stage: 'File received. Calculating checksum…' })
  const sha256 = await sha256Hex(buffer)
  if (!sha256) {
    return { ok: false, error: 'This browser cannot securely verify the backup file.' }
  }
  const serverHash = String(res.headers.get('X-Backup-Sha256') || '').toLowerCase()
  if (!serverHash || sha256 !== serverHash) {
    return { ok: false, error: 'Backup verification failed: the downloaded bytes do not match the server snapshot.' }
  }

  onProgress({ percent: 100, stage: 'File received. Verifying with the server…' })
  const verified = await request(`/api/admin/data/backup/${encodeURIComponent(backupId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({ sha256 }),
  })
  if (!verified.ok) return { ok: false, error: verified.error || 'Could not verify the backup.' }

  // Render the completed 100% state before exposing the browser Save/download.
  onProgress({ percent: 100, stage: '100% complete and verified. Starting download…' })
  await new Promise((resolve) => setTimeout(resolve, 450))
  saveFile(new Blob([buffer], { type: 'application/vnd.sqlite3' }), fileName)
  return { ok: true, backup: verified.backup }
}

export function resetData({ categories, backupId, confirm }) {
  return request('/api/admin/data/reset', {
    method: 'POST',
    body: JSON.stringify({ categories, backupId, confirm }),
  })
}
