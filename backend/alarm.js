const { get } = require('./db')

// Matches LOOKBACK_SEC in dispatch.js: pending drownings older than this don't sound the siren.
const DROWNING_LOOKBACK_SEC = 15 * 60
// The alarm node polls about once a second; silence for this long means it is offline.
const NODE_OFFLINE_SEC = 10

// Kept in memory: a backend restart silences a manual alarm.
const manual = { active: false, by: null, at: null }
let lastNodeSeen = null

function deviceAuthorized(req) {
  const key = process.env.ALARM_DEVICE_KEY
  if (!key) return true
  return req.headers['x-device-key'] === key
}

async function alarmState(db) {
  if (manual.active) return { alarm: true, reason: 'manual', eventId: null }
  const row = await get(
    db,
    `SELECT id FROM events
     WHERE category = 'drowning' AND is_alert = 1 AND status = 'pending' AND ts >= ?
     ORDER BY ts DESC LIMIT 1`,
    [Date.now() / 1000 - DROWNING_LOOKBACK_SEC]
  )
  if (row) return { alarm: true, reason: 'drowning', eventId: row.id }
  return { alarm: false, reason: null, eventId: null }
}

function nodeStatus() {
  return {
    nodeOnline: lastNodeSeen != null && Date.now() - lastNodeSeen < NODE_OFFLINE_SEC * 1000,
    nodeLastSeen: lastNodeSeen,
  }
}

function registerAlarmRoutes(app, db, adminRequired) {
  app.get('/api/alarm/device', async (req, res) => {
    if (!deviceAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })
    try {
      lastNodeSeen = Date.now()
      res.json(await alarmState(db))
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load alarm state' })
    }
  })

  app.get('/api/alarm', adminRequired, async (_req, res) => {
    try {
      res.json({ ...(await alarmState(db)), manualActive: manual.active, ...nodeStatus() })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load alarm state' })
    }
  })

  app.post('/api/alarm/manual', adminRequired, async (req, res) => {
    try {
      manual.active = Boolean(req.body?.active)
      manual.by = manual.active ? req.user?.id ?? null : null
      manual.at = manual.active ? Date.now() : null
      console.log(`[alarm] manual alarm ${manual.active ? 'ON' : 'OFF'} (admin #${req.user?.id ?? '?'})`)
      res.json({ ok: true, ...(await alarmState(db)), manualActive: manual.active, ...nodeStatus() })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to update alarm' })
    }
  })
}

module.exports = { registerAlarmRoutes }
