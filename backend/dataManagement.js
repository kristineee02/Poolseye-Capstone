const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sqlite3 = require('sqlite3')
const express = require('express')
const { get, run, all, transaction } = require('./db')

// A reset must follow a backup made by the same admin within this window.
const BACKUP_MAX_AGE_SEC = 30 * 60
const PAGE_SIZE = 1000
const TIME_ZONE = process.env.BACKUP_TIMEZONE || 'Asia/Manila'

// Test alerts and admin broadcasts live in `events` too; these filters split the table into
// three groups that never overlap, so clearing one group cannot touch another.
const NOT_BROADCAST_OR_TEST = "COALESCE(category, '') <> 'broadcast' AND COALESCE(camera, '') <> 'TEST'"

const EVENT_CATEGORIES = {
  detections: {
    label: 'Detection events',
    where: `is_alert = 0 AND ${NOT_BROADCAST_OR_TEST}`,
  },
  alerts: {
    label: 'Alerts & acknowledgments',
    where: `is_alert = 1 AND ${NOT_BROADCAST_OR_TEST}`,
  },
  broadcasts: {
    label: 'Broadcasts & test alerts',
    where: "(COALESCE(category, '') = 'broadcast' OR COALESCE(camera, '') = 'TEST')",
  },
}

const RESPONSE_STATS_WHERE = `role = 'lifeguard' AND (
  COALESCE(acknowledged_alerts, 0) <> 0 OR COALESCE(missed_alerts, 0) <> 0
  OR response_time IS NOT NULL OR last_alert_acknowledged_at IS NOT NULL
)`

const CATEGORY_KEYS = [...Object.keys(EVENT_CATEGORIES), 'responseStats']

// Temporary sign-in codes are never worth restoring, so only their table definition is copied.
const SKIP_ROWS = new Set(['email_verifications'])

let backupInProgress = false
let resetInProgress = false
let restoreInProgress = false

function httpError(status, message, code) {
  const err = new Error(message)
  err.status = status
  if (code) err.code = code
  return err
}

function backupFileName(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value])
  )
  return `poolseye-backup-${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}.sqlite3`
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

function toSqliteValue(value) {
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return value
}

function openFile(file) {
  return new Promise((resolve, reject) => {
    const target = new sqlite3.Database(file, (err) => (err ? reject(err) : resolve(target)))
  })
}

function fileRun(target, sql, params = []) {
  return new Promise((resolve, reject) => {
    target.run(sql, params, (err) => (err ? reject(err) : resolve()))
  })
}

function fileAll(target, sql, params = []) {
  return new Promise((resolve, reject) => {
    target.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  })
}

