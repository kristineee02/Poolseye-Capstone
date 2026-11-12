const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sqlite3 = require('sqlite3').verbose()
const express = require('express')
const jwt = require('jsonwebtoken')
const { all, exec, get, run, migrateEventsTable } = require('./db')
const { ingestDetection, setEventStatus } = require('./events')
const { dispatchEvent, scheduleDetectionDispatch, escalationTick } = require('./dispatch')
const { registerMobileEventRoutes } = require('./mobileEvents')

async function database(t) {
  const db = await new Promise((resolve, reject) => {
    const next = new sqlite3.Database(':memory:', (err) => err ? reject(err) : resolve(next))
  })
  await exec(db, fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
  await migrateEventsTable(db)
  t.after(() => new Promise((resolve) => db.close(resolve)))
  return db
}

function detection(overrides = {}) {
  return {
    id: `source-${Math.random().toString(36).slice(2)}`,
    type: 'alarm',
    title: 'Detection',
    status: 'pending',
    severity: 'HIGH',
    camera: 'CAM-01',
    zone: 'deep',
    zone_label: 'Deep pool',
    event: 'RED_ZONE_INTRUSION',
    category: 'intrusion',
    is_alert: true,
    ts: Date.now() / 1000,
    ...overrides,
  }
}

test('simultaneous drowning detections remain separate critical incidents', async (t) => {
  const db = await database(t)
  const payload = detection({
    id: 'digest-drowning-CAM-01', category: 'drowning', event: 'POSSIBLE_DROWNING',
    person_id: null, person_ids: [11, 22],
  })
  const first = await ingestDetection(db, payload)
  assert.equal(first.events.length, 2)
  assert.deepEqual(first.events.map((event) => event.person_id), [11, 22])
  assert.ok(first.events.every((event) => event.priority === 1 && event.priority_label === 'critical'))

  await ingestDetection(db, { ...payload, ts: payload.ts + 1 })
  const rows = await all(db, "SELECT * FROM events WHERE category = 'drowning'")
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.occurrence_count === 2))
})

test('ongoing intrusion is deduplicated per person while different people remain separate', async (t) => {
  const db = await database(t)
  const intrusion = detection({ id: 'intrusion-1', person_id: 7 })
  const first = await ingestDetection(db, intrusion)
  const again = await ingestDetection(db, { ...intrusion, id: 'intrusion-2', ts: intrusion.ts + 1 })
  const other = await ingestDetection(db, { ...intrusion, id: 'intrusion-3', person_id: 8, ts: intrusion.ts + 2 })
  const supervision = await ingestDetection(db, detection({
    id: 'supervision-1', type: 'warn', category: 'supervision', event: 'UNSUPERVISED',
    zone: 'yellow-a', zone_label: 'Yellow A', person_ids: [31, 32], person_id: null,
  }))
  assert.equal(first.events[0].id, again.events[0].id)
  assert.deepEqual(again.events[0].person_ids, [7])
  assert.equal(again.events[0].occurrence_count, 2)
  assert.notEqual(first.events[0].id, other.events[0].id)
  assert.equal(supervision.events.length, 2)
  assert.ok(supervision.events.every((event) => event.priority === 4))
  assert.equal((await all(db, "SELECT id FROM events WHERE status = 'pending'")).length, 4)
})

test('simultaneous same-zone detector requests keep separate person incidents', async (t) => {
  const db = await database(t)
  const base = detection({ id: 'simultaneous-zone', person_id: 61 })
  const [first, second] = await Promise.all([
    ingestDetection(db, base),
    ingestDetection(db, { ...base, id: 'simultaneous-zone-2', person_id: 62, ts: base.ts + 0.001 }),
  ])

  assert.notEqual(first.events[0].id, second.events[0].id)
  const rows = await all(db, "SELECT * FROM events WHERE status = 'pending' AND category = 'intrusion'")
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => row.person_id).sort((a, b) => a - b), [61, 62])
})

test('unsupervised roster updates person incidents and preserves member history', async (t) => {
  const db = await database(t)
  const base = detection({
    id: 'digest-supervision-CAM-01', type: 'warn', category: 'supervision',
    event: 'UNSUPERVISED', zone: 'yellow-a', zone_label: 'Yellow A', person_id: null,
    person_ids: [1, 2],
  })
  const first = await ingestDetection(db, base)
  const second = await ingestDetection(db, { ...base, person_ids: [2, 3], ts: base.ts + 1 })
  const firstPersonTwo = first.events.find((event) => event.person_id === 2)
  const secondPersonTwo = second.events.find((event) => event.person_id === 2)
  assert.equal(firstPersonTwo.id, secondPersonTwo.id)
  assert.equal(secondPersonTwo.occurrence_count, 2)
  assert.equal((await all(db, "SELECT id FROM events WHERE category = 'supervision'")).length, 3)
  assert.deepEqual((await all(db, 'SELECT person_id FROM event_people ORDER BY person_id')).map((r) => r.person_id), [1, 2, 3])
})

