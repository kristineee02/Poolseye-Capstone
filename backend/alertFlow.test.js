const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sqlite3 = require('sqlite3').verbose()
const { all, exec, get, run, migrateEventsTable } = require('./db')
const { ingestDetection, setEventStatus } = require('./events')
const { dispatchEvent, escalationTick } = require('./dispatch')

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

test('ongoing intrusion is deduplicated while unrelated incidents remain active', async (t) => {
  const db = await database(t)
  const intrusion = detection({ id: 'intrusion-1', person_id: 7 })
  const first = await ingestDetection(db, intrusion)
  const again = await ingestDetection(db, { ...intrusion, id: 'intrusion-2', person_id: 8, ts: intrusion.ts + 1 })
  const supervision = await ingestDetection(db, detection({
    id: 'supervision-1', type: 'warn', category: 'supervision', event: 'UNSUPERVISED',
    zone: 'yellow-a', zone_label: 'Yellow A', person_ids: [31, 32], person_id: null,
  }))
  assert.equal(first.events[0].id, again.events[0].id)
  assert.deepEqual(again.events[0].person_ids, [7, 8])
  assert.equal(supervision.events[0].priority, 3)
  assert.equal((await all(db, "SELECT id FROM events WHERE status = 'pending'")).length, 2)
})

test('unsupervised roster updates one zone incident and preserves member history', async (t) => {
  const db = await database(t)
  const base = detection({
    id: 'digest-supervision-CAM-01', type: 'warn', category: 'supervision',
    event: 'UNSUPERVISED', zone: 'yellow-a', zone_label: 'Yellow A', person_id: null,
    person_ids: [1, 2],
  })
  const first = await ingestDetection(db, base)
  const second = await ingestDetection(db, { ...base, person_ids: [2, 3], ts: base.ts + 1 })
  assert.equal(first.events[0].id, second.events[0].id)
  assert.deepEqual(second.events[0].person_ids, [2, 3])
  assert.equal(second.events[0].affected_count, 2)
  assert.deepEqual((await all(db, 'SELECT person_id FROM event_people ORDER BY person_id')).map((r) => r.person_id), [1, 2, 3])
})

test('yellow and supervised events remain informational history only', async (t) => {
  const db = await database(t)
  await ingestDetection(db, detection({
    id: 'yellow-1', type: 'info', category: 'yellow', event: 'ENTERED POOL AREA',
    is_alert: false, status: 'resolved', person_id: 9,
  }))
  const row = await get(db, "SELECT * FROM events WHERE id = 'yellow-1'")
  assert.equal(row.priority, 4)
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
