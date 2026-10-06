import { STREAM_BASE } from '../config'

const ADMIN_SESSION_KEY = 'poolseye-admin-session'

export const ACCEPTED_VIDEO_TYPES = '.mp4,.mov,.avi,.mkv,.webm,.m4v,video/*'

function adminToken() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || '{}')?.token || null
  } catch {
    return null
  }
}

/** Upload a video to the stream server; it replaces the CCTV feed with detection running. */
export function uploadVideo(file, onProgress) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${STREAM_BASE}/upload`)
    const token = adminToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText || '{}') } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true, ...data })
      else resolve({ ok: false, error: data.error || `Upload failed (${xhr.status})` })
    }
    xhr.onerror = () => resolve({ ok: false, error: 'Cannot reach the stream server. Is live_server.py running?' })

    const form = new FormData()
    form.append('video', file)
    xhr.send(form)
  })
}

export async function returnToLiveFeed() {
  const token = adminToken()
  try {
    const res = await fetch(`${STREAM_BASE}/source/live`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || `Request failed (${res.status})` }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: 'Cannot reach the stream server.' }
  }
}
