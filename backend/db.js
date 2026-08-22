const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const bcrypt = require('bcrypt')

const DB_PATH = path.join(__dirname, 'data', 'app.db')
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

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

async function initDb() {
  const db = await openDb()
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8')
  await run(db, schema)

  const adminEmail = 'piapendergat275@gmail.com'
  const existing = await get(db, 'SELECT id FROM users WHERE email = ?', [adminEmail])

  if (!existing) {
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

  return db
}

module.exports = { initDb, get, run }