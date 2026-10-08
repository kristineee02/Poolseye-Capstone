
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')
export const STREAM_BASE = (import.meta.env.VITE_STREAM_URL || 'http://localhost:8000').replace(/\/$/, '')

// Alert snapshots and clips are stored by the backend as paths like /media/<file>
export function mediaUrl(uri) {
  if (!uri) return null
  return uri.startsWith('/') ? `${API_BASE}${uri}` : uri
}
