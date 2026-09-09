require('dotenv').config()
const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const bcrypt = require('bcrypt')

const DB_PATH = path.join(__dirname, 'data', 'app.db')
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

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

function openDb() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err)
      else resolve(db)
    })
  })
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
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
  const db = await openDb()
  await run(db, 'PRAGMA foreign_keys = ON')
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8')
  await exec(db, schema)
  await migrateUsersTable(db)

  const adminEmail = 'piapendergat275@gmail.com'
  const existingAdmin = await get(db, 'SELECT id FROM users WHERE email = ?', [adminEmail])

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('AdminPoolsEye@2026', 10)
    await run(
      db,
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [adminEmail, passwordHash, 'PoolsEye', 'admin']
    )
    console.log('Default admin created:', adminEmail)
  } else {
    console.log('Default admin already exists')
  }

  await seedDemoLifeguard(db)

  return db
}

module.exports = { initDb, get, run, all, exec }
