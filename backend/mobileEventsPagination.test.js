const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const jwt = require('jsonwebtoken')
const sqlite3 = require('sqlite3').verbose()
const { exec, run, migrateEventsTable } = require('./db')
const { registerMobileEventRoutes } = require('./mobileEvents')

process.env.JWT_SECRET ||= 'poolseye-pagination-test-secret'

async function testServer(t) {
  const db = await new Promise((resolve, reject) => {
    const next = new sqlite3.Database(':memory:', (error) => (error ? reject(error) : resolve(next)))
  })
  await exec(db, fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
  await migrateEventsTable(db)
  const user = await run(
    db,
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'lifeguard')",
    ['pager@poolseye.test', 'unused', 'Pagination Guard']
  )
  const secondUser = await run(
    db,
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'lifeguard')",
    ['second-pager@poolseye.test', 'unused', 'Second Pagination Guard']
  )

  const app = express()
  app.use(express.json())
  registerMobileEventRoutes(app, db)
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  t.after(() => new Promise((resolve) => db.close(resolve)))

  const token = jwt.sign(
    { id: user.lastID, email: 'pager@poolseye.test', role: 'lifeguard', aud: 'lifeguard' },
    process.env.JWT_SECRET
  )
  const secondToken = jwt.sign(
    { id: secondUser.lastID, email: 'second-pager@poolseye.test', role: 'lifeguard', aud: 'lifeguard' },
    process.env.JWT_SECRET
  )
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  return { db, baseUrl, token, secondToken }
}

async function insertAlert(db, { id, status, ts, category = 'intrusion', priority = 2, eventName = null }) {
  await run(
    db,
    `INSERT INTO events
      (id, type, title, status, category, event_name, camera, zone, zone_label, is_alert, ts, priority, priority_label)
     VALUES (?, 'alarm', ?, ?, ?, ?, 'CAM-01', 'red', 'Red zone', 1, ?, ?, ?)`,
    [id, `Alert ${id}`, status, category, eventName, ts, priority, priority === 1 ? 'critical' : 'high']
  )
}