test('yellow and supervised events remain informational history only', async (t) => {
  const db = await database(t)
  await ingestDetection(db, detection({
    id: 'yellow-1', type: 'info', category: 'yellow', event: 'ENTERED POOL AREA',
    is_alert: false, status: 'resolved', person_id: 9,
  }))
  const row = await get(db, "SELECT * FROM events WHERE id = 'yellow-1'")
  assert.equal(row.priority, 5)
  assert.equal(row.is_alert, 0)
  assert.equal(row.status, 'resolved')
})

test('false positive closes only its critical incident and dispatch never duplicates', async (t) => {
  const db = await database(t)
  const result = await ingestDetection(db, detection({
    id: 'critical-pair', category: 'drowning', event: 'POSSIBLE_DROWNING',
    person_id: null, person_ids: [41, 42],
  }))
  const [first, second] = result.events
  assert.ok(await dispatchEvent(db, first.id))
  assert.equal(await dispatchEvent(db, first.id), null)
  assert.ok(await dispatchEvent(db, second.id))
  await setEventStatus(db, first.id, 'dismissed', 99)

  const rows = await all(db, "SELECT id, status, notification_count FROM events ORDER BY person_id")
  assert.deepEqual(rows.map((row) => row.status), ['dismissed', 'pending'])
  assert.deepEqual(rows.map((row) => row.notification_count), [1, 1])
})

test('resolved and false-alarm outcomes persist with closure audit details', async (t) => {
  const db = await database(t)
  const resolved = (await ingestDetection(db, detection({
    id: 'resolved-history',
    category: 'intrusion',
    zone: 'red',
    zone_label: 'Red zone',
  }))).events[0]
  const falseAlarm = (await ingestDetection(db, detection({
    id: 'false-alarm-history',
    category: 'deep-water',
    zone: 'deep',
    zone_label: 'Deep pool',
  }))).events[0]

  await setEventStatus(db, resolved.id, 'resolved', 71)
  await setEventStatus(db, falseAlarm.id, 'dismissed', 72)

  const resolvedRow = await get(db, 'SELECT * FROM events WHERE id = ?', [resolved.id])
  assert.equal(resolvedRow.status, 'resolved')
  assert.equal(resolvedRow.closed_by, 71)
  assert.ok(resolvedRow.closed_at)
  assert.equal(resolvedRow.acknowledged_by, 71)
  assert.ok(resolvedRow.acknowledged_at)

  const falseAlarmRow = await get(db, 'SELECT * FROM events WHERE id = ?', [falseAlarm.id])
  assert.equal(falseAlarmRow.status, 'dismissed')
  assert.equal(falseAlarmRow.closed_by, 72)
  assert.ok(falseAlarmRow.closed_at)
  assert.equal(falseAlarmRow.acknowledged_by, 72)
  assert.ok(falseAlarmRow.acknowledged_at)
})

test('acknowledged critical incident is not escalated as unanswered', async (t) => {
  const db = await database(t)
  const result = await ingestDetection(db, detection({
    id: 'critical-ack', category: 'drowning', event: 'POSSIBLE_DROWNING', person_id: 51,
  }))
  const event = result.events[0]
  const now = Date.now() / 1000
  await run(db, `UPDATE events SET dispatched_at = ?, acknowledged_at = ?, acknowledged_by = ? WHERE id = ?`,
    [now - 60, now - 50, 7, event.id])
  await escalationTick(db)
  const row = await get(db, 'SELECT escalated_at FROM events WHERE id = ?', [event.id])
  assert.equal(row.escalated_at, null)
})

test('source attribution and requested priority order are persisted', async (t) => {
  const db = await database(t)
  const upload = (await ingestDetection(db, detection({
    id: 'upload-orange', camera: 'UPLOAD', source: 'Uploaded Video', source_name: 'scenario.mp4',
    category: 'deep-water', event: 'DEEP POOL ENTRY', person_id: 81,
  }))).events[0]
  assert.equal(upload.detection_source, 'Uploaded Video')
  assert.equal(upload.source_name, 'scenario.mp4')
  assert.equal(upload.priority, 3)
  assert.equal(upload.priority_label, 'medium')
})

