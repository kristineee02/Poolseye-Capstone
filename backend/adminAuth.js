const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { get, run } = require('./db')
const { validatePassword } = require('./password')
const { sendPasswordResetCodeEmail } = require('./email')

const CODE_TTL_MS = 10 * 60 * 1000

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function initials(name) {
  return String(name || 'Admin')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function adminPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    initials: initials(user.name),
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
  }
}

function signAdminToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: 'admin', aud: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

function signChallenge(user, step) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, aud: 'auth-challenge', step },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  )
}

function readChallenge(token, step) {
  const payload = jwt.verify(token, process.env.JWT_SECRET)
  if (payload.aud !== 'auth-challenge' || payload.step !== step || payload.role !== 'admin') {
    const err = new Error('This sign-in step expired. Start again.')
    err.status = 401
    throw err
  }
  return payload
}

async function saveCode(db, email, purpose, code) {
  const now = Date.now()
  await run(
    db,
    `INSERT INTO email_verifications (email, purpose, code, verified, expires_at, sent_at)
     VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(email, purpose) DO UPDATE SET
       code = excluded.code,
       verified = 0,
       expires_at = excluded.expires_at,
       sent_at = excluded.sent_at`,
    [email, purpose, code, now + CODE_TTL_MS, now]
  )
}

async function consumeCode(db, email, purpose, code) {
  const row = await get(
    db,
    'SELECT code, expires_at FROM email_verifications WHERE email = ? AND purpose = ?',
    [email, purpose]
  )
  if (!row || Date.now() > row.expires_at) {
    return { ok: false, error: 'No active verification code. Send a new one.' }
  }
  if (row.code !== String(code || '').trim()) {
    return { ok: false, error: 'Incorrect verification code.' }
  }
  await run(db, 'DELETE FROM email_verifications WHERE email = ? AND purpose = ?', [email, purpose])
  return { ok: true }
}

async function issueAdminSession(db, user) {
  const fresh = await get(db, 'SELECT * FROM users WHERE id = ? AND role = ?', [user.id, 'admin'])
  return {
    token: signAdminToken(fresh),
    user: adminPayload(fresh),
  }
}

function registerAdminAuthRoutes(app, db) {
  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const password = String(req.body?.password || '')
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' })
      }

      const user = await get(db, 'SELECT * FROM users WHERE email = ?', [email])
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Use the mobile app to sign in as a lifeguard.' })
      }

      const ok = await bcrypt.compare(password, user.password_hash)
      if (!ok) return res.status(401).json({ error: 'Invalid email or password' })

      if (user.must_change_password) {
        return res.json({
          step: 'change_password',
          challengeToken: signChallenge(user, 'change_password'),
        })
      }

      res.json(await issueAdminSession(db, user))
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err.message || 'Server error' })
    }
  })

  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const newPassword = String(req.body?.newPassword || '')
      const challenge = String(req.body?.challengeToken || '')
      let userId = null

      if (challenge) {
        const payload = readChallenge(challenge, 'change_password')
        userId = payload.id
      } else {
        const header = req.headers.authorization || ''
        const token = header.startsWith('Bearer ') ? header.slice(7) : null
        if (!token) return res.status(401).json({ error: 'Unauthorized' })
        const payload = jwt.verify(token, process.env.JWT_SECRET)
        if (payload.role !== 'admin' || payload.aud !== 'admin') {
          return res.status(403).json({ error: 'Admin access only' })
        }
        userId = payload.id
      }

      const user = await get(db, 'SELECT * FROM users WHERE id = ? AND role = ?', [userId, 'admin'])
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      if (!challenge) {
        const currentPassword = String(req.body?.currentPassword || '')
        const ok = await bcrypt.compare(currentPassword, user.password_hash)
        if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' })
      }

      const check = validatePassword(newPassword, { email: user.email })
      if (!check.ok) return res.status(400).json(check)
      if (await bcrypt.compare(newPassword, user.password_hash)) {
        return res.status(400).json({ error: 'Choose a different password.' })
      }

      const passwordHash = await bcrypt.hash(newPassword, 10)
      await run(
        db,
        'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
        [passwordHash, user.id]
      )
      res.json(await issueAdminSession(db, user))
    } catch (err) {
      const status = err.status || 500
      if (status === 500) console.error(err)
      res.status(status).json({ error: err.message || 'Could not update password' })
    }
  })

  app.post('/api/auth/forgot-password/send', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      if (!email) return res.status(400).json({ error: 'Email is required.' })

      const user = await get(db, 'SELECT * FROM users WHERE email = ? AND role = ?', [email, 'admin'])
      const payload = {
        ok: true,
        message: 'If that admin email exists, a reset code was sent.',
      }
      if (user) {
        const code = makeCode()
        await saveCode(db, email, 'admin_password_reset', code)
        const sent = await sendPasswordResetCodeEmail(email, code, { audience: 'admin' })
        if (sent.demo) payload.demoCode = code
      }
      res.json(payload)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err.message || 'Failed to send reset code' })
    }
  })

  app.post('/api/auth/forgot-password/reset', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const newPassword = String(req.body?.newPassword || '')
      const user = await get(db, 'SELECT * FROM users WHERE email = ? AND role = ?', [email, 'admin'])
      if (!user) return res.status(400).json({ error: 'Incorrect verification code.' })

      const checked = await consumeCode(db, email, 'admin_password_reset', req.body?.code)
      if (!checked.ok) return res.status(400).json(checked)

      const check = validatePassword(newPassword, { email })
      if (!check.ok) return res.status(400).json(check)

      const passwordHash = await bcrypt.hash(newPassword, 10)
      await run(
        db,
        'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
        [passwordHash, user.id]
      )
      res.json({ ok: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not reset password' })
    }
  })

  app.get('/api/auth/me', async (req, res) => {
    try {
      const header = req.headers.authorization || ''
      const token = header.startsWith('Bearer ') ? header.slice(7) : null
      if (!token) return res.status(401).json({ error: 'Unauthorized' })
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      if (payload.role !== 'admin' || payload.aud !== 'admin') {
        return res.status(403).json({ error: 'Admin access only' })
      }
      const user = await get(db, 'SELECT * FROM users WHERE id = ? AND role = ?', [payload.id, 'admin'])
      if (!user) return res.status(401).json({ error: 'Unauthorized' })
      res.json({ user: adminPayload(user) })
    } catch {
      res.status(401).json({ error: 'Unauthorized' })
    }
  })

}

module.exports = { registerAdminAuthRoutes }
