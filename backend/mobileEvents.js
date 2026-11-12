const { get, all, run } = require('./db')
const { HIDDEN_EVENTS_SQL, eventsWithResponders, setEventStatus } = require('./events')
const { lifeguardAuthRequired } = require('./mobileAuth')
const { parseNotificationPrefs, mutedCategories } = require('./lifeguards')
const { publishAlertChange } = require('./alertSync')

async function mutedFilter(db, lifeguardId) {
  const user = await get(db, 'SELECT notification_prefs FROM users WHERE id = ?', [lifeguardId])
  const muted = mutedCategories(parseNotificationPrefs(user?.notification_prefs))
  if (!muted.length) return { sql: null, params: [] }
  return {
    sql: `(category IS NULL OR category NOT IN (${muted.map(() => '?').join(', ')}))`,
    params: muted,
  }
}

async function pendingCount(db, muted) {
  const where = ['is_alert = 1', "status = 'pending'"]
  if (muted.sql) where.push(muted.sql)
  const row = await get(db, `SELECT COUNT(*) AS count FROM events WHERE ${where.join(' AND ')}`, muted.params)
  return Number(row?.count || 0)
}

async function acknowledgedSince(db, lifeguardId, since) {
  if (!Number.isFinite(since) || since <= 0) return null
  const row = await get(
    db,
    `SELECT COUNT(*) AS count FROM events
     WHERE is_alert = 1 AND acknowledged_by = ? AND acknowledged_at >= ?`,
    [lifeguardId, since]
  )
  return Number(row?.count || 0)
}

async function forLifeguard(db, rows, lifeguardId) {
  const events = await eventsWithResponders(db, rows)
  return events.map((e) => ({ ...e, responding_mine: e.responding_by != null && e.responding_by === lifeguardId }))
}

async function eventForLifeguard(db, id, lifeguardId) {
  const row = await get(db, 'SELECT * FROM events WHERE id = ?', [id])
  const [event] = await forLifeguard(db, [row], lifeguardId)
  return event
}

