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

const SEVERITY_RANK = { drowning: 0, intrusion: 1, 'deep-water': 2, supervision: 3 }

function collapseKey(event) {
  if (event.category === 'broadcast') return `broadcast-${event.id}`
  // Digests (and same-category drowning/supervision pages) share one tray notification.
  if (String(event.id || '').startsWith('digest-') || event.category === 'drowning' || event.category === 'supervision') {
    return `category-${event.category}-${event.camera || 'cam'}`
  }
  if (event.person_id != null) return `person-${event.person_id}`
  return `event-${event.id}`
}

function bySeverity(a, b) {
  return (SEVERITY_RANK[a.category] ?? 9) - (SEVERITY_RANK[b.category] ?? 9)
}

function groupTitle(events, urgent) {
  const primary = [...events].sort(bySeverity)[0]
  // Digest rows already carry the count in the title ("Possible drowning · 3 people").
  if (String(primary.id || '').startsWith('digest-') || events.length === 1) {
    const label = primary.title || PUSH_TITLES[primary.category] || 'Pool alert'
    return urgent ? `URGENT — no response yet: ${label}` : label
  }
  if (primary.category === 'drowning') {
    const label = `Possible drowning · ${events.length} people`
    return urgent ? `URGENT — no response yet: ${label}` : label
  }
  if (primary.category === 'supervision') {
    const label = `Unsupervised swimmers · ${events.length}`
    return urgent ? `URGENT — no response yet: ${label}` : label
  }
  const person = primary.person_id != null ? `Person #${primary.person_id}` : 'One swimmer'
  const label = `${events.length} alerts · ${person}`
  return urgent ? `URGENT — no response yet: ${label}` : label
}

function groupBody(events) {
  const primary = [...events].sort(bySeverity)[0]
  if (String(primary.id || '').startsWith('digest-') || events.length === 1) {
    return primary.meta || pushBody(primary)
  }
  if (primary.category === 'drowning' || primary.category === 'supervision') {
    return primary.meta || pushBody(primary)
  }
  const titles = []
  for (const event of [...events].sort(bySeverity)) {
    const label = PUSH_TITLES[event.category] || event.title
    if (label && !titles.includes(label)) titles.push(label)
  }
  return titles.join(' · ')
}

async function openAlertsFor(db, event) {
  if (event.category === 'broadcast') return [event]
  // Digest rows are already one alert for many people.
  if (String(event.id || '').startsWith('digest-')) return [event]
  // Legacy per-person drowning/supervision rows share one push.
  if (event.category === 'drowning' || event.category === 'supervision') {
    const rows = await all(
      db,
      `SELECT * FROM events
       WHERE status = 'pending' AND is_alert = 1
         AND category = ?
         AND responding_at IS NULL`,
      [event.category]
    )
    return rows.length ? rows : [event]
  }
  if (event.person_id == null) return [event]
  const rows = await all(
    db,
    `SELECT * FROM events
     WHERE status = 'pending' AND is_alert = 1
       AND person_id = ?
       AND dispatched_at IS NOT NULL
       AND responding_at IS NULL
       AND COALESCE(category, '') <> 'broadcast'`,
    [event.person_id]
  )
  return rows.length ? rows : [event]
}

async function pushToLifeguards(db, events, { urgent = false } = {}) {
  const group = [...events].sort(bySeverity)
  const primary = group[0]
  const guards = await all(
    db,
    "SELECT push_token FROM users WHERE role = 'lifeguard' AND COALESCE(status, 'active') = 'active'"
  )
  const tokens = guards.map((g) => g.push_token).filter(Boolean)
  const key = collapseKey(primary)
  const pushed = await sendPush(db, tokens, {
    title: groupTitle(group, urgent),
    body: groupBody(group),
    data: {
      eventId: primary.id,
      eventIds: group.map((event) => event.id),
      category: primary.category,
      personId: primary.person_id ?? null,
      collapseKey: key,
    },
    urgent: true,
    collapseId: key,
  })
  return { recipients: guards.length, pushed }
}

async function pushOpenGroup(db, event, { urgent = false } = {}) {
  return pushToLifeguards(db, await openAlertsFor(db, event), { urgent })
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
  return pushOpenGroup(db, event, { urgent: false })
}

/**
 * Admin-triggered urgent re-send of an alert lifeguards were already paged for.
 * Returns null when the alert was never sent or someone is already responding.
 */
async function resendUrgent(db, eventId) {
  const claimed = await run(
    db,
    'UPDATE events SET escalated_at = ? WHERE id = ? AND dispatched_at IS NOT NULL AND responding_at IS NULL',
    [Date.now() / 1000, eventId]
  )
  if (!claimed?.changes) return null

  const event = await get(db, 'SELECT * FROM events WHERE id = ?', [eventId])
  return pushOpenGroup(db, event, { urgent: true })
}

async function escalationTick(db) {
  const now = Date.now() / 1000
  const base = `status = 'pending' AND is_alert = 1 AND COALESCE(category, '') <> 'broadcast'`

  const unsent = await all(
    db,
    `SELECT id FROM events WHERE ${base} AND dispatched_at IS NULL AND ts BETWEEN ? AND ?`,
    [now - LOOKBACK_SEC, now - AUTO_SEND_AFTER_SEC]
  )
  const dispatched = []
  for (const row of unsent) {
    const claimed = await run(
      db,
      'UPDATE events SET dispatched_at = ?, dispatched_by = ? WHERE id = ? AND dispatched_at IS NULL',
      [now, null, row.id]
    )
    if (claimed?.changes) {
      const event = await get(db, 'SELECT * FROM events WHERE id = ?', [row.id])
      if (event) dispatched.push(event)
    }
  }
  const dispatchedKeys = new Set()
  for (const event of dispatched) {
    const key = collapseKey(event)
    if (dispatchedKeys.has(key)) continue
    dispatchedKeys.add(key)
    await pushOpenGroup(db, event, { urgent: false })
  }

  const silent = await all(
    db,
    `SELECT id FROM events WHERE ${base}
       AND dispatched_at IS NOT NULL AND responding_at IS NULL AND escalated_at IS NULL
       AND dispatched_at >= ?
       AND dispatched_at <= ? - CASE WHEN category = 'drowning' THEN ? ELSE ? END`,
    [now - LOOKBACK_SEC, now, NO_RESPONSE_SEC.drowning, NO_RESPONSE_SEC.default]
  )
  const escalated = []
  for (const row of silent) {
    const claimed = await run(
      db,
      'UPDATE events SET escalated_at = ? WHERE id = ? AND escalated_at IS NULL AND responding_at IS NULL',
      [now, row.id]
    )
    if (!claimed?.changes) continue
    await run(
      db,
      "UPDATE users SET missed_alerts = COALESCE(missed_alerts, 0) + 1 WHERE role = 'lifeguard' AND COALESCE(status, 'active') = 'active'"
    )
    const event = await get(db, 'SELECT * FROM events WHERE id = ?', [row.id])
    if (event) escalated.push(event)
  }
  const escalatedKeys = new Set()
  for (const event of escalated) {
    const key = collapseKey(event)
    if (escalatedKeys.has(key)) continue
    escalatedKeys.add(key)
    await pushOpenGroup(db, event, { urgent: true })
  }
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

module.exports = { dispatchEvent, resendUrgent, escalationTick, startEscalation }
