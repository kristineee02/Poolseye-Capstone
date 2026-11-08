const express = require('express')
const { get, all, run, transaction } = require('./db')
const { dispatchEvent, resendUrgent } = require('./dispatch')
const { publishAlertChange } = require('./alertSync')
const { MEDIA_DIR, MEDIA_ROUTE, saveMedia, removeMedia } = require('./mediaStorage')

const SITE_TIME_ZONE = process.env.SITE_TIMEZONE || 'Asia/Manila'

function siteEventTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    timeZone: SITE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', column: 'snapshot_uri', resourceType: 'image' },
  'video/webm': { ext: 'webm', column: 'clip_uri', resourceType: 'video' },
}

function ingestAuthorized(req) {
  const secret = process.env.EVENTS_INGEST_SECRET
  if (!secret) return true
  return (req.headers['x-events-secret'] || req.body?.secret) === secret
}

// Sample events seeded by earlier builds
const LEGACY_DEMO_EVENT_IDS = ['evt-1', 'evt-2', 'evt-3', 'evt-4', 'evt-5']
const TEST_EVENT_TTL_SEC = 24 * 60 * 60
const LEFT_ZONE_TITLES = ['Left Deep Pool', 'Left Red Zone', 'Left Pool Area']
const HIDDEN_EVENTS_SQL = `COALESCE(title, '') NOT IN (${LEFT_ZONE_TITLES.map((t) => `'${t}'`).join(', ')})`
// Event history and its counts only cover detections, not test alerts or admin broadcasts.
const REAL_EVENTS_SQL = `COALESCE(camera, '') <> 'TEST' AND COALESCE(category, '') <> 'broadcast' AND ${HIDDEN_EVENTS_SQL}`

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
    closed_at: row.closed_at ?? null,
    closed_by: row.closed_by ?? null,
    dispatched_at: row.dispatched_at ?? null,
    dispatched_by: row.dispatched_by ?? null,
    responding_at: row.responding_at ?? null,
    responding_by: row.responding_by ?? null,
    escalated_at: row.escalated_at ?? null,
    priority: Number(row.priority || 4),
    priority_label: row.priority_label || 'informational',
    incident_key: row.incident_key || null,
    group_key: row.group_key || null,
    person_ids: parsePersonIds(row.person_ids, row.person_id),
    affected_count: parsePersonIds(row.person_ids, row.person_id).length || 1,
    occurrence_count: Number(row.occurrence_count || 1),
    first_detected_at: row.first_detected_at ?? row.ts,
    last_detected_at: row.last_detected_at ?? row.ts,
    notification_count: Number(row.notification_count || 0),
    last_notified_at: row.last_notified_at ?? null,
    siren_activated_at: row.siren_activated_at ?? null,
    ts: row.ts,
    // Supervision-specific fields
    separation_distance: row.separation_distance,
    supervision_threshold: row.supervision_threshold,
    boundary_direction: row.boundary_direction,
    nearest_person_id: row.nearest_person_id ?? null,
    nearest_confidence: row.nearest_confidence ?? null,
  }
}

const PRIORITY_BY_CATEGORY = {
  drowning: { value: 1, label: 'critical', severity: 'CRITICAL' },
  intrusion: { value: 2, label: 'high', severity: 'HIGH' },
  'deep-water': { value: 2, label: 'high', severity: 'HIGH' },
  supervision: { value: 3, label: 'medium', severity: 'MEDIUM' },
}

function parsePersonIds(value, fallback = null) {
  let values = value
  if (typeof values === 'string') {
    try { values = JSON.parse(values) } catch { values = values.match(/\d+/g) || [] }
  }
  if (!Array.isArray(values)) values = []
  if (fallback != null) values.push(fallback)
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
}

