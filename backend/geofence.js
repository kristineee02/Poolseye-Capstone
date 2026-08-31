const { get, run, all } = require('./db')

const DEFAULT_CAMERA = 'CAM-01'
const EDITOR_WIDTH = 1000
const EDITOR_HEIGHT = 512

const TYPE_TO_DETECTION = {
  warning: { key: 'yellow', label: 'monitor', name: 'Yellow Zone' },
  danger: { key: 'red', label: 'intrusion', name: 'Red Zone' },
  transition: { key: 'orange', label: 'deep_pool', name: 'Orange Zone' },
}

const DEFAULT_ZONES = [
  {
    id: 'zone-warning',
    name: 'Outer safety',
    type: 'warning',
    direction: 'toward',
    activeDuringStandby: true,
    points: [
      { x: 80, y: 70 },
      { x: 920, y: 70 },
      { x: 920, y: 460 },
      { x: 80, y: 460 },
    ],
  },
  {
    id: 'zone-danger',
    name: 'Warning boundary',
    type: 'danger',
    direction: 'toward',
    activeDuringStandby: true,
    points: [
      { x: 220, y: 130 },
      { x: 800, y: 130 },
      { x: 800, y: 420 },
      { x: 220, y: 420 },
    ],
  },
  {
    id: 'zone-transition',
    name: 'Deep pool',
    type: 'transition',
    direction: 'toward',
    activeDuringStandby: true,
    points: [
      { x: 380, y: 200 },
      { x: 700, y: 200 },
      { x: 700, y: 380 },
      { x: 380, y: 380 },
    ],
  },
]

const sseClients = new Set()
let liveState = null

