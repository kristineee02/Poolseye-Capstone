const { get, all, run } = require('./db')
const { sendPush } = require('./push')

// Alerts the admin has not acted on are sent to lifeguards automatically after this long.
const AUTO_SEND_AFTER_SEC = 60
// Sent alerts nobody has claimed are re-sent as urgent after this long.
const NO_RESPONSE_SEC = { drowning: 30, default: 60 }
// Older pending alerts (e.g. leftovers from before a restart) are never auto-sent or escalated.
const LOOKBACK_SEC = 15 * 60
const TICK_MS = 5000

const PUSH_TITLES = {
  drowning: 'Possible drowning',
  intrusion: 'Red zone intrusion',
  'deep-water': 'Deep-water entry',
  supervision: 'Unsupervised swimmer',
}

function pushBody(event) {
  const person = event.person_id != null ? `Person #${event.person_id}` : 'A person'
  const zone = event.zone_label ? ` · ${event.zone_label}` : ''
  if (event.category === 'drowning') return `${person} may be in distress${zone}. Respond immediately.`
  return `${event.title}${zone}${event.person_id != null ? ` · ${person}` : ''}`
}

async function pushToLifeguards(db, event, title) {
  const guards = await all(
    db,
    "SELECT push_token FROM users WHERE role = 'lifeguard' AND COALESCE(status, 'active') = 'active'"
  )
  const tokens = guards.map((g) => g.push_token).filter(Boolean)
  const pushed = await sendPush(db, tokens, {
    title,
    body: pushBody(event),
    data: { eventId: event.id, category: event.category },
    urgent: true,
  })
  return { recipients: guards.length, pushed }
}

/**
 * Push an event to every active lifeguard and stamp it as dispatched.
 * `userId` is the admin who sent it; null means the system sent it automatically.
 * Returns null when the event was already dispatched.
 */
async function dispatchEvent(db, eventId, { userId = null } = {}) {
  const claimed = await run(
    db,
    'UPDATE events SET dispatched_at = ?, dispatched_by = ? WHERE id = ? AND dispatched_at IS NULL',
    [Date.now() / 1000, userId, eventId]
  )
  if (!claimed?.changes) return null

  const event = await get(db, 'SELECT * FROM events WHERE id = ?', [eventId])
  return pushToLifeguards(db, event, PUSH_TITLES[event.category] || event.title || 'Pool alert')
}

async function escalateEvent(db, eventId) {
  const claimed = await run(
    db,
    'UPDATE events SET escalated_at = ? WHERE id = ? AND escalated_at IS NULL AND responding_at IS NULL',
    [Date.now() / 1000, eventId]
  )
  if (!claimed?.changes) return null

  // Every active lifeguard was paged and nobody claimed it in time.
  await run(
    db,
    "UPDATE users SET missed_alerts = COALESCE(missed_alerts, 0) + 1 WHERE role = 'lifeguard' AND COALESCE(status, 'active') = 'active'"
  )

  const event = await get(db, 'SELECT * FROM events WHERE id = ?', [eventId])
  return pushToLifeguards(db, event, `URGENT — no response yet: ${PUSH_TITLES[event.category] || event.title}`)
}

async function escalationTick(db) {
  const now = Date.now() / 1000
  const base = `status = 'pending' AND is_alert = 1 AND COALESCE(category, '') <> 'broadcast'`

  const unsent = await all(
    db,
    `SELECT id FROM events WHERE ${base} AND dispatched_at IS NULL AND ts BETWEEN ? AND ?`,
    [now - LOOKBACK_SEC, now - AUTO_SEND_AFTER_SEC]
  )
  for (const row of unsent) await dispatchEvent(db, row.id)

  const silent = await all(
    db,
    `SELECT id FROM events WHERE ${base}
       AND dispatched_at IS NOT NULL AND responding_at IS NULL AND escalated_at IS NULL
       AND dispatched_at >= ?
       AND dispatched_at <= ? - CASE WHEN category = 'drowning' THEN ? ELSE ? END`,
    [now - LOOKBACK_SEC, now, NO_RESPONSE_SEC.drowning, NO_RESPONSE_SEC.default]
  )
  for (const row of silent) await escalateEvent(db, row.id)
}

function startEscalation(db) {
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      await escalationTick(db)
    } catch (err) {
      console.error('Alert escalation failed:', err)
    } finally {
      running = false
    }
  }, TICK_MS)
  timer.unref?.()
  return timer
}

module.exports = { dispatchEvent, escalationTick, startEscalation }