function payloadPersonIds(body) {
  const explicit = parsePersonIds(body?.person_ids, body?.person_id)
  if (explicit.length) return explicit
  return parsePersonIds(String(body?.meta || '').match(/#\d+/g)?.map((v) => v.slice(1)) || [])
}

function incidentPriority(category, isAlert, eventName, requestedSeverity = null) {
  if (!isAlert || category === 'yellow' || eventName === 'SUPERVISED') {
    return { value: 4, label: 'informational', severity: 'LOW' }
  }
  if (PRIORITY_BY_CATEGORY[category]) return PRIORITY_BY_CATEGORY[category]
  const severity = String(requestedSeverity || 'MEDIUM').toUpperCase()
  if (severity === 'CRITICAL') return { value: 1, label: 'critical', severity }
  if (severity === 'HIGH') return { value: 2, label: 'high', severity }
  if (severity === 'LOW') return { value: 4, label: 'informational', severity }
  return { value: 3, label: 'medium', severity: 'MEDIUM' }
}

function incidentKey(body, personId) {
  const camera = String(body?.camera || 'CAM-01')
  const category = String(body?.category || 'zone')
  const zone = String(body?.zone || body?.zone_label || 'pool').toLowerCase()
  if (category === 'drowning') return `${camera}:drowning:person:${personId ?? body?.id}`
  if (category === 'supervision') return `${camera}:supervision:zone:${zone}`
  if (category === 'intrusion' || category === 'deep-water') {
    return `${camera}:${category}:zone:${zone}`
  }
  return `${camera}:${category}:${body?.id || zone}`
}

function groupedIncidentTitle(title, category, personIds) {
  const count = personIds.length
  if (category === 'supervision') {
    return count === 1 ? 'Unsupervised Swimmer' : `Unsupervised swimmers · ${count}`
  }
  if ((category === 'intrusion' || category === 'deep-water') && count > 1) {
    return `${String(title || 'Pool alert').replace(/ · \d+ swimmers$/, '')} · ${count} swimmers`
  }
  return title
}

/** rowToEvent for many rows, plus who is responding to and who closed each one. */
async function eventsWithResponders(db, rows) {
  const ids = [...new Set(rows.flatMap((r) => [r.responding_by, r.acknowledged_by, r.closed_by]).filter((v) => v != null))]
  const users = new Map()
  if (ids.length) {
    const found = await all(db, `SELECT id, name, role FROM users WHERE id IN (${ids.map(() => '?').join(', ')})`, ids)
    for (const u of found) users.set(u.id, u)
  }
  return rows.map((row) => ({
    ...rowToEvent(row),
    responder_name: users.get(row.responding_by)?.name ?? null,
    acknowledged_by_name: users.get(row.acknowledged_by)?.name ?? null,
    acknowledged_by_role: users.get(row.acknowledged_by)?.role ?? null,
    closed_by_name: users.get(row.closed_by)?.name ?? null,
  }))
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
      `UPDATE events SET status = ?,
        closed_at = NULL, closed_by = NULL,
        acknowledged_at = NULL, acknowledged_by = NULL,
        responding_at = NULL, responding_by = NULL,
        escalated_at = NULL
       WHERE id = ?`,
      [status, id]
    )
    return
  }
  const closedAt = Date.now() / 1000
  await run(
    db,
    `UPDATE events SET status = ?,
      closed_at = COALESCE(closed_at, ?),
      closed_by = COALESCE(closed_by, ?),
      acknowledged_at = COALESCE(acknowledged_at, ?),
      acknowledged_by = COALESCE(acknowledged_by, ?)
     WHERE id = ?`,
    [status, closedAt, userId ?? null, closedAt, userId ?? null, id]
  )
}

function normalizeIngestPayload(body) {
  const id = String(body?.id || `evt-${Date.now()}`)
  const ts = Number(body?.ts) || Date.now() / 1000
  const priority = incidentPriority(String(body?.category || ''), Boolean(body?.is_alert), body?.event || body?.event_name, body?.severity)
  const personIds = payloadPersonIds(body)
  return {
    id,
    type: String(body?.type || 'info'),
    code: body?.code ? String(body.code) : null,
    title: String(body?.title || 'Zone event'),
    meta: body?.meta ? String(body.meta) : null,
    // `ts` is the source of truth; producer and hosting-machine timezones may differ.
    event_time: siteEventTime(ts),
    event_date: body?.date ? String(body.date) : body?.event_date ? String(body.event_date) : null,
    status: String(body?.status || (body?.is_alert ? 'pending' : 'resolved')),
    severity: priority.severity || (body?.severity ? String(body.severity) : null),
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
    priority: priority.value,
    priority_label: priority.label,
    incident_key: body?.incident_key ? String(body.incident_key) : null,
    group_key: body?.group_key ? String(body.group_key) : null,
    person_ids: personIds,
    occurrence_count: Math.max(1, Number(body?.occurrence_count) || 1),
    first_detected_at: Number(body?.first_detected_at) || ts,
    last_detected_at: Number(body?.last_detected_at) || ts,
  }
}

