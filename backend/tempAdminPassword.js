// Temporarily replace the local admin password, and put the original back later.
//   node tempAdminPassword.js reset [newPassword]
//   node tempAdminPassword.js restore
// Only touches the local SQLite database (backend/data/app.db), never the hosted one.
const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')

const DATA_DIR = path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'app.db')
const SAVED_PATH = path.join(DATA_DIR, 'admin_password_backup.json')
const EMAIL = (process.env.ADMIN_EMAIL || 'piapendergat275@gmail.com').trim().toLowerCase()
const DEFAULT_TEMP_PASSWORD = 'TempPoolsEye#2026'

const db = new sqlite3.Database(DB_PATH)
const query = (method, sql, params = []) =>
  new Promise((resolve, reject) => db[method](sql, params, (err, row) => (err ? reject(err) : resolve(row))))

async function reset(newPassword) {
  const user = await query('get', 'SELECT id, password_hash, must_change_password FROM users WHERE email = ?', [EMAIL])
  if (!user) throw new Error(`No account for ${EMAIL} in ${DB_PATH}`)

  // Keep the very first original; running reset twice must not overwrite it with the temp hash
  if (!fs.existsSync(SAVED_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDb = path.join(DATA_DIR, `app.backup-${stamp}.db`)
    await query('run', 'VACUUM INTO ?', [backupDb])
    fs.writeFileSync(SAVED_PATH, JSON.stringify({
      email: EMAIL,
      password_hash: user.password_hash,
      must_change_password: user.must_change_password,
      saved_at: new Date().toISOString(),
      full_backup: path.basename(backupDb),
    }, null, 2))
    console.log(`Full database backup: ${backupDb}`)
    console.log(`Original password saved: ${SAVED_PATH}`)
  } else {
    console.log(`Original password already saved earlier in ${SAVED_PATH} (kept as is)`)
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await query('run', 'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, user.id])
  console.log(`\nTemporary login ready:\n  email:    ${EMAIL}\n  password: ${newPassword}`)
  console.log('\nUndo later with: node tempAdminPassword.js restore')
}

async function restore() {
  if (!fs.existsSync(SAVED_PATH)) throw new Error(`Nothing to restore: ${SAVED_PATH} not found`)
  const saved = JSON.parse(fs.readFileSync(SAVED_PATH, 'utf8'))
  const result = await new Promise((resolve, reject) =>
    db.run(
      'UPDATE users SET password_hash = ?, must_change_password = ? WHERE email = ?',
      [saved.password_hash, saved.must_change_password, saved.email],
      function done(err) { return err ? reject(err) : resolve(this) }
    )
  )
  if (!result.changes) throw new Error(`No account for ${saved.email} to restore`)
  fs.renameSync(SAVED_PATH, SAVED_PATH.replace(/\.json$/, `.restored-${Date.now()}.json`))
  console.log(`Original password restored for ${saved.email}. The temporary password no longer works.`)
}

const [command, password] = process.argv.slice(2)
const task = command === 'reset' ? reset(password || DEFAULT_TEMP_PASSWORD)
  : command === 'restore' ? restore()
  : Promise.reject(new Error('Usage: node tempAdminPassword.js reset [newPassword] | restore'))

task
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(() => db.close())
