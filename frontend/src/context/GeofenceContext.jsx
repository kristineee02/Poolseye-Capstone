import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { initialZones } from '../data/geofence'
import { fetchGeofence, getGeofenceStreamUrl, publishLiveGeofence, saveGeofence } from '../api/geofence'

const GeofenceContext = createContext(null)
const CHANNEL_NAME = 'poolseye-geofence'

function cloneZones(zones) {
  return (zones || []).map((z) => ({
    ...z,
    points: (z.points || []).map((p) => ({ x: p.x, y: p.y })),
  }))
}

function makeClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `geofence-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function GeofenceProvider({ children }) {
  const clientIdRef = useRef(makeClientId())
  const channelRef = useRef(null)
  const liveTimerRef = useRef(null)
  const lastSavedRef = useRef(cloneZones(initialZones))
  const zonesRef = useRef(initialZones)
  const dirtyRef = useRef(false)

  const [zones, setZonesState] = useState(initialZones)
  const [revision, setRevision] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncError, setSyncError] = useState(null)

  const applyPayload = useCallback((payload, { markSaved = false, fromSelf = false } = {}) => {
    if (!payload?.zones) return
    const next = cloneZones(payload.zones)
    zonesRef.current = next
    setZonesState(next)
    if (typeof payload.revision === 'number') setRevision(payload.revision)
    if (payload.updatedAt) setUpdatedAt(payload.updatedAt)
    if (markSaved || payload.persisted) {
      lastSavedRef.current = cloneZones(payload.zones)
      if (!fromSelf) {
        dirtyRef.current = false
        setDirty(false)
      }
    }
  }, [])

  const broadcastLocal = useCallback((payload) => {
    try {
      channelRef.current?.postMessage(payload)
    } catch {
      /* BroadcastChannel unsupported */
    }
  }, [])

  const publishLive = useCallback((nextZones) => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current)
    liveTimerRef.current = setTimeout(async () => {
      const snapshot = cloneZones(nextZones)
      const payload = {
        clientId: clientIdRef.current,
        zones: snapshot,
        persisted: false,
        updatedAt: new Date().toISOString(),
      }
      broadcastLocal(payload)
      try {
        await publishLiveGeofence(snapshot, clientIdRef.current)
        setSyncError(null)
      } catch (err) {
        setSyncError(err.message || 'Live geofence sync unavailable')
      }
    }, 120)
  }, [broadcastLocal])

  const setZones = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(zonesRef.current) : next
    zonesRef.current = resolved
    setZonesState(resolved)
    dirtyRef.current = true
    setDirty(true)
    publishLive(resolved)
  }, [publishLive])

  const save = useCallback(async (overrideZones) => {
    const snapshot = cloneZones(overrideZones || zones)
    setSaving(true)
    try {
      const payload = await saveGeofence(snapshot, clientIdRef.current)
      applyPayload(payload, { markSaved: true, fromSelf: true })
      dirtyRef.current = false
      setDirty(false)
      setSyncError(null)
      broadcastLocal({ ...payload, clientId: clientIdRef.current })
      return payload
    } catch (err) {
      setSyncError(err.message || 'Failed to save geofence')
      throw err
    } finally {
      setSaving(false)
    }
  }, [applyPayload, broadcastLocal, zones])

  const discard = useCallback(() => {
    const restored = cloneZones(lastSavedRef.current)
    zonesRef.current = restored
    setZonesState(restored)
    dirtyRef.current = false
    setDirty(false)
    publishLive(restored)
    return restored
  }, [publishLive])

  useEffect(() => {
    let cancelled = false
    fetchGeofence()
      .then((payload) => {
        if (cancelled) return
        applyPayload(payload, { markSaved: true })
        setSyncError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setSyncError(err.message || 'Using local geofence defaults')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [applyPayload])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel
    channel.onmessage = (event) => {
      const payload = event.data
      if (!payload?.zones || payload.clientId === clientIdRef.current) return
      applyPayload(payload, { markSaved: Boolean(payload.persisted) })
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [applyPayload])

  useEffect(() => {
    let source
    try {
      source = new EventSource(getGeofenceStreamUrl())
    } catch {
      return undefined
    }
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (!payload?.zones || payload.clientId === clientIdRef.current) return
        if (dirtyRef.current && !payload.persisted) return
        applyPayload(payload, { markSaved: Boolean(payload.persisted) })
        setSyncError(null)
      } catch {
        /* ignore malformed frames */
      }
    }
    source.onerror = () => {}
    return () => source.close()
  }, [applyPayload])

  useEffect(() => () => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current)
  }, [])

  const value = useMemo(
    () => ({
      zones,
      setZones,
      revision,
      updatedAt,
      dirty,
      loading,
      saving,
      syncError,
      save,
      discard,
    }),
    [discard, dirty, loading, revision, save, saving, setZones, syncError, updatedAt, zones],
  )

  return <GeofenceContext.Provider value={value}>{children}</GeofenceContext.Provider>
}

export function useGeofence() {
  const ctx = useContext(GeofenceContext)
  if (!ctx) throw new Error('useGeofence must be used within GeofenceProvider')
  return ctx
}
