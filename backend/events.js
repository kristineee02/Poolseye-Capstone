const { get, all, run } = require('./db')

const DEMO_EVENTS = [
  {
    id: 'evt-1',
    type: 'alarm',
    code: 'DRN',
    title: 'Possible Drowning',
    meta: 'Red Zone · 2:15 PM · HIGH',
    event_time: '2:15 PM',
    event_date: 'Today',
    status: 'pending',
    severity: 'HIGH',
    category: 'drowning',
    confidence: 0.94,
    camera: 'CAM-01',
    is_alert: 1,
    ts: Date.now() / 1000 - 3600,
  },
  {
    id: 'evt-2',
    type: 'alarm',
    code: 'INT',
    title: 'Unauthorized Intrusion',
    meta: 'Red Zone · 2:10 PM · HIGH',
    event_time: '2:10 PM',
    event_date: 'Today',
    status: 'resolved',
    severity: 'HIGH',
    category: 'intrusion',
    confidence: 0.91,
    camera: 'CAM-01',
    is_alert: 1,
    ts: Date.now() / 1000 - 3900,
  },
  {
    id: 'evt-3',
    type: 'warn',
    code: 'CH',
    title: 'Unsupervised Child',
    meta: 'Yellow Zone · 1:58 PM · MEDIUM',
    event_time: '1:58 PM',
    event_date: 'Today',
    status: 'resolved',
    severity: 'MEDIUM',
    category: 'child',
    confidence: 0.87,
    camera: 'CAM-01',
    is_alert: 1,
    ts: Date.now() / 1000 - 4620,
  },
  {
    id: 'evt-4',
    type: 'info',
    code: 'DP',
    title: 'Deep-Water Entry',
    meta: 'Deep-Water Boundary · 1:55 PM · MEDIUM',
    event_time: '1:55 PM',
    event_date: 'Today',
    status: 'resolved',
    severity: 'MEDIUM',
    category: 'deep-water',
    confidence: 0.85,
    camera: 'CAM-01',
    is_alert: 0,
    ts: Date.now() / 1000 - 4800,
  },
  {
    id: 'evt-5',
    type: 'warn',
    code: 'YL',
    title: 'Yellow Zone Warning',
    meta: 'Yellow Zone · 1:40 PM · LOW',
    event_time: '1:40 PM',
    event_date: 'Today',
    status: 'resolved',
    severity: 'LOW',
    category: 'yellow',
    confidence: 0.78,
    camera: 'CAM-01',
    is_alert: 0,
    ts: Date.now() / 1000 - 5700,
  },
]

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
    ts: row.ts,
  }
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
  }
}

async function seedDemoEvents(db) {
  const row = await get(db, 'SELECT COUNT(*) AS count FROM events')
  if (row?.count > 0) return

  for (const event of DEMO_EVENTS) {
    await run(
      db,
      `INSERT INTO events (
        id, type, code, title, meta, event_time, event_date, status,
        severity, category, confidence, camera, is_alert, ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.type,
        event.code,
        event.title,
        event.meta,
        event.event_time,
        event.event_date,
        event.status,
        event.severity,
        event.category,
        event.confidence,
        event.camera,
        event.is_alert,
        event.ts,
      ]
    )
  }
  console.log('Demo events seeded:', DEMO_EVENTS.length)
}

async function insertEvent(db, payload) {
  const e = normalizeIngestPayload(payload)
  await run(
    db,
    `INSERT INTO events (
      id, type, code, title, meta, event_time, event_date, status,
      severity, category, confidence, camera, person_id, zone, zone_label,
      event_name, is_alert, snapshot_uri, ts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ]
  )
  const row = await get(db, 'SELECT * FROM events WHERE id = ?', [e.id])
  return rowToEvent(row)
}

function registerEventRoutes(app, db, adminRequired) {
  app.get('/api/events', adminRequired, async (req, res) => {
    try {
      const search = String(req.query.search || '').trim().toLowerCase()
      const type = String(req.query.type || 'all')
      const status = String(req.query.status || 'all')
      const camera = String(req.query.camera || 'all')
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 4))

      const conditions = []
      const params = []

      if (search) {
        conditions.push('(LOWER(title) LIKE ? OR LOWER(meta) LIKE ? OR LOWER(camera) LIKE ?)')
        const q = `%${search}%`
        params.push(q, q, q)
      }
      if (type !== 'all') {
        conditions.push('type = ?')
        params.push(type)
      }
      if (status !== 'all') {
        conditions.push('status = ?')
        params.push(status)
      }
      if (camera !== 'all') {
        conditions.push('camera = ?')
        params.push(camera)
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
        events: rows.map(rowToEvent),
        total,
        page,
        pageSize,
        totalPages,
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

  app.get('/api/events/:id', adminRequired, async (req, res) => {
    try {
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [req.params.id])
      if (!row) return res.status(404).json({ error: 'Event not found' })
      res.json({ event: rowToEvent(row) })
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

      await run(db, 'UPDATE events SET status = ? WHERE id = ?', [status, req.params.id])
      const updated = await get(db, 'SELECT * FROM events WHERE id = ?', [req.params.id])
      res.json({ ok: true, event: rowToEvent(updated) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to update event' })
    }
  })

  app.post('/api/events/ingest', async (req, res) => {
    try {
      const secret = process.env.EVENTS_INGEST_SECRET
      if (secret) {
        const provided = req.headers['x-events-secret'] || req.body?.secret
        if (provided !== secret) {
          return res.status(401).json({ error: 'Unauthorized' })
        }
      }

      const event = await insertEvent(db, req.body)
      res.status(201).json({ ok: true, event })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to ingest event' })
    }
  })
}

module.exports = {
  registerEventRoutes,
  seedDemoEvents,
  rowToEvent,
  insertEvent,
}