async function removeLegacyDemoEvents(db) {
  const placeholders = LEGACY_DEMO_EVENT_IDS.map(() => '?').join(', ')
  const result = await run(db, `DELETE FROM events WHERE id IN (${placeholders})`, LEGACY_DEMO_EVENT_IDS)
  if (result?.changes) console.log('Removed sample events from earlier builds:', result.changes)

  const tests = await run(db, "DELETE FROM events WHERE camera = 'TEST' AND ts < ?", [Date.now() / 1000 - TEST_EVENT_TTL_SEC])
  if (tests?.changes) console.log('Removed old test alerts:', tests.changes)

  const renamed = await run(db, "UPDATE events SET title = 'Yellow Zone Area' WHERE title = 'Entered Monitored Area'")
  if (renamed?.changes) console.log('Renamed "Entered Monitored Area" events to "Yellow Zone Area":', renamed.changes)
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
      nearest_person_id, nearest_confidence, priority, priority_label,
      incident_key, group_key, person_ids, occurrence_count,
      first_detected_at, last_detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      code = excluded.code,
      title = excluded.title,
      meta = excluded.meta,
      event_time = excluded.event_time,
      event_date = excluded.event_date,
      status = excluded.status,
      severity = excluded.severity,
      category = excluded.category,
      confidence = excluded.confidence,
      camera = excluded.camera,
      person_id = excluded.person_id,
      zone = excluded.zone,
      zone_label = excluded.zone_label,
      event_name = excluded.event_name,
      is_alert = excluded.is_alert,
      ts = excluded.ts,
      separation_distance = excluded.separation_distance,
      supervision_threshold = excluded.supervision_threshold,
      boundary_direction = excluded.boundary_direction,
      nearest_person_id = excluded.nearest_person_id,
      nearest_confidence = excluded.nearest_confidence,
      priority = excluded.priority,
      priority_label = excluded.priority_label,
      incident_key = COALESCE(excluded.incident_key, events.incident_key),
      group_key = COALESCE(excluded.group_key, events.group_key),
      person_ids = COALESCE(excluded.person_ids, events.person_ids),
      occurrence_count = MAX(events.occurrence_count, excluded.occurrence_count),
      first_detected_at = COALESCE(events.first_detected_at, excluded.first_detected_at),
      last_detected_at = excluded.last_detected_at`,
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
      e.priority,
      e.priority_label,
      e.incident_key,
      e.group_key,
      JSON.stringify(e.person_ids),
      e.occurrence_count,
      e.first_detected_at,
      e.last_detected_at,
    ]
  )
  for (const personId of e.person_ids) {
    await run(db, `INSERT INTO event_people (event_id, person_id, first_seen_at, last_seen_at, occurrence_count)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(event_id, person_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        occurrence_count = event_people.occurrence_count + 1`, [e.id, personId, e.ts, e.ts])
  }
  const row = await get(db, 'SELECT * FROM events WHERE id = ?', [e.id])
  return rowToEvent(row)
}

async function ingestOneIncident(db, payload, personIds) {
  const personId = payload.category === 'drowning' ? personIds[0] : (payload.person_id ?? null)
  const key = incidentKey(payload, personId)
  const priority = incidentPriority(payload.category, Boolean(payload.is_alert), payload.event || payload.event_name, payload.severity)
  const existing = await get(db,
    `SELECT * FROM events WHERE incident_key = ? AND status = 'pending' AND is_alert = 1
     ORDER BY last_detected_at DESC, ts DESC LIMIT 1`, [key])

  if (!existing) {
    const event = await insertEvent(db, {
      ...payload,
      title: groupedIncidentTitle(payload.title, payload.category, personIds),
      person_id: personId,
      person_ids: personIds,
      incident_key: key,
      group_key: payload.group_key || payload.id || key,
      priority: priority.value,
      priority_label: priority.label,
    })
    return { event, deduplicated: false }
  }

  const historicalIds = parsePersonIds(existing.person_ids, existing.person_id)
  const activeIds = payload.category === 'supervision'
    ? personIds
    : [...new Set([...historicalIds, ...personIds])]
  const title = groupedIncidentTitle(payload.title || existing.title, payload.category, activeIds)
  await run(db, `UPDATE events SET
      title = ?, meta = ?, zone = COALESCE(?, zone), zone_label = COALESCE(?, zone_label),
      confidence = COALESCE(?, confidence), person_ids = ?, occurrence_count = occurrence_count + 1,
      last_detected_at = ?, ts = ?, event_time = ?, severity = ?, priority = ?, priority_label = ?
    WHERE id = ?`, [
    title, payload.meta || existing.meta, payload.zone || null, payload.zone_label || null,
    payload.confidence ?? null, JSON.stringify(activeIds), payload.ts, payload.ts,
    siteEventTime(payload.ts), priority.severity, priority.value, priority.label, existing.id,
  ])
  for (const id of personIds) {
    await run(db, `INSERT INTO event_people (event_id, person_id, first_seen_at, last_seen_at, occurrence_count)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(event_id, person_id) DO UPDATE SET last_seen_at = excluded.last_seen_at,
        occurrence_count = event_people.occurrence_count + 1`, [existing.id, id, payload.ts, payload.ts])
  }
  return {
    event: rowToEvent(await get(db, 'SELECT * FROM events WHERE id = ?', [existing.id])),
    deduplicated: true,
  }
}

async function ingestDetection(db, body) {
  const normalized = normalizeIngestPayload(body)
  const people = normalized.person_ids
  const groupKey = String(body?.id || `${normalized.camera}:${normalized.category}`)

  // A detector clear closes every person-specific critical incident from that digest.
  if (normalized.category === 'drowning' && !normalized.is_alert && normalized.status === 'resolved') {
    await run(db, `UPDATE events SET status = 'resolved', is_alert = 0, acknowledged_at = COALESCE(acknowledged_at, ?)
      WHERE category = 'drowning' AND camera = ? AND group_key = ? AND status = 'pending'`,
    [Date.now() / 1000, normalized.camera, groupKey])
    return { events: [], deduplicated: true }
  }

  if (!normalized.is_alert || normalized.priority === 4) {
    const event = await insertEvent(db, { ...body, person_ids: people })
    return { events: [event], deduplicated: false }
  }

  const payload = { ...body, ...normalized, group_key: groupKey }
  const targets = normalized.category === 'drowning'
    ? (people.length ? people.map((id) => [id]) : [[normalized.person_id].filter((id) => id != null)])
    : [people]
  const incidents = await transaction(db, async () => {
    const rows = []
    for (const ids of targets) {
      const eventPayload = normalized.category === 'drowning'
        ? { ...payload, id: `${groupKey}-p${ids[0] ?? 'unknown'}`, person_id: ids[0] ?? null }
        : payload
      rows.push(await ingestOneIncident(db, eventPayload, ids))
    }
    return rows
  })
  return {
    events: incidents.map((incident) => incident.event),
    deduplicated: incidents.some((incident) => incident.deduplicated),
  }
}

const ALERT_SQL = "(is_alert = 1 OR type = 'alarm')"
const DETECTION_CATEGORIES = ['intrusion', 'deep-water', 'supervision', 'drowning']
const SUPERVISED_WINDOW_SEC = 5 * 60
// Possible drowning always outranks zone / unsupervised alerts on the Active Alert card.
const ACTIVE_ALERT_ORDER_SQL = `CASE category
  WHEN 'drowning' THEN 0
  WHEN 'intrusion' THEN 1
  WHEN 'deep-water' THEN 2
  WHEN 'supervision' THEN 3
  ELSE 4
END`

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

      const conditions = [REAL_EVENTS_SQL]
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
        `SELECT * FROM events ${where}
         ORDER BY CASE WHEN status = 'pending' AND is_alert = 1 THEN priority ELSE 9 END ASC,
           ts DESC, created_at DESC LIMIT ? OFFSET ?`,
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
        `SELECT DISTINCT camera FROM events WHERE ${REAL_EVENTS_SQL} ORDER BY camera ASC`
      )
      res.json({ cameras: rows.map((r) => r.camera) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load cameras' })
    }
  })

  app.get('/api/events/active', adminRequired, async (_req, res) => {
    try {
      const now = Date.now() / 1000
      const rows = await all(
        db,
        `SELECT * FROM events
         WHERE status = 'pending' AND is_alert = 1
           AND category IN (${DETECTION_CATEGORIES.map(() => '?').join(', ')})
         ORDER BY priority ASC, ${ACTIVE_ALERT_ORDER_SQL}, ts DESC`,
        DETECTION_CATEGORIES
      )
      const row = rows[0]
      let group = null
      if (row) {
        const peers = await all(
          db,
          `SELECT id, title, person_id, zone_label, meta, category FROM events
           WHERE status = 'pending' AND is_alert = 1
             AND category = ?
           ORDER BY ts DESC`,
          [row.category]
        )
        group = {
          category: row.category,
          count: peers.length,
          personIds: [...new Set(peers.map((p) => p.person_id).filter((id) => id != null))],
          titles: [...new Set(peers.map((p) => p.title).filter(Boolean))],
        }
      }
      const supervisedRow = row
        ? null
        : await get(
            db,
            `SELECT * FROM events
             WHERE event_name = 'SUPERVISED' AND ts >= ?
             ORDER BY ts DESC
             LIMIT 1`,
            [now - SUPERVISED_WINDOW_SEC]
          )
      res.json({
        active: row ? await eventWithResponder(db, row) : null,
        alerts: await eventsWithResponders(db, rows),
        group,
        supervised: rowToEvent(supervisedRow),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load active alert' })
    }
  })

  app.get('/api/events/summary', adminRequired, async (req, res) => {
    try {
      // The browser sends its own local midnight; the server clock may be UTC (e.g. Render).
      let todayTs = Number(req.query.since)
      if (!Number.isFinite(todayTs) || todayTs <= 0) {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        todayTs = todayStart.getTime() / 1000
      }

      // Red-zone, deep-pool, unsupervised and after-hours alerts raised today
      const intrusionRow = await get(
        db,
        `SELECT COUNT(*) as count FROM events
         WHERE ts >= ? AND is_alert = 1 AND category IN ('intrusion', 'deep-water', 'supervision')
           AND COALESCE(camera, '') <> 'TEST'`,
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

  app.post('/api/events/test', adminRequired, async (req, res) => {
    try {
      const preset = TEST_ALERTS[String(req.body?.kind || 'intrusion')]
      if (!preset) return res.status(400).json({ error: 'Unknown test alert type.' })
      const now = new Date()
      const event = await insertEvent(db, {
        ...preset,
        id: `test-${now.getTime()}`,
        meta: `${preset.zone_label} · Person #0 · Test alert`,
        time: siteEventTime(now.getTime() / 1000),
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

  app.post('/api/events/:id/resend', adminRequired, async (req, res) => {
    try {
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [req.params.id])
      if (!row) return res.status(404).json({ error: 'Event not found' })
      if (row.status !== 'pending') {
        return res.status(400).json({ error: 'Only active alerts can be re-sent to lifeguards.' })
      }

      const result = await resendUrgent(db, row.id)
      if (!result) {
        return res.status(409).json({
          error: row.responding_at
            ? 'A lifeguard is already responding to this alert.'
            : 'Send this alert to lifeguards first.',
        })
      }

      const updated = await get(db, 'SELECT * FROM events WHERE id = ?', [row.id])
      res.json({ ok: true, event: await eventWithResponder(db, updated), ...result })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to re-send alert to lifeguards' })
    }
  })

  app.post('/api/events/ingest', async (req, res) => {
    try {
      if (!ingestAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })
      if (LEFT_ZONE_TITLES.includes(String(req.body?.title || ''))) {
        return res.json({ ok: true, ignored: true })
      }

      const result = await ingestDetection(db, req.body)
      const event = result.events[0] || null
      res.status(result.deduplicated ? 200 : 201).json({ ok: true, event, events: result.events, deduplicated: result.deduplicated })
      publishAlertChange('ingested', event?.id || null)

      // Every actionable incident is sent once when it is created. Updating an
      // ongoing grouped incident cannot re-page because dispatched_at is claimed atomically.
      for (const incident of result.events) {
        if (incident.is_alert && incident.status === 'pending') {
          dispatchEvent(db, incident.id).catch((err) => console.error('Auto-dispatch failed:', err))
        }
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
        let rows = await all(db, 'SELECT id, snapshot_uri, clip_uri FROM events WHERE id = ?', [req.params.id])
        if (!rows.length) {
          // A multi-person drowning digest becomes person-specific incidents;
          // the detector still uploads one shared frame/clip under its source id.
          rows = await all(db, 'SELECT id, snapshot_uri, clip_uri FROM events WHERE group_key = ?', [req.params.id])
        }
        if (!rows.length) return res.status(404).json({ error: 'Event not found' })

        const uri = await saveMedia(req.body, media)
        const ids = rows.map((row) => row.id)
        await run(db, `UPDATE events SET ${media.column} = ? WHERE id IN (${ids.map(() => '?').join(', ')})`, [uri, ...ids])

        for (const old of new Set(rows.map((row) => row[media.column]).filter(Boolean))) {
          removeMedia(old).catch(() => {})
        }
        res.status(201).json({ ok: true, uri })
      } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to save event media' })
      }
    }
  )
}

module.exports = {
  HIDDEN_EVENTS_SQL,
  MEDIA_DIR,
  MEDIA_ROUTE,
  registerEventRoutes,
  removeLegacyDemoEvents,
  rowToEvent,
  eventsWithResponders,
  insertEvent,
  ingestDetection,
  setEventStatus,
  parsePersonIds,
}
