const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sqlite3 = require('sqlite3')
const { get, run } = require('./db')
const { __test } = require('./dataManagement')

function openDatabase(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => (err ? reject(err) : resolve(db)))
  })
}

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve())))
}

function close(db) {
  return new Promise((resolve) => db.close(() => resolve()))
}

test('backup is an accessible exact snapshot and reset is selective, verified, and atomic', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poolseye-data-test-'))
  const sourceFile = path.join(tempDir, 'source.sqlite3')
  const backupFile = path.join(tempDir, 'backup.sqlite3')
  let source
  let backup

  try {
    source = await openDatabase(sourceFile)
    await exec(source, fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
    await run(
      source,
      `INSERT INTO users
        (email, password_hash, name, role, acknowledged_alerts, missed_alerts, response_time)
       VALUES (?, ?, ?, 'lifeguard', 2, 1, '00:14')`,
      ['guard@example.test', 'preserved-password-hash', 'Test Guard']
    )
    await run(
      source,
      `INSERT INTO events (id, type, title, is_alert, ts) VALUES
       ('det-1', 'detection', 'Detection', 0, 1),
       ('alert-1', 'drowning', 'Alert', 1, 2),
       ('broadcast-1', 'broadcast', 'Broadcast', 0, 3)`
    )
    await run(source, "UPDATE events SET category = 'broadcast' WHERE id = 'broadcast-1'")
    await run(
      source,
      `INSERT INTO email_verifications (email, purpose, code, expires_at, sent_at)
       VALUES ('admin@example.test', 'signup', '123456', 9999999999, 1)`
    )
    await run(
      source,
      `INSERT INTO operating_hours (site_id, enabled, timezone, schedule, revision, updated_at)
       VALUES ('main', 1, 'Asia/Manila', '{}', 1, '2026-01-01')`
    )

    const copiedCounts = await __test.buildBackupFile(source, backupFile)
    assert.equal(copiedCounts.events, 3)
    assert.equal(copiedCounts.users, 1)
    assert.equal(copiedCounts.email_verifications, 0)

    backup = await openDatabase(backupFile)
    assert.equal((await get(backup, 'PRAGMA integrity_check')).integrity_check, 'ok')
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM events')).count, 3)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM email_verifications')).count, 0)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM operating_hours')).count, 1)
    await close(backup)
    backup = null

    const firstReset = await __test.executeVerifiedReset(source, ['detections'])
    assert.equal(firstReset.deletedCounts.detections, 1)
    assert.equal(firstReset.counts.detections, 0)
    assert.equal(firstReset.counts.alerts, 1)
    assert.equal(firstReset.counts.broadcasts, 1)

    const finalReset = await __test.executeVerifiedReset(source, ['alerts', 'broadcasts', 'responseStats'])
    assert.deepEqual(finalReset.deletedCounts, { alerts: 1, broadcasts: 1, responseStats: 1 })
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM events')).count, 0)
    assert.equal(
      (await get(source, "SELECT COUNT(*) AS count FROM events WHERE is_alert = 1 AND status = 'pending'")).count,
      0
    )

    const preservedUser = await get(
      source,
      `SELECT email, password_hash, acknowledged_alerts, missed_alerts, response_time
       FROM users LIMIT 1`
    )
    assert.deepEqual(preservedUser, {
      email: 'guard@example.test',
      password_hash: 'preserved-password-hash',
      acknowledged_alerts: 0,
      missed_alerts: 0,
      response_time: null,
    })
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM operating_hours')).count, 1)
  } finally {
    if (backup) await close(backup)
    if (source) await close(source)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
