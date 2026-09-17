require('dotenv').config()
const { AsyncLocalStorage } = require('node:async_hooks')
const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const { createClient } = require('@libsql/client')
const bcrypt = require('bcrypt')

const DB_PATH = path.join(__dirname, 'data', 'app.db')
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')
const txStore = new AsyncLocalStorage()

const LIFEGUARD_COLUMNS = [
  ['lifeguard_role', 'TEXT'],
  ['phone', 'TEXT'],
  ['assigned_zones', 'TEXT'],
  ['certifications', 'TEXT'],
  ['status', "TEXT NOT NULL DEFAULT 'active'"],
  ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
  ['photo_uri', 'TEXT'],
  ['shift_start', 'TEXT'],
  ['shift_end', 'TEXT'],
  ['mobile_app_status', "TEXT DEFAULT 'disconnected'"],
  ['acknowledged_alerts', 'INTEGER NOT NULL DEFAULT 0'],
  ['missed_alerts', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_alert_acknowledged_at', 'TEXT'],
  ['on_duty_since', 'TEXT'],
  ['response_time', 'TEXT'],
]

function isLibsql(db) {
  return Boolean(db && db._client)
}

function activeExecutor(db) {
  return txStore.getStore()?.tx || db._client
}

function resultMeta(result) {
  const rawId = result.lastInsertRowid
  return {
    lastID: rawId == null ? 0 : Number(rawId),
    changes: Number(result.rowsAffected || 0),
  }
}

function toPlainRow(row) {
  if (!row) return undefined
  const plain = {}
  for (const key of Object.keys(row)) {
    if (/^\d+$/.test(key)) continue
    const value = row[key]
    plain[key] = typeof value === 'bigint' ? Number(value) : value
  }
  return plain
}

function openSqlite() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err)
      else resolve(db)
    })
  })
}

function sqliteRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

function sqliteGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

function sqliteExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function openLibsql() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!authToken) {
    throw new Error('TURSO_DATABASE_URL is set, but TURSO_AUTH_TOKEN is missing')
  }

  return {
    _client: createClient({
      url,
      authToken,
      intMode: 'number',
    }),
  }
}

async function libsqlRun(db, sql, params = []) {
  const statement = sql.trim()

  if (/^BEGIN\b/i.test(statement)) {
    const tx = await db._client.transaction('write')
    txStore.enterWith({ tx })
    return { lastID: 0, changes: 0 }
  }

  if (/^COMMIT\b/i.test(statement)) {
    const ctx = txStore.getStore()
    if (ctx?.tx) {
      const tx = ctx.tx
      ctx.tx = null
      try {
        await tx.commit()
      } finally {
        try { tx.close() } catch { /* already closed */ }
      }
    }
    return { lastID: 0, changes: 0 }
  }

  if (/^ROLLBACK\b/i.test(statement)) {
    const ctx = txStore.getStore()
    if (ctx?.tx) {
      const tx = ctx.tx
      ctx.tx = null
      try { await tx.rollback() } catch { /* already closed */ }
      try { tx.close() } catch { /* already closed */ }
    }
    return { lastID: 0, changes: 0 }
  }

  const result = await activeExecutor(db).execute({ sql, args: params })
  return resultMeta(result)
}

async function libsqlGet(db, sql, params = []) {
  const result = await activeExecutor(db).execute({ sql, args: params })
  return result.rows[0] ? toPlainRow(result.rows[0]) : undefined
}

async function libsqlAll(db, sql, params = []) {
  const result = await activeExecutor(db).execute({ sql, args: params })
  return result.rows.map((row) => toPlainRow(row))
}

async function libsqlExec(db, sql) {
  await db._client.executeMultiple(sql)
}

function run(db, sql, params = []) {
  return isLibsql(db) ? libsqlRun(db, sql, params) : sqliteRun(db, sql, params)
}

function get(db, sql, params = []) {
  return isLibsql(db) ? libsqlGet(db, sql, params) : sqliteGet(db, sql, params)
}

function all(db, sql, params = []) {
  return isLibsql(db) ? libsqlAll(db, sql, params) : sqliteAll(db, sql, params)
}

function exec(db, sql) {
  return isLibsql(db) ? libsqlExec(db, sql) : sqliteExec(db, sql)
}

async function columnExists(db, table, column) {
  const rows = await all(db, `PRAGMA table_info(${table})`)
  return rows.some((row) => row.name === column)
}

async function migrateUsersTable(db) {
  for (const [column, definition] of LIFEGUARD_COLUMNS) {
    const exists = await columnExists(db, 'users', column)
    if (!exists) {
      await run(db, `ALTER TABLE users ADD COLUMN ${column} ${definition}`)
      console.log(`Migrated users.${column}`)
    }
  }
}

async function seedDemoLifeguard(db) {
  const email = 'jonas@poolseye.com'
  const existing = await get(db, 'SELECT id FROM users WHERE email = ?', [email])
  if (existing) return

  const passwordHash = await bcrypt.hash('lifeguard123', 10)
  await run(
    db,
    `INSERT INTO users (
      email, password_hash, name, role, lifeguard_role, phone,
      assigned_zones, certifications, status, must_change_password,
      shift_start, shift_end, mobile_app_status
    ) VALUES (?, ?, ?, 'lifeguard', ?, ?, ?, ?, 'active', 1, ?, ?, 'disconnected')`,
    [
      email,
      passwordHash,
      'Jonas Ramos',
      'Lifeguard',
      '',
      JSON.stringify(['Main Pool']),
      JSON.stringify(['CPR/AED', 'Lifeguard', 'First Aid']),
      '06:00 AM',
      '06:00 PM',
    ]
  )
  console.log('Demo lifeguard created:', email)
}

async function initDb() {
  const useTurso = Boolean(process.env.TURSO_DATABASE_URL)
  const db = useTurso ? openLibsql() : await openSqlite()
  console.log(useTurso ? 'Database: Turso' : `Database: local SQLite (${DB_PATH})`)

  try {
    await run(db, 'PRAGMA foreign_keys = ON')
  } catch (err) {
    console.warn('Could not enable foreign keys:', err.message)
  }

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8')
  await exec(db, schema)
  await migrateUsersTable(db)

  const adminEmail = 'piapendergat275@gmail.com'
  const existingAdmin = await get(
    db,
    'SELECT id, password_hash FROM users WHERE email = ?',
    [adminEmail]
  )

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('AdminPoolsEye@2026', 10)
    await run(
      db,
      `INSERT INTO users (email, password_hash, name, role, must_change_password)
       VALUES (?, ?, ?, ?, 1)`,
      [adminEmail, passwordHash, 'PoolsEye', 'admin']
    )
    console.log('Default admin created:', adminEmail)
  } else {
    const stillDefault = await bcrypt.compare('AdminPoolsEye@2026', existingAdmin.password_hash || '')
    if (stillDefault) {
      await run(db, 'UPDATE users SET must_change_password = 1 WHERE id = ?', [existingAdmin.id])
    }
    console.log('Default admin already exists')
  }

  await seedDemoLifeguard(db)

  return db
}

module.exports = { initDb, get, run, all, exec }
