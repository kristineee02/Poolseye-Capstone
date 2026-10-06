const { all, get, run } = require('./db')
const { insertEvent } = require('./events')
const { sendPush } = require('./push')

const PRIORITIES = {
  high: { type: 'alarm', severity: 'HIGH', label: 'High priority', urgent: true },
  medium: { type: 'warn', severity: 'MEDIUM', label: 'Medium priority', urgent: true },
  low: { type: 'info', severity: 'LOW', label: 'Informational', urgent: false },
}
const MAX_MESSAGE = 500
const MAX_TITLE = 140

function registerBroadcastRoutes(app, db, adminRequired) {
  app.post('/api/lifeguards/broadcast', adminRequired, async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim()
      const priorityKey = String(req.body?.priority || 'high')
      const priority = PRIORITIES[priorityKey]
      if (!message) return res.status(400).json({ error: 'Enter an alert message.' })
      if (message.length > MAX_MESSAGE) {
        return res.status(400).json({ error: `Keep the message under ${MAX_MESSAGE} characters.` })
      }
      if (!priority) return res.status(400).json({ error: 'Priority must be high, medium, or low.' })

      const admin = await get(db, 'SELECT name FROM users WHERE id = ?', [req.user?.id])
      const guards = await all(
        db,
        "SELECT id, push_token FROM users WHERE role = 'lifeguard' AND COALESCE(status, 'active') = 'active'"
      )

      const now = new Date()
      const title = message.length > MAX_TITLE ? `${message.slice(0, MAX_TITLE - 1)}…` : message
      // Stored as a pending alert so it also appears in every lifeguard's in-app alert list.
      const event = await insertEvent(db, {
        id: `brd-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        type: priority.type,
        code: 'BRD',
        title,
        meta: `${message}\n\nSent by ${admin?.name || 'Admin'}`,
        time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
        date: 'Today',
        status: 'pending',
        severity: priority.severity,
        category: 'broadcast',
        zone_label: `Broadcast · ${priority.label}`,
        event: 'BROADCAST',
        is_alert: true,
        ts: now.getTime() / 1000,
      })

      await run(db, 'UPDATE events SET dispatched_at = ?, dispatched_by = ? WHERE id = ?', [
        now.getTime() / 1000,
        req.user?.id ?? null,
        event.id,
      ])

      const tokens = guards.map((g) => g.push_token).filter(Boolean)
      const pushed = await sendPush(db, tokens, {
        title: priorityKey === 'high' ? 'Emergency alert' : priorityKey === 'medium' ? 'Pool alert' : 'Notice',
        body: message,
        data: { eventId: event.id, category: 'broadcast' },
        urgent: priority.urgent,
      })

      res.status(201).json({ ok: true, event, recipients: guards.length, pushed })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to send broadcast' })
    }
  })
}

module.exports = { registerBroadcastRoutes }
