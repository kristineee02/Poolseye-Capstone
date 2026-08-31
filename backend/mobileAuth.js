const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { get, run } = require('./db')
const { validatePassword } = require('./password')
const { rowToMobileUser, getLifeguardByEmail } = require('./lifeguards')

const CODE_TTL_MS = 10 * 60 * 1000

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function lifeguardAuthRequired(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.aud !== 'lifeguard') {
      return res.status(403).json({ error: 'Lifeguard access only' })
    }
    req.lifeguard = payload
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

function signLifeguardToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: 'lifeguard', aud: 'lifeguard' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

async function getVerificationEntry(db, email, purpose) {
  const row = await get(
    db,
    'SELECT email, code, verified, expires_at FROM email_verifications WHERE email = ? AND purpose = ?',
    [email, purpose]
  )
  if (!row) return null
  if (Date.now() > row.expires_at) {
    await run(
      db,
      'DELETE FROM email_verifications WHERE email = ? AND purpose = ?',
      [email, purpose]
    )
    return null
  }
  return row
}

function registerMobileAuthRoutes(app, db) {
  app.post('/api/mobile/auth/login', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const password = String(req.body?.password || '')
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' })
      }

      const user = await getLifeguardByEmail(db, email)
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      if (user.status === 'archived') {
        return res.status(403).json({ error: 'This account has been deactivated. Contact your administrator.' })
      }

      const ok = await bcrypt.compare(password, user.password_hash)
      if (!ok) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      await run(
        db,
        `UPDATE users SET mobile_app_status = 'connected' WHERE id = ?`,
        [user.id]
      )

      const profile = rowToMobileUser(user)
      const token = signLifeguardToken(user)

      res.json({
        token,
        user: profile,
        mustChangePassword: profile.mustChangePassword,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Server error' })
    }
  })

  app.get('/api/mobile/auth/me', lifeguardAuthRequired, async (req, res) => {
    try {
      const user = await get(
        db,
        `SELECT * FROM users WHERE id = ? AND role = 'lifeguard'`,
        [req.lifeguard.id]
      )
      if (!user || user.status === 'archived') {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      res.json({ user: rowToMobileUser(user) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Server error' })
    }
  })

  app.post('/api/mobile/auth/change-password', lifeguardAuthRequired, async (req, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || '')
      const newPassword = String(req.body?.newPassword || '')
      const skipCurrentCheck = Boolean(req.body?.skipCurrentCheck)

      if (!newPassword) {
        return res.status(400).json({ error: 'Please enter a new password.' })
      }

      const user = await get(
        db,
        `SELECT * FROM users WHERE id = ? AND role = 'lifeguard'`,
        [req.lifeguard.id]
      )
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      const allowSkip = skipCurrentCheck || user.must_change_password
      if (!allowSkip) {
        const ok = await bcrypt.compare(currentPassword, user.password_hash)
        if (!ok) {
          return res.status(400).json({ error: 'Current password is incorrect.' })
        }
      } else if (!user.must_change_password) {
        const ok = await bcrypt.compare(currentPassword, user.password_hash)
        if (!ok) {
          return res.status(400).json({ error: 'Current password is incorrect.' })
        }
      }

      const check = validatePassword(newPassword, { email: user.email })
      if (!check.ok) return res.status(400).json(check)

      const passwordHash = await bcrypt.hash(newPassword, 10)
      await run(
        db,
        `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`,
        [passwordHash, user.id]
      )

      const updated = await get(db, 'SELECT * FROM users WHERE id = ?', [user.id])
      res.json({ ok: true, user: rowToMobileUser(updated) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Server error' })
    }
  })

  app.post('/api/mobile/auth/forgot-password/verify-email', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      if (!email) {
        return res.status(400).json({ error: 'Enter your account email.' })
      }

      const user = await getLifeguardByEmail(db, email)
      if (!user || user.status === 'archived') {
        return res.status(404).json({ error: 'No lifeguard account found for that email.' })
      }

      const now = Date.now()
      await run(
        db,
        `INSERT INTO email_verifications (email, purpose, code, verified, expires_at, sent_at)
         VALUES (?, 'password_reset', '', 1, ?, ?)
         ON CONFLICT(email, purpose) DO UPDATE SET
           verified = 1,
           expires_at = excluded.expires_at,
           sent_at = excluded.sent_at`,
        [email, now + CODE_TTL_MS, now]
      )

      res.json({ ok: true, email })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Server error' })
    }
  })

  app.post('/api/mobile/auth/forgot-password/reset', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const newPassword = String(req.body?.newPassword || '')

      if (!email) return res.status(400).json({ error: 'Email is required.' })
      if (!newPassword) {
        return res.status(400).json({ error: 'Please enter a new password.' })
      }

      const user = await getLifeguardByEmail(db, email)
      if (!user || user.status === 'archived') {
        return res.status(404).json({ error: 'No lifeguard account found for that email.' })
      }

      const entry = await getVerificationEntry(db, email, 'password_reset')
      if (!entry?.verified) {
        return res.status(400).json({ error: 'Verify your email before resetting your password.' })
      }

      const check = validatePassword(newPassword, { email })
      if (!check.ok) return res.status(400).json(check)

      const passwordHash = await bcrypt.hash(newPassword, 10)
      await run(
        db,
        `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`,
        [passwordHash, user.id]
      )
      await run(
        db,
        'DELETE FROM email_verifications WHERE email = ? AND purpose = ?',
        [email, 'password_reset']
      )

      res.json({ ok: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Server error' })
    }
  })

  app.patch('/api/mobile/auth/profile', lifeguardAuthRequired, async (req, res) => {
    try {
      const user = await get(
        db,
        `SELECT * FROM users WHERE id = ? AND role = 'lifeguard'`,
        [req.lifeguard.id]
      )
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      const name = String(req.body?.name ?? user.name).trim()
      if (!name) return res.status(400).json({ error: 'Name is required.' })

      const photoUri = req.body?.photoUri !== undefined ? req.body.photoUri : user.photo_uri

      await run(
        db,
        'UPDATE users SET name = ?, photo_uri = ? WHERE id = ?',
        [name, photoUri, user.id]
      )

      const updated = await get(db, 'SELECT * FROM users WHERE id = ?', [user.id])
      res.json({ ok: true, user: rowToMobileUser(updated) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Server error' })
    }
  })
}

module.exports = { registerMobileAuthRoutes, lifeguardAuthRequired }