async function getEvents(baseUrl, token, query) {
  const response = await fetch(`${baseUrl}/api/mobile/events?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(response.status, 200)
  return response.json()
}

test('history cursor pagination is duplicate-free and active alerts retain priority order', async (t) => {
  const { db, baseUrl, token } = await testServer(t)
  const now = Math.floor(Date.now() / 1000)

  for (let index = 0; index < 65; index += 1) {
    await insertAlert(db, { id: `closed-${String(index).padStart(3, '0')}`, status: 'resolved', ts: now - index })
  }
  await insertAlert(db, { id: 'active-supervision', status: 'pending', ts: now + 1, category: 'supervision', priority: 3 })
  await insertAlert(db, { id: 'active-intrusion', status: 'pending', ts: now + 2, category: 'intrusion', priority: 2 })
  await insertAlert(db, { id: 'active-drowning', status: 'pending', ts: now, category: 'drowning', priority: 1 })
  await insertAlert(db, { id: 'active-claimed', status: 'responding', ts: now - 1, category: 'intrusion', priority: 2 })

  const first = await getEvents(baseUrl, token, 'alertsOnly=1&status=closed&limit=30')
  assert.equal(first.events.length, 30)
  assert.equal(first.totalCount, 65)
  assert.equal(first.hasMore, true)

  const cursor = first.nextCursor
  const second = await getEvents(
    baseUrl,
    token,
    `alertsOnly=1&status=closed&limit=30&beforeTs=${cursor.ts}&beforeId=${encodeURIComponent(cursor.id)}`
  )
  assert.equal(second.events.length, 30)
  assert.equal(second.totalCount, 65)
  const firstIds = new Set(first.events.map((event) => event.id))
  assert.ok(second.events.every((event) => !firstIds.has(event.id)))

  const active = await getEvents(baseUrl, token, 'alertsOnly=1&status=pending&limit=100')
  assert.deepEqual(
    active.events.map((event) => event.id),
    ['active-drowning', 'active-intrusion', 'active-supervision']
  )
  assert.equal(active.pendingCount, 3)

  const allActive = await getEvents(baseUrl, token, 'alertsOnly=1&status=active&limit=100')
  assert.deepEqual(
    allActive.events.map((event) => event.id),
    ['active-drowning', 'active-intrusion', 'active-claimed', 'active-supervision']
  )
  assert.equal(allActive.pendingCount, 3)
})

test('closed history remains visible when an alert category is muted', async (t) => {
  const { db, baseUrl, token } = await testServer(t)
  const now = Math.floor(Date.now() / 1000)

  await run(
    db,
    'UPDATE users SET notification_prefs = ? WHERE email = ?',
    [JSON.stringify({ boundary: false, supervision: false }), 'pager@poolseye.test']
  )
  await insertAlert(db, { id: 'closed-muted-boundary', status: 'resolved', ts: now, category: 'intrusion' })
  await insertAlert(db, { id: 'closed-muted-supervision', status: 'resolved', ts: now - 1, category: 'supervision' })
  await insertAlert(db, { id: 'pending-muted-boundary', status: 'pending', ts: now + 1, category: 'intrusion' })

  const history = await getEvents(baseUrl, token, 'alertsOnly=1&status=closed&limit=30')
  assert.deepEqual(
    history.events.map((event) => event.id),
    ['closed-muted-boundary', 'closed-muted-supervision']
  )

  const incoming = await getEvents(baseUrl, token, 'alertsOnly=1&status=pending&limit=30')
  assert.deepEqual(incoming.events, [])
})

test('simultaneous claims have one owner and leave other pending alerts available', async (t) => {
  const { db, baseUrl, token, secondToken } = await testServer(t)
  const now = Math.floor(Date.now() / 1000)
  await insertAlert(db, {
    id: 'contested-alert', status: 'pending', ts: now, category: 'drowning', priority: 1,
  })
  await insertAlert(db, {
    id: 'next-unclaimed-alert', status: 'pending', ts: now - 1, category: 'intrusion', priority: 2,
  })

  const claim = (authToken) => fetch(`${baseUrl}/api/mobile/events/contested-alert/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
  })
  const responses = await Promise.all([claim(token), claim(secondToken)])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])

  const bodies = await Promise.all(responses.map((response) => response.json()))
  assert.equal(bodies.filter((body) => body.event.responding_mine).length, 1)
  assert.equal(new Set(bodies.map((body) => body.event.responding_by)).size, 1)

  const firstGuardActive = await getEvents(baseUrl, token, 'alertsOnly=1&status=active&limit=100')
  const secondGuardActive = await getEvents(baseUrl, secondToken, 'alertsOnly=1&status=active&limit=100')
  assert.deepEqual(firstGuardActive.events.map((event) => event.id), ['contested-alert', 'next-unclaimed-alert'])
  assert.deepEqual(secondGuardActive.events.map((event) => event.id), ['contested-alert', 'next-unclaimed-alert'])
  assert.equal(
    firstGuardActive.events.find((event) => event.id === 'contested-alert').responding_mine,
    !secondGuardActive.events.find((event) => event.id === 'contested-alert').responding_mine
  )

  const pending = await getEvents(baseUrl, token, 'alertsOnly=1&status=pending&limit=100')
  assert.deepEqual(pending.events.map((event) => event.id), ['next-unclaimed-alert'])
})

test('history filters use Poolseye categories, outcomes, event names, and dates', async (t) => {
  const { db, baseUrl, token } = await testServer(t)
  const now = Math.floor(Date.now() / 1000)
  await insertAlert(db, {
    id: 'recent-drowning', status: 'resolved', ts: now - 60,
    category: 'drowning', priority: 1, eventName: 'POSSIBLE_DROWNING',
  })
  await insertAlert(db, {
    id: 'old-drowning', status: 'resolved', ts: now - 40 * 86400,
    category: 'drowning', priority: 1, eventName: 'POSSIBLE_DROWNING',
  })
  await insertAlert(db, {
    id: 'false-intrusion', status: 'dismissed', ts: now - 120,
    category: 'intrusion', priority: 2, eventName: 'RED_ZONE_INTRUSION',
  })
  await insertAlert(db, {
    id: 'after-hours', status: 'resolved', ts: now - 180,
    category: 'supervision', priority: 4, eventName: 'AFTER_HOURS_PRESENCE',
  })

  const falseAlarms = await getEvents(baseUrl, token, 'status=closed&outcome=dismissed')
  assert.deepEqual(falseAlarms.events.map((event) => event.id), ['false-intrusion'])

  const drowning = await getEvents(baseUrl, token, 'status=closed&category=drowning')
  assert.deepEqual(drowning.events.map((event) => event.id), ['recent-drowning', 'old-drowning'])

  const afterHours = await getEvents(baseUrl, token, 'status=closed&eventName=AFTER_HOURS_PRESENCE')
  assert.deepEqual(afterHours.events.map((event) => event.id), ['after-hours'])

  const recent = await getEvents(baseUrl, token, `status=closed&category=drowning&since=${now - 7 * 86400}`)
  assert.deepEqual(recent.events.map((event) => event.id), ['recent-drowning'])
  assert.equal(recent.totalCount, 1)
})
