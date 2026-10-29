const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sqlite3 = require('sqlite3')
const { get, run } = require('./db')
const { CATEGORY_KEYS, __test } = require('./dataManagement')

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

    const selectiveCounts = await __test.filterBackupFile(backupFile, ['alerts'])
    assert.equal(selectiveCounts.events, 1)
    backup = await openDatabase(backupFile)
    assert.equal((await get(backup, "SELECT COUNT(*) AS count FROM events WHERE is_alert = 1")).count, 1)
    assert.equal((await get(backup, "SELECT COUNT(*) AS count FROM events WHERE is_alert = 0")).count, 0)
    assert.deepEqual(
      await get(backup, 'SELECT acknowledged_alerts, missed_alerts, response_time FROM users LIMIT 1'),
      { acknowledged_alerts: 0, missed_alerts: 0, response_time: null }
    )
    await close(backup)
    backup = null

    const firstReset = await __test.executeVerifiedReset(source, ['detections'])
    assert.equal(firstReset.deletedCounts.detections, 1)
    assert.equal(firstReset.counts.detections, 0)
    assert.equal(firstReset.counts.alerts, 1)
    assert.equal(firstReset.counts.broadcasts, 1)
    assert.equal(firstReset.counts.responseStats, 1)
    assert.deepEqual(firstReset.preservedCounts, { alerts: 1, broadcasts: 1, responseStats: 1 })

    const alertOnlyReset = await __test.executeVerifiedReset(source, ['alerts'])
    assert.deepEqual(alertOnlyReset.deletedCounts, { alerts: 1 })
    assert.deepEqual(alertOnlyReset.preservedCounts, { detections: 0, broadcasts: 1, responseStats: 1 })
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM events')).count, 1)

    const finalReset = await __test.executeVerifiedReset(source, ['broadcasts', 'responseStats'])
    assert.deepEqual(finalReset.deletedCounts, { broadcasts: 1, responseStats: 1 })
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

    await run(
      source,
      `INSERT INTO events (id, type, title, category, is_alert, ts) VALUES
       ('det-2', 'detection', 'Detection 2', NULL, 0, 4),
       ('alert-2', 'drowning', 'Alert 2', 'drowning', 1, 5),
       ('broadcast-2', 'broadcast', 'Broadcast 2', 'broadcast', 0, 6)`
    )
    await run(
      source,
      `UPDATE users SET acknowledged_alerts = 3, missed_alerts = 2, response_time = '00:20'
       WHERE role = 'lifeguard'`
    )
    const selectAllReset = await __test.executeVerifiedReset(source, CATEGORY_KEYS)
    assert.deepEqual(selectAllReset.deletedCounts, {
      detections: 1,
      alerts: 1,
      broadcasts: 1,
      responseStats: 1,
    })
    assert.deepEqual(selectAllReset.counts, {
      detections: 0,
      alerts: 0,
      broadcasts: 0,
      responseStats: 0,
    })
    assert.deepEqual(selectAllReset.preservedCounts, {})
  } finally {
    if (backup) await close(backup)
    if (source) await close(source)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('restore recovers deleted records from a real backup without overwriting current data', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poolseye-restore-test-'))
  const sourceFile = path.join(tempDir, 'source.sqlite3')
  const backupFile = path.join(tempDir, 'backup.sqlite3')
  let source

  try {
    source = await openDatabase(sourceFile)
    await exec(source, fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
    await run(
      source,
      `INSERT INTO users
        (email, password_hash, name, role, acknowledged_alerts, missed_alerts, response_time, last_alert_acknowledged_at)
       VALUES (?, 'hash', 'Guard', 'lifeguard', 4, 2, '00:18', '2026-01-01')`,
      ['guard@example.test']
    )
    await run(
      source,
      `INSERT INTO events (id, type, title, category, is_alert, ts) VALUES
       ('old-detection', 'detection', 'Old detection', NULL, 0, 1),
       ('old-alert', 'drowning', 'Old alert', 'drowning', 1, 2)`
    )
    await __test.buildBackupFile(source, backupFile)

    await __test.executeVerifiedReset(source, ['detections', 'alerts', 'responseStats'])
    await run(
      source,
      `INSERT INTO events (id, type, title, category, is_alert, ts)
       VALUES ('new-alert', 'drowning', 'New alert', 'drowning', 1, 3)`
    )

    const restored = await __test.restoreDeletedData(source, backupFile)
    assert.deepEqual(restored, { events: 2, responseStats: 1, skippedExistingEvents: 0 })
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM events')).count, 3)
    assert.equal((await get(source, "SELECT COUNT(*) AS count FROM events WHERE id = 'new-alert'")).count, 1)

    const guard = await get(
      source,
      `SELECT acknowledged_alerts, missed_alerts, response_time, last_alert_acknowledged_at
       FROM users WHERE email = 'guard@example.test'`
    )
    assert.deepEqual(guard, {
      acknowledged_alerts: 4,
      missed_alerts: 2,
      response_time: '00:18',
      last_alert_acknowledged_at: '2026-01-01',
    })

    const repeated = await __test.restoreDeletedData(source, backupFile)
    assert.deepEqual(repeated, { events: 0, responseStats: 0, skippedExistingEvents: 2 })
  } finally {
    if (source) await close(source)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('reset accepts only a fresh verified backup that covers every selected category', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poolseye-scope-test-'))
  const sourceFile = path.join(tempDir, 'source.sqlite3')
  let source

  try {
    source = await openDatabase(sourceFile)
    await exec(source, fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
    const now = Date.now() / 1000
    await run(
      source,
      `INSERT INTO data_backups
        (id, admin_id, file_name, size_bytes, sha256, table_counts, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'selective-backup',
        7,
        'selective.sqlite3',
        100,
        'test-hash',
        JSON.stringify({ tables: { events: 3 }, categories: ['alerts', 'responseStats'] }),
        now,
        now,
      ]
    )

    const accepted = await __test.requireUsableBackup(source, 'selective-backup', 7, ['alerts'])
    assert.equal(accepted.id, 'selective-backup')

    await assert.rejects(
      __test.requireUsableBackup(source, 'selective-backup', 7, ['alerts', 'detections']),
      (err) => err.status === 412 && err.code === 'backup_required'
    )
  } finally {
    if (source) await close(source)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
