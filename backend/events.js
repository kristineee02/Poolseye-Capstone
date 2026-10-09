const express = require('express')
const { get, all, run } = require('./db')
const { dispatchEvent } = require('./dispatch')
const { MEDIA_DIR, MEDIA_ROUTE, saveMedia, removeMedia } = require('./mediaStorage')

const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', column: 'snapshot_uri', resourceType: 'image' },
  'video/webm': { ext: 'webm', column: 'clip_uri', resourceType: 'video' },
}

function ingestAuthorized(req) {
  const secret = process.env.EVENTS_INGEST_SECRET
  if (!secret) return true
  return (req.headers['x-events-secret'] || req.body?.secret) === secret
}

// Ids of the sample events earlier builds seeded into every new database.
// Live events use evt-<10 hex chars>, so these never match real detections.
const LEGACY_DEMO_EVENT_IDS = ['evt-1', 'evt-2', 'evt-3', 'evt-4', 'evt-5']

function rowToEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    type: row.type,
    code: row.code,
    title: row.title,
    meta: row.meta,
    time: row.event_time,
    date: row.event_date,
    status: row.status,
    severity: row.severity,
    category: row.category,
    confidence: row.confidence,
    camera: row.camera,
    person_id: row.person_id,
    zone: row.zone,
    zone_label: row.zone_label,
    event: row.event_name,
    is_alert: Boolean(row.is_alert),
    snapshot_uri: row.snapshot_uri,
    clip_uri: row.clip_uri ?? null,
    acknowledged_at: row.acknowledged_at ?? null,
    acknowledged_by: row.acknowledged_by ?? null,
    dispatched_at: row.dispatched_at ?? null,
    dispatched_by: row.dispatched_by ?? null,
    responding_at: row.responding_at ?? null,
    responding_by: row.responding_by ?? null,
    escalated_at: row.escalated_at ?? null,
    ts: row.ts,
    // Supervision-specific fields
    separation_distance: row.separation_distance,
    supervision_threshold: row.supervision_threshold,
    boundary_direction: row.boundary_direction,
    nearest_person_id: row.nearest_person_id ?? null,
    nearest_confidence: row.nearest_confidence ?? null,
  }
}

/** rowToEvent for many rows, plus the name of the lifeguard responding to each. */
async function eventsWithResponders(db, rows) {
  const ids = [...new Set(rows.map((r) => r.responding_by).filter((v) => v != null))]
  const names = new Map()
  if (ids.length) {
    const users = await all(db, `SELECT id, name FROM users WHERE id IN (${ids.map(() => '?').join(', ')})`, ids)
    for (const u of users) names.set(u.id, u.name)
  }
  return rows.map((row) => ({ ...rowToEvent(row), responder_name: names.get(row.responding_by) ?? null }))
}

async function eventWithResponder(db, row) {
  if (!row) return null
  const [event] = await eventsWithResponders(db, [row])
  return event
}

async function setEventStatus(db, id, status, userId) {
  if (status === 'pending') {
    await run(
      db,
      'UPDATE events SET status = ?, acknowledged_at = NULL, acknowledged_by = NULL WHERE id = ?',
      [status, id]
    )
    return
  }
  await run(
    db,
    `UPDATE events SET status = ?,
      acknowledged_at = COALESCE(acknowledged_at, ?),
      acknowledged_by = COALESCE(acknowledged_by, ?)
     WHERE id = ?`,
    [status, Date.now() / 1000, userId ?? null, id]
  )
}