function clamp(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function normalizeZones(input) {
  if (!Array.isArray(input)) {
    throw Object.assign(new Error('zones must be an array'), { status: 400 })
  }

  return input.map((zone, index) => {
    if (!zone || typeof zone !== 'object') {
      throw Object.assign(new Error(`Invalid zone at index ${index}`), { status: 400 })
    }
    const type = String(zone.type || '')
    if (!TYPE_TO_DETECTION[type]) {
      throw Object.assign(new Error(`Unknown zone type "${zone.type}"`), { status: 400 })
    }
    const points = Array.isArray(zone.points) ? zone.points : []
    return {
      id: String(zone.id || `zone-${type}-${index + 1}`),
      name: String(zone.name || TYPE_TO_DETECTION[type].name).slice(0, 80),
      type,
      direction: zone.direction === 'both' || zone.direction === 'away' ? zone.direction : 'toward',
      activeDuringStandby: zone.activeDuringStandby !== false,
      points: points.map((p) => ({
        x: Math.round(clamp(p?.x, 0, EDITOR_WIDTH)),
        y: Math.round(clamp(p?.y, 0, EDITOR_HEIGHT)),
      })),
    }
  })
}

function emptyDetectionBlock(meta) {
  return {
    enabled: false,
    name: meta.name,
    label: meta.label,
    geometry: 'polygon',
    points: [],
  }
}

function zonesToDetection(zones) {
  const detection = {
    coord_space: 'editor',
    editor_size: [EDITOR_WIDTH, EDITOR_HEIGHT],
    orange_proximity: 0.02,
    yellow: emptyDetectionBlock(TYPE_TO_DETECTION.warning),
    red: emptyDetectionBlock(TYPE_TO_DETECTION.danger),
    orange: emptyDetectionBlock(TYPE_TO_DETECTION.transition),
  }

  for (const zone of zones) {
    const meta = TYPE_TO_DETECTION[zone.type]
    if (!meta) continue
    const points = (zone.points || []).map((p) => [p.x, p.y])
    const current = detection[meta.key]
    if (current.points.length > 0 && points.length < current.points.length) continue
    detection[meta.key] = {
      enabled: zone.activeDuringStandby !== false && points.length >= 3,
      name: zone.name,
      label: meta.label,
      geometry: 'polygon',
      points,
    }
  }

  return detection
}

function toPayload(layout, zones, extra = {}) {
  return {
    cameraId: layout.camera_id,
    revision: layout.revision,
    coordSpace: layout.coord_space,
    editorSize: [layout.editor_width, layout.editor_height],
    updatedAt: layout.updated_at,
    zones,
    detection: zonesToDetection(zones),
    ...extra,
  }
}

function setLiveState(payload) {
  liveState = payload
  return liveState
}

function getLiveState() {
  return liveState
}

function broadcast(payload) {
  const frame = `data: ${JSON.stringify(payload)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(frame)
    } catch {
      sseClients.delete(client)
    }
  }
}

function addSseClient(res) {
  sseClients.add(res)
  return () => sseClients.delete(res)
}

async function readLayout(db, cameraId = DEFAULT_CAMERA) {
  const layout = await get(db, 'SELECT * FROM geofence_layouts WHERE camera_id = ?', [cameraId])
  if (!layout) return null

  const zoneRows = await all(
    db,
    'SELECT * FROM geofence_zones WHERE camera_id = ? ORDER BY sort_order ASC, name ASC',
    [cameraId]
  )
  const pointRows = zoneRows.length
    ? await all(
        db,
        `SELECT zone_id, seq, x, y FROM geofence_points
         WHERE zone_id IN (${zoneRows.map(() => '?').join(',')})
         ORDER BY zone_id, seq`,
        zoneRows.map((z) => z.id)
      )
    : []

  const pointsByZone = new Map()
  for (const row of pointRows) {
    if (!pointsByZone.has(row.zone_id)) pointsByZone.set(row.zone_id, [])
    pointsByZone.get(row.zone_id).push({ x: row.x, y: row.y })
  }

  const zones = zoneRows.map((z) => ({
    id: z.id,
    name: z.name,
    type: z.type,
    direction: z.direction,
    activeDuringStandby: Boolean(z.active_during_standby),
    points: pointsByZone.get(z.id) || [],
  }))

  return toPayload(layout, zones, { persisted: true })
}

async function writeLayout(db, cameraId, zones, { persist } = { persist: true }) {
  const normalized = normalizeZones(zones)
  const now = new Date().toISOString()

  if (persist) {
    await run(db, 'BEGIN IMMEDIATE')
    try {
      const existing = await get(
        db,
        'SELECT revision FROM geofence_layouts WHERE camera_id = ?',
        [cameraId]
      )
      const revision = (existing?.revision || 0) + 1

      await run(
        db,
        `INSERT INTO geofence_layouts (camera_id, revision, coord_space, editor_width, editor_height, updated_at)
         VALUES (?, ?, 'editor', ?, ?, ?)
         ON CONFLICT(camera_id) DO UPDATE SET
           revision = excluded.revision,
           coord_space = excluded.coord_space,
           editor_width = excluded.editor_width,
           editor_height = excluded.editor_height,
           updated_at = excluded.updated_at`,
        [cameraId, revision, EDITOR_WIDTH, EDITOR_HEIGHT, now]
      )

      const oldZones = await all(db, 'SELECT id FROM geofence_zones WHERE camera_id = ?', [cameraId])
      if (oldZones.length) {
        await run(
          db,
          `DELETE FROM geofence_points WHERE zone_id IN (${oldZones.map(() => '?').join(',')})`,
          oldZones.map((z) => z.id)
        )
      }
      await run(db, 'DELETE FROM geofence_zones WHERE camera_id = ?', [cameraId])

      for (let i = 0; i < normalized.length; i += 1) {
        const zone = normalized[i]
        await run(
          db,
          `INSERT INTO geofence_zones
             (id, camera_id, name, type, direction, active_during_standby, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [zone.id, cameraId, zone.name, zone.type, zone.direction, zone.activeDuringStandby ? 1 : 0, i]
        )
        for (let seq = 0; seq < zone.points.length; seq += 1) {
          const p = zone.points[seq]
          await run(
            db,
            'INSERT INTO geofence_points (zone_id, seq, x, y) VALUES (?, ?, ?, ?)',
            [zone.id, seq, p.x, p.y]
          )
        }
      }

      await run(db, 'COMMIT')
    } catch (err) {
      try { await run(db, 'ROLLBACK') } catch { /* ignore */ }
      throw err
    }
  }

  const layout = persist
    ? await get(db, 'SELECT * FROM geofence_layouts WHERE camera_id = ?', [cameraId])
    : {
        camera_id: cameraId,
        revision: (liveState?.revision || 0) + 1,
        coord_space: 'editor',
        editor_width: EDITOR_WIDTH,
        editor_height: EDITOR_HEIGHT,
        updated_at: now,
      }

  return toPayload(layout, normalized, { persisted: Boolean(persist) })
}

async function seedGeofence(db) {
  const existing = await get(db, 'SELECT camera_id FROM geofence_layouts WHERE camera_id = ?', [DEFAULT_CAMERA])
  if (existing) {
    const payload = await readLayout(db, DEFAULT_CAMERA)
    setLiveState(payload)
    console.log('Geofence layout loaded for', DEFAULT_CAMERA)
    return payload
  }

  const payload = await writeLayout(db, DEFAULT_CAMERA, DEFAULT_ZONES, { persist: true })
  setLiveState(payload)
  console.log('Default geofence layout seeded for', DEFAULT_CAMERA)
  return payload
}

module.exports = {
  DEFAULT_CAMERA,
  DEFAULT_ZONES,
  addSseClient,
  broadcast,
  getLiveState,
  readLayout,
  seedGeofence,
  setLiveState,
  writeLayout,
}
