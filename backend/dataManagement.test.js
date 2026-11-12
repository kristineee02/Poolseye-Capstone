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
    await run(source, `INSERT INTO event_people
      (event_id, person_id, first_seen_at, last_seen_at, occurrence_count) VALUES
      ('det-1', 10, 1, 1, 1),
      ('alert-1', 20, 2, 2, 1)`)
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
    await run(source, `INSERT INTO camera_settings (camera_id, ip_address, rtsp_port, revision, updated_at)
      VALUES ('CAM-01', '192.168.1.50', 554, 2, '2026-01-01')`)
    await run(source, `INSERT INTO geofence_layouts (camera_id, revision, coord_space)
      VALUES ('CAM-01', 3, 'editor')`)
    await run(source, `INSERT INTO geofence_zones (id, camera_id, name, type, sort_order)
      VALUES ('red-test', 'CAM-01', 'Red Zone', 'red', 1)`)
    await run(source, `INSERT INTO geofence_points (zone_id, seq, x, y)
      VALUES ('red-test', 0, 10, 20), ('red-test', 1, 30, 40)`)

    const copiedCounts = await __test.buildBackupFile(source, backupFile)
    assert.equal(copiedCounts.events, 3)
    assert.equal(copiedCounts.users, 1)
    assert.equal(copiedCounts.email_verifications, 0)

    backup = await openDatabase(backupFile)
    assert.equal((await get(backup, 'PRAGMA integrity_check')).integrity_check, 'ok')
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM events')).count, 3)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM email_verifications')).count, 0)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM operating_hours')).count, 1)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM camera_settings')).count, 1)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM geofence_zones')).count, 1)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM geofence_points')).count, 2)
    await close(backup)
    backup = null

    const selectiveCounts = await __test.filterBackupFile(backupFile, ['alerts'])
    assert.equal(selectiveCounts.events, 1)
    backup = await openDatabase(backupFile)
    assert.equal((await get(backup, "SELECT COUNT(*) AS count FROM events WHERE is_alert = 1")).count, 1)
    assert.equal((await get(backup, "SELECT COUNT(*) AS count FROM events WHERE is_alert = 0")).count, 0)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM event_people')).count, 1)
    assert.equal(await get(backup, 'PRAGMA foreign_key_check'), undefined)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM camera_settings')).count, 1)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM geofence_zones')).count, 1)
    assert.equal((await get(backup, 'SELECT COUNT(*) AS count FROM operating_hours')).count, 1)
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
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM event_people')).count, 0)
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
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM camera_settings')).count, 1)
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM geofence_zones')).count, 1)

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
      `INSERT INTO events (
        id, type, title, meta, status, severity, category, confidence, camera,
        person_id, zone, zone_label, event_name, is_alert, snapshot_uri, clip_uri,
        acknowledged_at, acknowledged_by, dispatched_at, responding_at, responding_by,
        priority, priority_label, incident_key, group_key, person_ids, occurrence_count,
        first_detected_at, last_detected_at, notification_count, last_notified_at,
        siren_activated_at, detection_source, source_name, closure_reason, ts
       ) VALUES
       ('old-detection', 'detection', 'Old detection', 'Normal activity', 'resolved', 'LOW', NULL, 0.8, 'CAM-01',
        5, 'yellow', 'Yellow zone', 'SUPERVISED', 0, '/media/detection.jpg', '/media/detection.webm',
        NULL, NULL, NULL, NULL, NULL, 5, 'informational', NULL, 'normal-group', '[5]', 2,
        1, 1.5, 0, NULL, NULL, 'Live CCTV', NULL, NULL, 1),
       ('old-alert', 'alarm', 'Old alert', 'Distress detected', 'responding', 'CRITICAL', 'drowning', 0.97, 'UPLOAD',
        7, 'orange', 'Orange zone', 'POSSIBLE_DROWNING', 1, '/media/alert.jpg', '/media/alert.webm',
        2.2, 1, 2.1, 2.2, 1, 1, 'critical', 'upload:drowning:7', 'drowning-group', '[7]', 4,
        2, 2.5, 1, 2.1, 2.3, 'Uploaded Video', 'scenario.mp4', NULL, 2),
       ('old-false-alarm', 'alarm', 'False alarm', 'Reflection', 'dismissed', 'HIGH', 'intrusion', 0.75, 'CAM-01',
        8, 'red', 'Red zone', 'RED_ZONE_INTRUSION', 1, '/media/false.jpg', NULL,
        3.1, 1, 3, 3.1, 1, 2, 'high', 'live:intrusion:8', 'intrusion-group', '[8]', 1,
        3, 3.1, 1, 3, NULL, 'Live CCTV', NULL, 'Sunlight reflection', 3)`
    )
    await run(source, `INSERT INTO event_people
      (event_id, person_id, first_seen_at, last_seen_at, occurrence_count) VALUES
      ('old-detection', 5, 1, 1.5, 2),
      ('old-alert', 7, 2, 2.5, 4),
      ('old-false-alarm', 8, 3, 3.1, 1)`)
    await __test.buildBackupFile(source, backupFile)

    await __test.executeVerifiedReset(source, ['detections', 'alerts', 'responseStats'])
    await run(
      source,
      `INSERT INTO events (id, type, title, category, is_alert, ts)
       VALUES ('new-alert', 'drowning', 'New alert', 'drowning', 1, 3)`
    )

    const restored = await __test.restoreDeletedData(source, backupFile)
    assert.deepEqual(restored, {
      events: 3,
      eventPeople: 3,
      responseStats: 1,
      skippedExistingEvents: 0,
      skippedExistingEventPeople: 0,
    })
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM events')).count, 4)
    assert.equal((await get(source, "SELECT COUNT(*) AS count FROM events WHERE id = 'new-alert'")).count, 1)
    assert.equal((await get(source, 'SELECT COUNT(*) AS count FROM event_people')).count, 3)

    const restoredAlert = await get(source, `SELECT status, category, confidence, camera, person_id,
      snapshot_uri, clip_uri, acknowledged_by, responding_by, priority, incident_key, group_key,
      person_ids, occurrence_count, notification_count, siren_activated_at,
      detection_source, source_name FROM events WHERE id = 'old-alert'`)
    assert.deepEqual(restoredAlert, {
      status: 'responding',
      category: 'drowning',
      confidence: 0.97,
      camera: 'UPLOAD',
      person_id: 7,
      snapshot_uri: '/media/alert.jpg',
      clip_uri: '/media/alert.webm',
      acknowledged_by: 1,
      responding_by: 1,
      priority: 1,
      incident_key: 'upload:drowning:7',
      group_key: 'drowning-group',
      person_ids: '[7]',
      occurrence_count: 4,
      notification_count: 1,
      siren_activated_at: 2.3,
      detection_source: 'Uploaded Video',
      source_name: 'scenario.mp4',
    })
    assert.equal(
      (await get(source, "SELECT closure_reason FROM events WHERE id = 'old-false-alarm'")).closure_reason,
      'Sunlight reflection'
    )

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
    assert.deepEqual(repeated, {
      events: 0,
      eventPeople: 0,
      responseStats: 0,
      skippedExistingEvents: 3,
      skippedExistingEventPeople: 3,
    })
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