function normalizeIngestPayload(body) {
  const id = String(body?.id || `evt-${Date.now()}`)
  const ts = Number(body?.ts) || Date.now() / 1000
  return {
    id,
    type: String(body?.type || 'info'),
    code: body?.code ? String(body.code) : null,
    title: String(body?.title || 'Zone event'),
    meta: body?.meta ? String(body.meta) : null,
    event_time: body?.time ? String(body.time) : body?.event_time ? String(body.event_time) : null,
    event_date: body?.date ? String(body.date) : body?.event_date ? String(body.event_date) : null,
    status: String(body?.status || (body?.is_alert ? 'pending' : 'resolved')),
    severity: body?.severity ? String(body.severity) : null,
    category: body?.category ? String(body.category) : null,
    confidence: body?.confidence != null ? Number(body.confidence) : null,
    camera: String(body?.camera || 'CAM-01'),
    person_id: body?.person_id != null ? Number(body.person_id) : null,
    zone: body?.zone ? String(body.zone) : null,
    zone_label: body?.zone_label ? String(body.zone_label) : null,
    event_name: body?.event ? String(body.event) : body?.event_name ? String(body.event_name) : null,
    is_alert: body?.is_alert ? 1 : 0,
    snapshot_uri: body?.snapshot_uri ? String(body.snapshot_uri) : null,
    ts,
    // Supervision-specific fields
    separation_distance: body?.separation_distance != null ? Number(body.separation_distance) : null,
    supervision_threshold: body?.supervision_threshold != null ? Number(body.supervision_threshold) : null,
    boundary_direction: body?.boundary_direction ? String(body.boundary_direction) : null,
    nearest_person_id: body?.nearest_person_id != null ? Number(body.nearest_person_id) : null,
    nearest_confidence: body?.nearest_confidence != null ? Number(body.nearest_confidence) : null,
  }
}

async function removeLegacyDemoEvents(db) {
  const placeholders = LEGACY_DEMO_EVENT_IDS.map(() => '?').join(', ')
  const result = await run(db, `DELETE FROM events WHERE id IN (${placeholders})`, LEGACY_DEMO_EVENT_IDS)
  if (result?.changes) console.log('Removed sample events from earlier builds:', result.changes)
}

async function insertEvent(db, payload) {
  const e = normalizeIngestPayload(payload)
  await run(
    db,
    `INSERT INTO events (
      id, type, code, title, meta, event_time, event_date, status,
      severity, category, confidence, camera, person_id, zone, zone_label,
      event_name, is_alert, snapshot_uri, ts,
      separation_distance, supervision_threshold, boundary_direction,
      nearest_person_id, nearest_confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      meta = excluded.meta,
      ts = excluded.ts`,
    [
      e.id,
      e.type,
      e.code,
      e.title,
      e.meta,
      e.event_time,
      e.event_date,
      e.status,
      e.severity,
      e.category,
      e.confidence,
      e.camera,
      e.person_id,
      e.zone,
      e.zone_label,
      e.event_name,
      e.is_alert,
      e.snapshot_uri,
      e.ts,
      e.separation_distance,
      e.supervision_threshold,
      e.boundary_direction,
      e.nearest_person_id,
      e.nearest_confidence,
    ]
  )
  const row = await get(db, 'SELECT * FROM events WHERE id = ?', [e.id])
  return rowToEvent(row)
}

const ALERT_SQL = "(is_alert = 1 OR type = 'alarm')"

const TEST_ALERTS = {
  intrusion: {
    type: 'alarm', code: 'INT', title: 'Red Zone Intrusion', severity: 'HIGH',
    category: 'intrusion', zone: 'red', zone_label: 'Red zone', event: 'RED_ZONE_INTRUSION',
  },
  drowning: {
    type: 'alarm', code: 'DRN', title: 'Possible Drowning', severity: 'HIGH',
    category: 'drowning', zone: 'orange', zone_label: 'Deep pool', event: 'POSSIBLE_DROWNING',
  },
}

