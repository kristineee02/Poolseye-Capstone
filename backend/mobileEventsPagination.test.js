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
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  return { db, baseUrl, token }
}

async function insertAlert(db, { id, status, ts, category = 'intrusion', priority = 2 }) {
  await run(
    db,
    `INSERT INTO events
      (id, type, title, status, category, camera, zone, zone_label, is_alert, ts, priority, priority_label)
     VALUES (?, 'alarm', ?, ?, ?, 'CAM-01', 'red', 'Red zone', 1, ?, ?, ?)`,
    [id, `Alert ${id}`, status, category, ts, priority, priority === 1 ? 'critical' : 'high']
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
})