function closeFile(target) {
  return new Promise((resolve) => target.close(() => resolve()))
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

async function readSchema(db) {
  const objects = await all(
    db,
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE 'libsql_%'
       AND name NOT LIKE '_litestream%'
       AND name NOT LIKE '_cf_%'`
  )
  return {
    tables: objects.filter((o) => o.type === 'table'),
    // Indexes and triggers are added after the rows so the copy runs fast and the
    // append-only audit triggers don't fire while the backup is being filled.
    extras: objects.filter((o) => o.type === 'index' || o.type === 'trigger'),
  }
}

async function copyTable(db, target, table) {
  if (SKIP_ROWS.has(table)) return 0
  const columns = (await all(db, `PRAGMA table_info(${quoteIdent(table)})`)).map((c) => c.name)
  if (!columns.length) return 0

  const insertSql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})`
  let copied = 0
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await all(
      db,
      `SELECT * FROM ${quoteIdent(table)} ORDER BY rowid LIMIT ? OFFSET ?`,
      [PAGE_SIZE, offset]
    )
    for (const row of rows) {
      await fileRun(target, insertSql, columns.map((c) => toSqliteValue(row[c])))
    }
    copied += rows.length
    if (rows.length < PAGE_SIZE) break
  }
  return copied
}

async function verifyBackupFile(file, expectedCounts) {
  const target = await openFile(file)
  try {
    const integrity = await fileAll(target, 'PRAGMA integrity_check')
    if (integrity[0]?.integrity_check !== 'ok') {
      throw new Error(`Backup failed the integrity check (${integrity[0]?.integrity_check || 'unknown'})`)
    }
    const foreignKeyErrors = await fileAll(target, 'PRAGMA foreign_key_check')
    if (foreignKeyErrors.length) {
      throw new Error(`Backup contains ${foreignKeyErrors.length} foreign-key integrity error(s)`)
    }
    for (const [table, expected] of Object.entries(expectedCounts)) {
      const rows = await fileAll(target, `SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`)
      if (Number(rows[0]?.count) !== expected) {
        throw new Error(`Backup row count for ${table} does not match the live database`)
      }
    }
  } finally {
    await closeFile(target)
  }
}

async function inspectBackupFile(file) {
  const counts = {}
  const target = await openFile(file)
  try {
    const integrity = await fileAll(target, 'PRAGMA integrity_check')
    if (integrity[0]?.integrity_check !== 'ok') {
      throw new Error(`Backup failed the integrity check (${integrity[0]?.integrity_check || 'unknown'})`)
    }
    const foreignKeyErrors = await fileAll(target, 'PRAGMA foreign_key_check')
    if (foreignKeyErrors.length) {
      throw new Error(`Backup contains ${foreignKeyErrors.length} foreign-key integrity error(s)`)
    }
    const tables = await fileAll(
      target,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    for (const { name } of tables) {
      const rows = await fileAll(target, `SELECT COUNT(*) AS count FROM ${quoteIdent(name)}`)
      counts[name] = Number(rows[0]?.count || 0)
    }
  } finally {
    await closeFile(target)
  }
  return counts
}

function quoteSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function buildLocalBackupFile(db, file) {
  // VACUUM INTO is SQLite's transactionally consistent snapshot operation. It
  // produces a standalone database that can be opened by any SQLite client.
  await run(db, `VACUUM INTO ${quoteSqlString(file)}`)
  const target = await openFile(file)
  try {
    // Keep the table/schema but never copy temporary sign-in verification codes.
    await fileRun(target, 'DELETE FROM email_verifications')
  } finally {
    await closeFile(target)
  }
  return inspectBackupFile(file)
}

async function buildPortableBackupFile(db, file) {
  const counts = {}
  const target = await openFile(file)
  try {
    await fileRun(target, 'PRAGMA journal_mode = OFF')
    await fileRun(target, 'PRAGMA synchronous = OFF')
    await transaction(db, async () => {
      const { tables, extras } = await readSchema(db)
      for (const t of tables) await fileRun(target, t.sql)
      await fileRun(target, 'BEGIN')
      try {
        for (const t of tables) counts[t.name] = await copyTable(db, target, t.name)
        await fileRun(target, 'COMMIT')
      } catch (err) {
        try { await fileRun(target, 'ROLLBACK') } catch { /* already rolled back */ }
        throw err
      }
      for (const extra of extras) await fileRun(target, extra.sql)
    }, 'read')
  } finally {
    await closeFile(target)
  }
  await verifyBackupFile(file, counts)
  return counts
}

async function buildBackupFile(db, file) {
  return db && !db._client
    ? buildLocalBackupFile(db, file)
    : buildPortableBackupFile(db, file)
}

async function countCategories(db) {
  const result = {}
  for (const [key, cat] of Object.entries(EVENT_CATEGORIES)) {
    const row = await get(db, `SELECT COUNT(*) AS count FROM events WHERE ${cat.where}`)
    result[key] = Number(row?.count || 0)
  }
  const stats = await get(db, `SELECT COUNT(*) AS count FROM users WHERE ${RESPONSE_STATS_WHERE}`)
  result.responseStats = Number(stats?.count || 0)
  return result
}

function backupPayload(row) {
  if (!row) return null
  const metadata = parseBackupMetadata(row.table_counts)
  const tableCounts = metadata.tables
  return {
    id: row.id,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    createdAt: Math.round(row.created_at * 1000),
    verifiedAt: row.verified_at ? Math.round(row.verified_at * 1000) : null,
    tableCounts,
    totalRows: Object.values(tableCounts).reduce((sum, count) => sum + Number(count || 0), 0),
    categories: metadata.categories,
  }
}

function parseBackupMetadata(value) {
  let parsed = {}
  try { parsed = JSON.parse(value || '{}') } catch { /* keep empty */ }
  if (parsed?.tables && typeof parsed.tables === 'object') {
    return {
      tables: parsed.tables,
      categories: Array.isArray(parsed.categories) ? parsed.categories : CATEGORY_KEYS,
    }
  }
  // Backups created before selective scope support were always complete.
  return { tables: parsed && typeof parsed === 'object' ? parsed : {}, categories: CATEGORY_KEYS }
}

function resetLogPayload(row) {
  let categories = []
  let deletedCounts = {}
  try { categories = JSON.parse(row.categories || '[]') } catch { /* keep empty */ }
  try { deletedCounts = JSON.parse(row.deleted_counts || '{}') } catch { /* keep empty */ }
  return {
    id: row.id,
    adminEmail: row.admin_email,
    categories,
    deletedCounts,
    backupId: row.backup_id,
    status: row.status,
    error: row.error,
    createdAt: Math.round(row.created_at * 1000),
  }
}

function parseCategories(input) {
  if (!Array.isArray(input) || !input.length) {
    throw httpError(400, 'Select at least one category to reset.')
  }
  const unique = [...new Set(input.map(String))]
  const unknown = unique.filter((key) => !CATEGORY_KEYS.includes(key))
  if (unknown.length) throw httpError(400, `Unknown reset category: ${unknown.join(', ')}`)
  return CATEGORY_KEYS.filter((key) => unique.includes(key))
}

function parseBackupCategories(input) {
  if (input == null || input === '') return CATEGORY_KEYS
  const values = Array.isArray(input) ? input : String(input).split(',').filter(Boolean)
  return parseCategories(values)
}

async function filterBackupFile(file, categories) {
  if (categories.length === CATEGORY_KEYS.length) return inspectBackupFile(file)
  const target = await openFile(file)
  try {
    await fileRun(target, 'BEGIN IMMEDIATE')
    try {
      for (const [key, category] of Object.entries(EVENT_CATEGORIES)) {
        if (!categories.includes(key)) {
          await fileRun(target, `DELETE FROM events WHERE ${category.where}`)
        }
      }
      if (!categories.includes('responseStats')) {
        await fileRun(
          target,
          `UPDATE users SET acknowledged_alerts = 0, missed_alerts = 0,
             response_time = NULL, last_alert_acknowledged_at = NULL
           WHERE role = 'lifeguard'`
        )
      }
      await fileRun(target, 'COMMIT')
    } catch (err) {
      try { await fileRun(target, 'ROLLBACK') } catch { /* already rolled back */ }
      throw err
    }
  } finally {
    await closeFile(target)
  }
  return inspectBackupFile(file)
}

async function requireUsableBackup(db, backupId, adminId, requiredCategories = []) {
  const backup = backupId
    ? await get(db, 'SELECT * FROM data_backups WHERE id = ?', [String(backupId)])
    : null
  if (!backup || backup.admin_id !== adminId) {
    throw httpError(412, 'Create and download a backup before resetting data.', 'backup_required')
  }
  if (!backup.verified_at) {
    throw httpError(412, 'The backup download was not verified. Create a new backup.', 'backup_required')
  }
  if (Date.now() / 1000 - backup.created_at > BACKUP_MAX_AGE_SEC) {
    throw httpError(412, 'Your backup is older than 30 minutes. Create a new backup first.', 'backup_required')
  }
  const used = await get(
    db,
    "SELECT id FROM data_reset_log WHERE backup_id = ? AND status = 'completed' LIMIT 1",
    [backup.id]
  )
  if (used) {
    throw httpError(412, 'That backup was already used for a reset. Create a new backup first.', 'backup_required')
  }
  const backupCategories = parseBackupMetadata(backup.table_counts).categories
  const missing = requiredCategories.filter((category) => !backupCategories.includes(category))
  if (missing.length) {
    throw httpError(
      412,
      'That backup does not include every category selected for reset. Create a new backup with matching categories.',
      'backup_required'
    )
  }
  return backup
}

function resetStatements(categories) {
  const statements = []
  for (const key of categories) {
    if (EVENT_CATEGORIES[key]) {
      statements.push({ key, sql: `DELETE FROM events WHERE ${EVENT_CATEGORIES[key].where}` })
    } else if (key === 'responseStats') {
      statements.push({
        key,
        sql: `UPDATE users SET
                acknowledged_alerts = 0,
                missed_alerts = 0,
                response_time = NULL,
                last_alert_acknowledged_at = NULL
              WHERE ${RESPONSE_STATS_WHERE}`,
      })
    }
  }
  return statements
}

async function executeVerifiedReset(db, categories) {
  return transaction(db, async () => {
    const before = await countCategories(db)
    const statements = resetStatements(categories)
    const deletedCounts = {}

    for (const statement of statements) {
      const result = await run(db, statement.sql)
      deletedCounts[statement.key] = Number(result?.changes || 0)
    }

    const after = await countCategories(db)
    for (const key of CATEGORY_KEYS) {
      const label = EVENT_CATEGORIES[key]?.label || 'response statistics'
      if (categories.includes(key)) {
        if (after[key] !== 0) {
          throw new Error(`Reset verification failed for ${label}`)
        }
        if (deletedCounts[key] !== before[key]) {
          throw new Error(`Reset count mismatch for ${label}`)
        }
      } else if (after[key] !== before[key]) {
        // A selective reset must never modify an unchecked category. Throwing
        // here rolls back every statement in this transaction.
        throw new Error(`Unchecked category changed during reset: ${label}`)
      }
    }

    const preservedCounts = Object.fromEntries(
      CATEGORY_KEYS.filter((key) => !categories.includes(key)).map((key) => [key, after[key]])
    )
    return { deletedCounts, counts: after, preservedCounts }
  }, 'write')
}

async function tableColumns(target, table, sourceFile = false) {
  const rows = sourceFile
    ? await fileAll(target, `PRAGMA table_info(${quoteIdent(table)})`)
    : await all(target, `PRAGMA table_info(${quoteIdent(table)})`)
  return rows.map((column) => column.name)
}

async function restoreDeletedData(db, file) {
  const source = await openFile(file)
  try {
    const integrity = await fileAll(source, 'PRAGMA integrity_check')
    if (integrity[0]?.integrity_check !== 'ok') {
      throw httpError(400, 'The selected file is not a valid, intact SQLite backup.')
    }
    const foreignKeyErrors = await fileAll(source, 'PRAGMA foreign_key_check')
    if (foreignKeyErrors.length) {
      throw httpError(400, 'The selected backup contains invalid or incomplete related records.')
    }

    const sourceTables = new Set(
      (await fileAll(source, "SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => row.name)
    )
    if (!sourceTables.has('events') || !sourceTables.has('users')) {
      throw httpError(400, 'This is not a compatible PoolsEye backup (events or users table is missing).')
    }

    const sourceEventColumns = await tableColumns(source, 'events', true)
    const liveEventColumns = await tableColumns(db, 'events')
    const eventColumns = liveEventColumns.filter((column) => sourceEventColumns.includes(column))
    for (const required of ['id', 'type', 'title', 'ts']) {
      if (!eventColumns.includes(required)) {
        throw httpError(400, `This backup is missing the required events.${required} field.`)
      }
    }

    const sourceUserColumns = await tableColumns(source, 'users', true)
    const statColumns = ['email', 'role', 'acknowledged_alerts', 'missed_alerts', 'response_time', 'last_alert_acknowledged_at']
    const canRestoreStats = statColumns.every((column) => sourceUserColumns.includes(column))
    const insertEventSql = `INSERT OR IGNORE INTO events (${eventColumns.map(quoteIdent).join(', ')})
      VALUES (${eventColumns.map(() => '?').join(', ')})`

    return await transaction(db, async () => {
      let sourceEvents = 0
      let restoredEvents = 0
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const rows = await fileAll(
          source,
          `SELECT ${eventColumns.map(quoteIdent).join(', ')} FROM events ORDER BY rowid LIMIT ? OFFSET ?`,
          [PAGE_SIZE, offset]
        )
        for (const row of rows) {
          const result = await run(db, insertEventSql, eventColumns.map((column) => toSqliteValue(row[column])))
          restoredEvents += Number(result?.changes || 0)
        }
        sourceEvents += rows.length
        if (rows.length < PAGE_SIZE) break
      }

      let restoredResponseStats = 0
      if (canRestoreStats) {
        const guards = await fileAll(
          source,
          `SELECT ${statColumns.map(quoteIdent).join(', ')} FROM users WHERE role = 'lifeguard'`
        )
        for (const guard of guards) {
          const hasStats = Number(guard.acknowledged_alerts || 0) !== 0
            || Number(guard.missed_alerts || 0) !== 0
            || guard.response_time != null
            || guard.last_alert_acknowledged_at != null
          if (!hasStats) continue
          // Do not overwrite newer statistics. Only profiles still in the reset/empty state are recovered.
          const result = await run(
            db,
            `UPDATE users SET acknowledged_alerts = ?, missed_alerts = ?, response_time = ?, last_alert_acknowledged_at = ?
             WHERE email = ? AND role = 'lifeguard'
               AND COALESCE(acknowledged_alerts, 0) = 0 AND COALESCE(missed_alerts, 0) = 0
               AND response_time IS NULL AND last_alert_acknowledged_at IS NULL`,
            [
              Number(guard.acknowledged_alerts || 0),
              Number(guard.missed_alerts || 0),
              guard.response_time,
              guard.last_alert_acknowledged_at,
              guard.email,
            ]
          )
          restoredResponseStats += Number(result?.changes || 0)
        }
      }

      return {
        events: restoredEvents,
        responseStats: restoredResponseStats,
        skippedExistingEvents: sourceEvents - restoredEvents,
      }
    }, 'write')
  } finally {
    await closeFile(source)
  }
}

async function writeResetLog(db, { admin, categories, deletedCounts, backupId, status, error }) {
  try {
    await run(
      db,
      `INSERT INTO data_reset_log (admin_id, admin_email, categories, deleted_counts, backup_id, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        admin.id,
        admin.email || null,
        JSON.stringify(categories),
        deletedCounts ? JSON.stringify(deletedCounts) : null,
        backupId || null,
        status,
        error || null,
        Date.now() / 1000,
      ]
    )
  } catch (err) {
    console.error('[data] could not write reset audit log:', err)
  }
}

async function writeRestoreLog(db, { admin, fileName, sha256, size, restoredCounts, status, error }) {
  try {
    await run(
      db,
      `INSERT INTO data_restore_log
        (admin_id, admin_email, file_name, file_sha256, file_size_bytes, restored_counts, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        admin.id,
        admin.email || null,
        fileName,
        sha256,
        size,
        restoredCounts ? JSON.stringify(restoredCounts) : null,
        status,
        error || null,
        Date.now() / 1000,
      ]
    )
  } catch (err) {
    console.error('[data] could not write restore audit log:', err)
  }
}

function sendError(res, err, fallback) {
  const status = err.status || 500
  if (status === 500) console.error(err)
  res.status(status).json({ error: status === 500 ? fallback : err.message, code: err.code })
}

function registerDataManagementRoutes(app, db, adminRequired) {
  app.get('/api/admin/data/summary', adminRequired, async (req, res) => {
    try {
      const counts = await countCategories(db)
      const lastBackup = await get(
        db,
        `SELECT * FROM data_backups
         WHERE admin_id = ? AND verified_at IS NOT NULL
           AND id NOT IN (SELECT backup_id FROM data_reset_log WHERE status = 'completed' AND backup_id IS NOT NULL)
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.id]
      )
      res.json({ counts, lastBackup: backupPayload(lastBackup), backupMaxAgeSec: BACKUP_MAX_AGE_SEC })
    } catch (err) {
      sendError(res, err, 'Could not load data summary')
    }
  })

  app.post('/api/admin/data/backup', adminRequired, async (req, res) => {
    if (backupInProgress || restoreInProgress) {
      return res.status(409).json({ error: 'Another backup or restore operation is already running. Please wait.' })
    }
    backupInProgress = true
    const id = crypto.randomUUID()
    const createdAt = new Date()
    const fileName = backupFileName(createdAt)
    const file = path.join(os.tmpdir(), `poolseye-backup-${id}.sqlite3`)
    const cleanup = () => fs.rm(file, { force: true }, () => {})

    try {
      const categories = parseBackupCategories(req.query.categories)
      const snapshotCounts = await buildBackupFile(db, file)
      const counts = categories.length === CATEGORY_KEYS.length
        ? snapshotCounts
        : await filterBackupFile(file, categories)
      const { size } = fs.statSync(file)
      const sha256 = await sha256File(file)
      await run(
        db,
        `INSERT INTO data_backups (id, admin_id, admin_email, file_name, size_bytes, sha256, table_counts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.user.id,
          req.user.email || null,
          fileName,
          size,
          sha256,
          JSON.stringify({ tables: counts, categories }),
          createdAt.getTime() / 1000,
        ]
      )
      console.log(`[data] backup ${fileName} created by admin #${req.user.id} (${size} bytes)`)

      res.setHeader('Content-Type', 'application/vnd.sqlite3')
      res.setHeader('Content-Length', size)
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Backup-Id', id)
      res.setHeader('X-Backup-Sha256', sha256)
      res.setHeader('X-Backup-Size', String(size))
      const stream = fs.createReadStream(file)
      stream.on('error', (err) => {
        console.error('[data] backup stream failed:', err)
        res.destroy(err)
      })
      stream.on('close', cleanup)
      stream.pipe(res)
    } catch (err) {
      cleanup()
      sendError(res, err, 'Could not create the backup')
    } finally {
      backupInProgress = false
    }
  })

  // The dashboard confirms the file it received matches the server's hash; only then can it be used for a reset.
  app.post('/api/admin/data/backup/:id/verify', adminRequired, async (req, res) => {
    try {
      const backup = await get(db, 'SELECT * FROM data_backups WHERE id = ?', [String(req.params.id)])
      if (!backup || backup.admin_id !== req.user.id) {
        return res.status(404).json({ error: 'Backup not found.' })
      }
      const sha256 = String(req.body?.sha256 || '').toLowerCase()
      const size = Number(req.body?.size)
      const matches = sha256 ? sha256 === backup.sha256 : size === backup.size_bytes
      if (!matches) {
        return res.status(400).json({ error: 'The downloaded file does not match the backup. Try again.' })
      }
      if (!backup.verified_at) {
        await run(db, 'UPDATE data_backups SET verified_at = ? WHERE id = ?', [Date.now() / 1000, backup.id])
      }
      const fresh = await get(db, 'SELECT * FROM data_backups WHERE id = ?', [backup.id])
      res.json({ ok: true, backup: backupPayload(fresh) })
    } catch (err) {
      sendError(res, err, 'Could not verify the backup')
    }
  })

  app.post(
    '/api/admin/data/restore',
    adminRequired,
    express.raw({ type: ['application/octet-stream', 'application/vnd.sqlite3'], limit: '128mb' }),
    async (req, res) => {
      if (restoreInProgress || backupInProgress || resetInProgress) {
        return res.status(409).json({ error: 'Another data operation is already running. Please wait.' })
      }
      restoreInProgress = true
      const admin = { id: req.user.id, email: req.user.email }
      const fileName = path.basename(String(req.query.fileName || 'poolseye-backup.sqlite3')).slice(0, 180)
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      const file = path.join(os.tmpdir(), `poolseye-restore-${crypto.randomUUID()}.sqlite3`)

      try {
        if (String(req.query.confirm || '') !== 'RESTORE') {
          throw httpError(400, 'Type RESTORE to confirm.')
        }
        if (bytes.length < 16 || bytes.subarray(0, 16).toString('binary') !== 'SQLite format 3\u0000') {
          throw httpError(400, 'Select a valid PoolsEye .sqlite3 backup file.')
        }
        fs.writeFileSync(file, bytes, { flag: 'wx' })
        const restoredCounts = await restoreDeletedData(db, file)
        await writeRestoreLog(db, {
          admin, fileName, sha256, size: bytes.length, restoredCounts, status: 'completed',
        })
        console.log(`[data] restore by admin #${admin.id} from ${fileName}: ${JSON.stringify(restoredCounts)}`)
        res.json({ ok: true, fileName, restoredCounts, verified: true })
      } catch (err) {
        await writeRestoreLog(db, {
          admin, fileName, sha256, size: bytes.length, status: 'failed', error: err.message,
        })
        sendError(res, err, 'Restore failed. No data was changed.')
      } finally {
        fs.rm(file, { force: true }, () => {})
        restoreInProgress = false
      }
    }
  )

  app.post('/api/admin/data/reset', adminRequired, async (req, res) => {
    if (resetInProgress || restoreInProgress) {
      return res.status(409).json({ error: 'A reset or restore is already running. Please wait.' })
    }
    resetInProgress = true
    const admin = { id: req.user.id, email: req.user.email }
    let categories = []
    let backupId = null

    try {
      categories = parseCategories(req.body?.categories)
      if (String(req.body?.confirm || '') !== 'RESET') {
        throw httpError(400, 'Type RESET to confirm.')
      }
      const backup = await requireUsableBackup(db, req.body?.backupId, admin.id, categories)
      backupId = backup.id

      // Delete, count, and verify inside one transaction. Any mismatch rolls the
      // entire reset back, so categories cannot be left partially cleared.
      const { deletedCounts, counts, preservedCounts } = await executeVerifiedReset(db, categories)

      await writeResetLog(db, { admin, categories, deletedCounts, backupId, status: 'completed' })
      console.log(`[data] reset by admin #${admin.id}: ${JSON.stringify(deletedCounts)} (backup ${backupId})`)

      res.json({ ok: true, deletedCounts, counts, preservedCounts, verified: true })
    } catch (err) {
      // Validation failures are not resets; only attempts that reached the database are audited.
      if (backupId) {
        await writeResetLog(db, { admin, categories, backupId, status: 'failed', error: err.message })
      }
      sendError(res, err, 'Reset failed. No data was changed.')
    } finally {
      resetInProgress = false
    }
  })

  app.get('/api/admin/data/reset-log', adminRequired, async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
      const rows = await all(db, 'SELECT * FROM data_reset_log ORDER BY created_at DESC LIMIT ?', [limit])
      res.json({ entries: rows.map(resetLogPayload) })
    } catch (err) {
      sendError(res, err, 'Could not load reset history')
    }
  })
}

module.exports = {
  registerDataManagementRoutes,
  EVENT_CATEGORIES,
  CATEGORY_KEYS,
  // Exported for isolated database verification tests only.
  __test: {
    buildBackupFile,
    filterBackupFile,
    requireUsableBackup,
    executeVerifiedReset,
    restoreDeletedData,
  },
}