function registerMobileEventRoutes(app, db) {
  app.get('/api/mobile/events', lifeguardAuthRequired, async (req, res) => {
    try {
      const alertsOnly = String(req.query.alertsOnly || '1') !== '0'
      const status = String(req.query.status || 'all')
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40))
      const offset = Math.max(0, Number(req.query.offset) || 0)
      const beforeTs = Number(req.query.beforeTs)
      const beforeId = String(req.query.beforeId || '')
      const hasCursor = status === 'closed' && Number.isFinite(beforeTs) && Boolean(beforeId)
      const muted = await mutedFilter(db, req.lifeguard.id)

      const conditions = [HIDDEN_EVENTS_SQL]
      const params = []

      if (alertsOnly) {
        conditions.push('is_alert = 1')
      }
      if (status === 'closed') {
        conditions.push("status IN ('resolved', 'dismissed')")
      } else if (status === 'responding') {
        conditions.push("status = 'responding' AND responding_by = ?")
        params.push(req.lifeguard.id)
      } else if (status !== 'all') {
        conditions.push('status = ?')
        params.push(status)
      }
      if (muted.sql) {
        conditions.push(muted.sql)
        params.push(...muted.params)
      }

      const countWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const totalRow = await get(
        db,
        `SELECT COUNT(*) AS count FROM events ${countWhere}`,
        params
      )
      if (hasCursor) {
        conditions.push('(ts < ? OR (ts = ? AND id < ?))')
        params.push(beforeTs, beforeTs, beforeId)
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const pageOffset = hasCursor ? 0 : offset
      const rows = await all(
        db,
        `SELECT * FROM events ${where}
         ORDER BY CASE WHEN status IN ('pending', 'responding') AND is_alert = 1 THEN priority ELSE 9 END ASC,
           ts DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit + 1, pageOffset]
      )
      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows

      res.json({
        ok: true,
        events: await forLifeguard(db, page, req.lifeguard.id),
        hasMore,
        nextOffset: pageOffset + page.length,
        nextCursor: page.length
          ? { ts: page[page.length - 1].ts, id: page[page.length - 1].id }
          : null,
        totalCount: Number(totalRow?.count || 0),
        pendingCount: await pendingCount(db, muted),
        acknowledgedToday: await acknowledgedSince(db, req.lifeguard.id, Number(req.query.ackSince)),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load alerts' })
    }
  })

  app.post('/api/mobile/events/:id/respond', lifeguardAuthRequired, async (req, res) => {
    try {
      const id = String(req.params.id || '')
      const lifeguardId = req.lifeguard.id
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [id])
      if (!row) return res.status(404).json({ error: 'Alert not found' })
      if (row.status !== 'pending') return res.status(400).json({ error: 'This alert is no longer awaiting response.' })

      const now = Date.now() / 1000
      const claimed = await run(
        db,
        `UPDATE events SET status = 'responding', responding_at = ?, responding_by = ?,
          acknowledged_at = COALESCE(acknowledged_at, ?), acknowledged_by = COALESCE(acknowledged_by, ?),
          dispatched_at = COALESCE(dispatched_at, ?)
         WHERE id = ? AND status = 'pending' AND responding_by IS NULL`,
        [now, lifeguardId, now, lifeguardId, now, id]
      )
      if (claimed?.changes) {
        await run(db, `UPDATE users SET acknowledged_alerts = COALESCE(acknowledged_alerts, 0) + 1,
          last_alert_acknowledged_at = ? WHERE id = ? AND role = 'lifeguard'`,
        [new Date().toISOString(), lifeguardId])
      }

      const event = await eventForLifeguard(db, id, lifeguardId)
      if (!event.responding_mine) {
        return res.status(409).json({
          error: `${event.responder_name || 'Another lifeguard'} is already responding.`,
          event,
        })
      }
      res.json({ ok: true, event })
      publishAlertChange('responding', id)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to respond to alert' })
    }
  })

  app.post('/api/mobile/events/:id/acknowledge', lifeguardAuthRequired, async (req, res) => {
    try {
      const id = String(req.params.id || '')
      const lifeguardId = req.lifeguard.id
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [id])
      if (!row) return res.status(404).json({ error: 'Alert not found' })
      if (row.status !== 'pending') return res.status(400).json({ error: 'This alert is no longer awaiting response.' })
      const now = Date.now() / 1000
      const claimed = await run(db, `UPDATE events SET status = 'responding', responding_at = ?, responding_by = ?,
        acknowledged_at = ?, acknowledged_by = ?, dispatched_at = COALESCE(dispatched_at, ?)
        WHERE id = ? AND status = 'pending' AND responding_by IS NULL`,
      [now, lifeguardId, now, lifeguardId, now, id])
      if (claimed?.changes) {
        await run(db, `UPDATE users SET acknowledged_alerts = COALESCE(acknowledged_alerts, 0) + 1,
          last_alert_acknowledged_at = ? WHERE id = ? AND role = 'lifeguard'`,
        [new Date().toISOString(), lifeguardId])
      }
      const event = await eventForLifeguard(db, id, lifeguardId)
      if (!event.responding_mine) {
        return res.status(409).json({
          error: `${event.responder_name || 'Another lifeguard'} is already responding.`,
          event,
        })
      }
      publishAlertChange('responding', id)
      res.json({ ok: true, event })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to acknowledge alert' })
    }
  })

  app.patch('/api/mobile/events/:id', lifeguardAuthRequired, async (req, res) => {
    try {
      const id = String(req.params.id || '')
      const status = String(req.body?.status || '').trim()
      if (!['resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({ error: 'status must be resolved or dismissed' })
      }

      const lifeguardId = req.lifeguard?.id
      const reason = String(req.body?.reason || '').trim()
      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [id])
      if (!row) return res.status(404).json({ error: 'Alert not found' })

      if (row.responding_by != null && row.responding_by !== lifeguardId) {
        const [event] = await forLifeguard(db, [row], lifeguardId)
        return res.status(409).json({
          error: `${event.responder_name || 'Another lifeguard'} is responding to this alert.`,
          event,
        })
      }
      const closing = status === 'resolved' || status === 'dismissed'
      if (closing && row.status !== 'responding') {
        return res.status(400).json({ error: 'Respond Now before closing this incident.' })
      }
      if (status === 'dismissed' && !reason) {
        return res.status(400).json({ error: 'A false-alarm reason is required.' })
      }
      if (reason.length > 300) {
        return res.status(400).json({ error: 'The closure reason must be 300 characters or fewer.' })
      }
      await setEventStatus(db, id, status, lifeguardId, reason || null)

      res.json({
        ok: true,
        event: await eventForLifeguard(db, id, req.lifeguard?.id),
        pendingCount: await pendingCount(db, await mutedFilter(db, req.lifeguard.id)),
      })
      publishAlertChange(status === 'dismissed' ? 'false-alarm' : 'status', id)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to update alert' })
    }
  })
}

module.exports = { registerMobileEventRoutes }