test('detector clear preserves workflow state and a new drowning episode is never suppressed', async (t) => {
  const db = await database(t)
  const base = detection({
    id: 'digest-drowning-live', category: 'drowning', event: 'POSSIBLE_DROWNING', person_id: 91,
  })
  const first = (await ingestDetection(db, base)).events[0]
  await run(db, "UPDATE events SET status = 'responding', responding_by = 7, responding_at = ? WHERE id = ?",
    [base.ts + 1, first.id])
  const update = (await ingestDetection(db, { ...base, ts: base.ts + 2 })).events[0]
  assert.equal(update.id, first.id)
  assert.equal(update.status, 'responding')

  await ingestDetection(db, { ...base, is_alert: false, status: 'resolved', ts: base.ts + 3 })
  const stillActive = await get(db, 'SELECT * FROM events WHERE id = ?', [first.id])
  assert.equal(stillActive.status, 'responding')
  assert.ok(stillActive.detection_cleared_at)

  const next = (await ingestDetection(db, { ...base, ts: base.ts + 4 })).events[0]
  assert.notEqual(next.id, first.id)
  assert.equal(next.status, 'pending')
})

test('noncritical incidents dispatch together without delaying critical dispatch', async (t) => {
  const db = await database(t)
  const red = (await ingestDetection(db, detection({ id: 'digest-red', person_id: 101 }))).events[0]
  const orange = (await ingestDetection(db, detection({
    id: 'digest-orange', category: 'deep-water', event: 'DEEP POOL ENTRY', person_id: 102,
  }))).events[0]
  const drowning = (await ingestDetection(db, detection({
    id: 'digest-critical', category: 'drowning', event: 'POSSIBLE_DROWNING', person_id: 103,
  }))).events[0]

  scheduleDetectionDispatch(db, red)
  scheduleDetectionDispatch(db, orange)
  scheduleDetectionDispatch(db, drowning)
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal((await get(db, 'SELECT notification_count FROM events WHERE id = ?', [drowning.id])).notification_count, 1)
  assert.equal((await get(db, 'SELECT notification_count FROM events WHERE id = ?', [red.id])).notification_count, 0)

  await new Promise((resolve) => setTimeout(resolve, 1250))
  const noncritical = await all(db, 'SELECT notification_count, dispatched_at FROM events WHERE id IN (?, ?)', [red.id, orange.id])
  assert.ok(noncritical.every((row) => row.notification_count === 1 && row.dispatched_at != null))
})

