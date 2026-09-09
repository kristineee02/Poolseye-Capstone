const { get, all, run } = require('./db')
const { rowToEvent } = require('./events')
const { lifeguardAuthRequired } = require('./mobileAuth')

function registerMobileEventRoutes(app, db) {
  app.get('/api/mobile/events', lifeguardAuthRequired, async (req, res) => {
    try {
      const alertsOnly = String(req.query.alertsOnly || '1') !== '0'
      const status = String(req.query.status || 'all')
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40))

      const conditions = []
      const params = []

      if (alertsOnly) {
        conditions.push('is_alert = 1')
      }
      if (status !== 'all') {
        conditions.push('status = ?')
        params.push(status)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const rows = await all(
        db,
        `SELECT * FROM events ${where} ORDER BY ts DESC, created_at DESC LIMIT ?`,
        [...params, limit]
      )

      const pendingRow = await get(
        db,
        `SELECT COUNT(*) AS count FROM events WHERE is_alert = 1 AND status = 'pending'`
      )

      res.json({
        ok: true,
        events: rows.map(rowToEvent),
        pendingCount: Number(pendingRow?.count || 0),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load alerts' })
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

      await run(db, 'UPDATE events SET status = ? WHERE id = ?', [status, id])

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

      const updated = await get(db, 'SELECT * FROM events WHERE id = ?', [id])
      const pendingRow = await get(
        db,
        `SELECT COUNT(*) AS count FROM events WHERE is_alert = 1 AND status = 'pending'`
      )

      res.json({
        ok: true,
        event: rowToEvent(updated),
        pendingCount: Number(pendingRow?.count || 0),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to update alert' })
    }
  })
}

module.exports = { registerMobileEventRoutes }