function registerEventRoutes(app, db, adminRequired) {
  app.get('/api/events', adminRequired, async (req, res) => {
    try {
      const search = String(req.query.search || '').trim().toLowerCase()
      const type = String(req.query.type || 'all')
      const status = String(req.query.status || 'all')
      const camera = String(req.query.camera || 'all')
      const kind = String(req.query.kind || 'all')
      const since = Number(req.query.since)
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 4))

      const conditions = []
      const params = []

      if (Number.isFinite(since) && since > 0) {
        conditions.push('ts >= ?')
        params.push(since)
      }
      if (kind === 'alerts') {
        conditions.push(ALERT_SQL)
      } else if (kind === 'activity') {
        conditions.push(`NOT ${ALERT_SQL}`)
      } else if (['intrusion', 'deep-water', 'drowning'].includes(kind)) {
        conditions.push('category = ?')
        params.push(kind)
      }

      if (search) {
        conditions.push('(LOWER(title) LIKE ? OR LOWER(meta) LIKE ? OR LOWER(camera) LIKE ?)')
        const q = `%${search}%`
        params.push(q, q, q)
      }
      if (type !== 'all') {
        conditions.push('type = ?')
        params.push(type)
      }
      if (camera !== 'all') {
        conditions.push('camera = ?')
        params.push(camera)
      }

      const baseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const summaryRow = await get(
        db,
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' AND ${ALERT_SQL} THEN 1 ELSE 0 END) AS unacknowledged,
          SUM(CASE WHEN status = 'pending' AND NOT ${ALERT_SQL} THEN 1 ELSE 0 END) AS logged,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS acknowledged,
          SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed
        FROM events ${baseWhere}`,
        params
      )
      const summary = {
        total: summaryRow?.total || 0,
        unacknowledged: summaryRow?.unacknowledged || 0,
        logged: summaryRow?.logged || 0,
        acknowledged: summaryRow?.acknowledged || 0,
        dismissed: summaryRow?.dismissed || 0,
      }

      if (status === 'unacknowledged') {
        conditions.push(`status = 'pending' AND ${ALERT_SQL}`)
      } else if (status === 'logged') {
        conditions.push(`status = 'pending' AND NOT ${ALERT_SQL}`)
      } else if (status !== 'all') {
        conditions.push('status = ?')
        params.push(status)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const countRow = await get(db, `SELECT COUNT(*) AS total FROM events ${where}`, params)
      const total = countRow?.total || 0
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const offset = (page - 1) * pageSize

      const rows = await all(
        db,
        `SELECT * FROM events ${where} ORDER BY ts DESC, created_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      res.json({
        events: await eventsWithResponders(db, rows),
        total,
        page,
        pageSize,
        totalPages,
        summary,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load events' })
    }
  })

  app.get('/api/events/cameras', adminRequired, async (_req, res) => {
    try {
      const rows = await all(
        db,
        'SELECT DISTINCT camera FROM events ORDER BY camera ASC'
      )
      res.json({ cameras: rows.map((r) => r.camera) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load cameras' })
    }
  })

  app.get('/api/events/active', adminRequired, async (_req, res) => {
    try {
      // Get the most recent pending alarm event
      const row = await get(
        db,
        `SELECT * FROM events
         WHERE status = 'pending' AND is_alert = 1
         ORDER BY ts DESC
         LIMIT 1`
      )
      if (!row) {
        return res.json({ active: null })
      }
      res.json({ active: await eventWithResponder(db, row) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load active alert' })
    }
  })

  app.get('/api/events/summary', adminRequired, async (_req, res) => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayTs = todayStart.getTime() / 1000

      // Unsupervised and after-hours alerts raised today
      const intrusionRow = await get(
        db,
        `SELECT COUNT(*) as count FROM events
         WHERE ts >= ? AND is_alert = 1 AND category = 'supervision' AND COALESCE(camera, '') <> 'TEST'`,
        [todayTs]
      )
      // People who were in the pool area with someone within the threshold
      const supervisedRow = await get(
        db,
        `SELECT COUNT(*) as count FROM events
         WHERE ts >= ? AND category = 'supervision' AND event_name = 'SUPERVISED'`,
        [todayTs]
      )

      res.json({
        intrusions_flagged: intrusionRow?.count || 0,
        supervised_visits: supervisedRow?.count || 0,
        since: todayTs,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load summary' })
    }
  })

  app.get('/api/events/:id', adminRequired, async (req, res) => {
    try {
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [req.params.id])
      if (!row) return res.status(404).json({ error: 'Event not found' })
      res.json({ event: await eventWithResponder(db, row) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load event' })
    }
  })

  app.patch('/api/events/:id', adminRequired, async (req, res) => {
    try {
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [req.params.id])
      if (!row) return res.status(404).json({ error: 'Event not found' })

      const status = req.body?.status
      const allowed = ['pending', 'resolved', 'dismissed']
      if (!status || !allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' })
      }

      await setEventStatus(db, req.params.id, status, req.user?.id)
      const updated = await get(db, 'SELECT * FROM events WHERE id = ?', [req.params.id])
      res.json({ ok: true, event: await eventWithResponder(db, updated) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to update event' })
    }
  })

  app.post('/api/events/test', adminRequired, async (req, res) => {
    try {
      const preset = TEST_ALERTS[String(req.body?.kind || 'intrusion')]
      if (!preset) return res.status(400).json({ error: 'Unknown test alert type.' })
      const now = new Date()
      const event = await insertEvent(db, {
        ...preset,
        id: `test-${now.getTime()}`,
        meta: `${preset.zone_label} · Person #0 · Test alert`,
        time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
        date: 'Today',
        status: 'pending',
        camera: 'TEST',
        person_id: 0,
        is_alert: true,
        ts: now.getTime() / 1000,
      })
      res.status(201).json({ ok: true, event })

      if (event.category === 'drowning') {
        dispatchEvent(db, event.id).catch((err) => console.error('Auto-dispatch failed:', err))
      }
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to create test alert' })
    }
  })

  app.post('/api/events/:id/dispatch', adminRequired, async (req, res) => {
    try {
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [req.params.id])
      if (!row) return res.status(404).json({ error: 'Event not found' })
      if (row.status !== 'pending') {
        return res.status(400).json({ error: 'Only active alerts can be sent to lifeguards.' })
      }

      const result = await dispatchEvent(db, row.id, { userId: req.user?.id })
      if (!result) return res.status(409).json({ error: 'This alert was already sent to lifeguards.' })

      const updated = await get(db, 'SELECT * FROM events WHERE id = ?', [row.id])
      res.json({ ok: true, event: await eventWithResponder(db, updated), ...result })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to send alert to lifeguards' })
    }
  })

  app.post('/api/events/ingest', async (req, res) => {
    try {
      if (!ingestAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })

      const event = await insertEvent(db, req.body)
      res.status(201).json({ ok: true, event })

      // The detector only flags drowning after the distress posture holds past its time
      // threshold, so lifeguards are paged right away instead of waiting on an admin.
      if (event.category === 'drowning' && event.is_alert && event.status === 'pending') {
        dispatchEvent(db, event.id).catch((err) => console.error('Auto-dispatch failed:', err))
      }
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to ingest event' })
    }
  })

  // The live detector uploads the alert snapshot (JPEG) and the clip leading up to it (WebM)
  app.post(
    '/api/events/:id/media',
    express.raw({ type: Object.keys(MEDIA_TYPES), limit: '25mb' }),
    async (req, res) => {
      try {
        if (!ingestAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })
        const media = MEDIA_TYPES[String(req.headers['content-type'] || '').split(';')[0].trim()]
        if (!media || !Buffer.isBuffer(req.body) || !req.body.length) {
          return res.status(400).json({ error: 'Send a JPEG snapshot or a WebM clip.' })
        }
        const row = await get(db, 'SELECT id, snapshot_uri, clip_uri FROM events WHERE id = ?', [req.params.id])
        if (!row) return res.status(404).json({ error: 'Event not found' })

        const uri = await saveMedia(req.body, media)
        await run(db, `UPDATE events SET ${media.column} = ? WHERE id = ?`, [uri, row.id])

        removeMedia(row[media.column]).catch(() => {})
        res.status(201).json({ ok: true, uri })
      } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to save event media' })
      }
    }
  )
}

module.exports = {
  MEDIA_DIR,
  MEDIA_ROUTE,
  registerEventRoutes,
  removeLegacyDemoEvents,
  rowToEvent,
  eventsWithResponders,
  insertEvent,
  setEventStatus,
}