test('mobile workflow moves incidents from incoming to my responses to history', async (t) => {
  const db = await database(t)
  await run(db, `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'lifeguard')`,
    ['flow@poolseye.test', 'unused', 'Flow Guard'])
  await run(db, `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'lifeguard')`,
    ['offline@poolseye.test', 'unused', 'Offline Guard'])
  const guard = await get(db, 'SELECT id FROM users WHERE email = ?', ['flow@poolseye.test'])
  const offlineGuard = await get(db, 'SELECT id FROM users WHERE email = ?', ['offline@poolseye.test'])
  const incident = (await ingestDetection(db, detection({ id: 'mobile-flow', person_id: 111 }))).events[0]

  const previousSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'alert-flow-test-secret'
  const token = jwt.sign({ id: guard.id, role: 'lifeguard', aud: 'lifeguard' }, process.env.JWT_SECRET)
  const offlineToken = jwt.sign(
    { id: offlineGuard.id, role: 'lifeguard', aud: 'lifeguard' },
    process.env.JWT_SECRET
  )
  const app = express()
  app.use(express.json())
  registerMobileEventRoutes(app, db)
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  t.after(() => {
    if (previousSecret == null) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
    return new Promise((resolve) => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (path, options = {}) => fetch(`${base}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })

  let response = await request('/api/mobile/events?status=pending')
  let body = await response.json()
  assert.deepEqual(body.events.map((event) => event.id), [incident.id])

  response = await request(`/api/mobile/events/${incident.id}/respond`, { method: 'POST' })
  body = await response.json()
  assert.equal(body.event.status, 'responding')
  assert.equal(body.event.responder_name, 'Flow Guard')
  assert.ok(body.event.response_time_seconds >= 0)

  // Retrying on a slow/double tap is idempotent for the guard who owns it.
  response = await request(`/api/mobile/events/${incident.id}/respond`, { method: 'POST' })
  body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.event.responding_mine, true)

  // Other guards still see the active handoff, but cannot steal ownership.
  response = await fetch(`${base}/api/mobile/events?status=active`, {
    headers: { Authorization: `Bearer ${offlineToken}` },
  })
  body = await response.json()
  assert.deepEqual(body.events.map((event) => event.id), [incident.id])
  assert.equal(body.events[0].responder_name, 'Flow Guard')
  assert.equal(body.events[0].responding_mine, false)
  response = await fetch(`${base}/api/mobile/events/${incident.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${offlineToken}`, 'Content-Type': 'application/json' },
  })
  body = await response.json()
  assert.equal(response.status, 409)
  assert.equal(body.event.responder_name, 'Flow Guard')

  response = await request('/api/mobile/events?status=pending')
  assert.equal((await response.json()).events.length, 0)
  response = await request('/api/mobile/events?status=responding')
  assert.deepEqual((await response.json()).events.map((event) => event.id), [incident.id])

  response = await request(`/api/mobile/events/${incident.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }),
  })
  assert.equal(response.status, 400)
  response = await request(`/api/mobile/events/${incident.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'dismissed', reason: 'Reflection on the water' }),
  })
  body = await response.json()
  assert.equal(body.event.status, 'dismissed')
  assert.equal(body.event.closure_reason, 'Reflection on the water')

  response = await request('/api/mobile/events?status=active')
  assert.equal((await response.json()).events.length, 0)

  response = await request('/api/mobile/events?status=closed')
  assert.deepEqual((await response.json()).events.map((event) => event.id), [incident.id])

  response = await fetch(`${base}/api/mobile/events?status=closed`, {
    headers: { Authorization: `Bearer ${offlineToken}` },
  })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).events.map((event) => event.id), [incident.id])

  // Resolve follows the same lifecycle: it remains active after Respond Now
  // and disappears only after its owner verifies and closes the incident.
  const resolvedIncident = (await ingestDetection(db, detection({
    id: 'mobile-resolve-flow', person_id: 112, category: 'deep-water', zone: 'deep',
  }))).events[0]
  response = await request(`/api/mobile/events/${resolvedIncident.id}/respond`, { method: 'POST' })
  body = await response.json()
  assert.equal(body.event.status, 'responding')
  assert.equal(body.event.responding_mine, true)

  response = await request('/api/mobile/events?status=active')
  body = await response.json()
  assert.deepEqual(body.events.map((event) => event.id), [resolvedIncident.id])
  assert.equal(body.events[0].status, 'responding')

  response = await fetch(`${base}/api/mobile/events/${resolvedIncident.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${offlineToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' }),
  })
  assert.equal(response.status, 409)

  response = await request(`/api/mobile/events/${resolvedIncident.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'resolved' }),
  })
  body = await response.json()
  assert.equal(body.event.status, 'resolved')
  assert.equal(body.event.closed_by_name, 'Flow Guard')

  response = await request('/api/mobile/events?status=active')
  assert.equal((await response.json()).events.length, 0)

  // Ownership is isolated per incident: one guard handling an alert must not
  // prevent another guard from claiming a different pending alert.
  const firstParallel = (await ingestDetection(db, detection({
    id: 'parallel-flow-a', person_id: 121, category: 'intrusion', zone: 'red',
  }))).events[0]
  const secondParallel = (await ingestDetection(db, detection({
    id: 'parallel-flow-b', person_id: 122, category: 'deep-water', zone: 'deep',
  }))).events[0]

  const firstRespondStarted = Date.now() / 1000
  response = await request(`/api/mobile/events/${firstParallel.id}/respond`, { method: 'POST' })
  const firstClaim = await response.json()
  assert.equal(firstClaim.event.responding_mine, true)
  assert.ok(firstClaim.event.responding_at >= firstRespondStarted)
  assert.ok(firstClaim.event.responding_at <= Date.now() / 1000)

  response = await fetch(`${base}/api/mobile/events/${secondParallel.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${offlineToken}`, 'Content-Type': 'application/json' },
  })
  const secondClaim = await response.json()
  assert.equal(response.status, 200)
  assert.equal(secondClaim.event.responder_name, 'Offline Guard')
  assert.equal(secondClaim.event.responding_mine, true)

  response = await request('/api/mobile/events?status=active')
  body = await response.json()
  assert.equal(body.events.length, 2)
  const firstForFlowGuard = body.events.find((event) => event.id === firstParallel.id)
  const secondForFlowGuard = body.events.find((event) => event.id === secondParallel.id)
  assert.equal(firstForFlowGuard.responding_mine, true)
  assert.equal(secondForFlowGuard.responding_mine, false)
  assert.equal(secondForFlowGuard.responder_name, 'Offline Guard')

  response = await request(`/api/mobile/events/${firstParallel.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'resolved' }),
  })
  const firstClosed = await response.json()
  assert.ok(firstClosed.event.closed_at >= firstClosed.event.responding_at)

  response = await fetch(`${base}/api/mobile/events/${secondParallel.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${offlineToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'dismissed', reason: 'Pool reflection' }),
  })
  const secondClosed = await response.json()
  assert.equal(response.status, 200)
  assert.ok(secondClosed.event.closed_at >= secondClosed.event.responding_at)

  response = await request('/api/mobile/events?status=active')
  assert.equal((await response.json()).events.length, 0)
})
