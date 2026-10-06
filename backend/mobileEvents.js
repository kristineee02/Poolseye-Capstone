const { get, all, run } = require('./db')
const { eventsWithResponders, setEventStatus } = require('./events')
const { lifeguardAuthRequired } = require('./mobileAuth')
const { parseNotificationPrefs, mutedCategories } = require('./lifeguards')

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
      const muted = await mutedFilter(db, req.lifeguard.id)

      const conditions = []
      const params = []

      if (alertsOnly) {
        conditions.push('is_alert = 1')
      }
      if (status !== 'all') {
        conditions.push('status = ?')
        params.push(status)
      }
      if (muted.sql) {
        conditions.push(muted.sql)
        params.push(...muted.params)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const rows = await all(
        db,
        `SELECT * FROM events ${where} ORDER BY ts DESC, created_at DESC LIMIT ?`,
        [...params, limit]
      )

      res.json({
        ok: true,
        events: await forLifeguard(db, rows, req.lifeguard.id),
        pendingCount: await pendingCount(db, muted),
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
      if (row.status !== 'pending') return res.status(400).json({ error: 'This alert is already closed.' })

      const now = Date.now() / 1000
      await run(
        db,
        `UPDATE events SET responding_at = ?, responding_by = ?, dispatched_at = COALESCE(dispatched_at, ?)
         WHERE id = ? AND responding_by IS NULL`,
        [now, lifeguardId, now, id]
      )

      const event = await eventForLifeguard(db, id, lifeguardId)
      if (!event.responding_mine) {
        return res.status(409).json({
          error: `${event.responder_name || 'Another lifeguard'} is already responding.`,
          event,
        })
      }
      res.json({ ok: true, event })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to respond to alert' })
    }
  })

  app.patch('/api/mobile/events/:id', lifeguardAuthRequired, async (req, res) => {
    try {
      const id = String(req.params.id || '')
      const status = String(req.body?.status || '').trim()
      if (!['resolved', 'dismissed', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'status must be pending, resolved, or dismissed' })
      }

      const row = await get(db, 'SELECT * FROM events WHERE id = ?', [id])
      if (!row) return res.status(404).json({ error: 'Alert not found' })

      await setEventStatus(db, id, status, req.lifeguard?.id)

      if (status === 'resolved' || status === 'dismissed') {
        const lifeguardId = req.lifeguard?.id
        if (lifeguardId) {
          await run(
            db,
            `UPDATE users SET
              acknowledged_alerts = COALESCE(acknowledged_alerts, 0) + 1,
              last_alert_acknowledged_at = ?
             WHERE id = ? AND role = 'lifeguard'`,
            [new Date().toISOString(), lifeguardId]
          )
        }
      }

      res.json({
        ok: true,
        event: await eventForLifeguard(db, id, req.lifeguard?.id),
        pendingCount: await pendingCount(db, await mutedFilter(db, req.lifeguard.id)),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to update alert' })
    }
  })
}

module.exports = { registerMobileEventRoutes }
