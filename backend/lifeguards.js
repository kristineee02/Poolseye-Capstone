const bcrypt = require('bcrypt')
const { get, all, run } = require('./db')
const { validatePassword } = require('./password')
const {
  sendVerificationCodeEmail,
  sendWelcomeEmail,
} = require('./email')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_TTL_MS = 10 * 60 * 1000

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function parseJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function lifeguardId(dbId) {
  return `lg-${dbId}`
}

function parseLifeguardId(id) {
  const raw = String(id || '')
  if (raw.startsWith('lg-')) return Number(raw.slice(3))
  return Number(raw)
}

function rowToGuard(row) {
  if (!row) return null
  return {
    id: lifeguardId(row.id),
    initials: initials(row.name),
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    role: row.lifeguard_role || 'Lifeguard',
    status: row.status || 'active',
    certifications: parseJson(row.certifications, ['Lifeguard']),
    assignedZones: parseJson(row.assigned_zones, []),
    onDutySince: row.on_duty_since || null,
    lastAlertAcknowledgedAt: row.last_alert_acknowledged_at || null,
    responseTime: row.response_time || null,
    acknowledgedAlerts: row.acknowledged_alerts || 0,
    missedAlerts: row.missed_alerts || 0,
    createdAt: row.created_at,
    mobileAppStatus: row.mobile_app_status || 'disconnected',
    channels: [{ label: 'App push', primary: true }],
    mustChangePassword: Boolean(row.must_change_password),
    photoUri: row.photo_uri || null,
    shiftStart: row.shift_start || null,
    shiftEnd: row.shift_end || null,
  }
}

function rowToMobileUser(row) {
  if (!row) return null
  return {
    id: lifeguardId(row.id),
    email: row.email,
    name: row.name,
    initials: initials(row.name),
    role: row.lifeguard_role || 'Lifeguard',
    shiftStart: row.shift_start || '06:00 AM',
    shiftEnd: row.shift_end || '06:00 PM',
    mustChangePassword: Boolean(row.must_change_password),
    photoUri: row.photo_uri || null,
  }
}

async function listLifeguards(db) {
  const rows = await all(
    db,
    `SELECT * FROM users WHERE role = 'lifeguard' ORDER BY created_at DESC`
  )
  return rows.map(rowToGuard)
}

async function getLifeguardByEmail(db, email) {
  return get(
    db,
    `SELECT * FROM users WHERE email = ? AND role = 'lifeguard'`,
    [normalizeEmail(email)]
  )
}

async function getLifeguardById(db, id) {
  const dbId = parseLifeguardId(id)
  if (!dbId) return null
  return get(db, `SELECT * FROM users WHERE id = ? AND role = 'lifeguard'`, [dbId])
}

async function emailTaken(db, email, excludeId = null) {
  const normalized = normalizeEmail(email)
  const row = await get(db, 'SELECT id, role FROM users WHERE email = ?', [normalized])
  if (!row) return false
  if (excludeId && row.id === parseLifeguardId(excludeId)) return false
  return true
}

async function getVerificationEntry(db, email) {
  const normalized = normalizeEmail(email)
  const row = await get(
    db,
    `SELECT email, code, verified, expires_at FROM email_verifications
     WHERE email = ? AND purpose = 'signup'`,
    [normalized]
  )
  if (!row) return null
  if (Date.now() > row.expires_at) {
    await run(
      db,
      `DELETE FROM email_verifications WHERE email = ? AND purpose = 'signup'`,
      [normalized]
    )
    return null
  }
  return row
}

function registerLifeguardRoutes(app, db, adminRequired) {
  app.get('/api/lifeguards', adminRequired, async (_req, res) => {
    try {
      const guards = await listLifeguards(db)
      res.json({ guards })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load lifeguards' })
    }
  })

  app.post('/api/lifeguards/verify-email/send', adminRequired, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      if (!email) return res.status(400).json({ error: 'Email is required.' })
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' })
      }
      if (await emailTaken(db, email)) {
        return res.status(400).json({ error: 'A lifeguard with this email already exists.' })
      }

      const code = String(Math.floor(100000 + Math.random() * 900000))
      const now = Date.now()
      await run(
        db,
        `INSERT INTO email_verifications (email, purpose, code, verified, expires_at, sent_at)
         VALUES (?, 'signup', ?, 0, ?, ?)
         ON CONFLICT(email, purpose) DO UPDATE SET
           code = excluded.code,
           verified = 0,
           expires_at = excluded.expires_at,
           sent_at = excluded.sent_at`,
        [email, code, now + CODE_TTL_MS, now]
      )

      const sent = await sendVerificationCodeEmail(email, code)
      const payload = { ok: true, message: 'Verification code sent.' }
      if (sent.demo) payload.demoCode = code
      res.json(payload)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err.message || 'Failed to send verification code' })
    }
  })

  app.post('/api/lifeguards/verify-email/confirm', adminRequired, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const code = String(req.body?.code || '').trim()
      if (!email) return res.status(400).json({ error: 'Email is required.' })
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Enter the 6-digit verification code.' })
      }

      const entry = await getVerificationEntry(db, email)
      if (!entry) {
        return res.status(400).json({ error: 'No active verification code. Send a new one.' })
      }
      if (entry.code !== code) {
        return res.status(400).json({ error: 'Incorrect verification code.' })
      }

      await run(
        db,
        `UPDATE email_verifications SET verified = 1 WHERE email = ? AND purpose = 'signup'`,
        [email]
      )
      res.json({ ok: true, message: 'Email verified.' })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to verify email' })
    }
  })

  app.get('/api/lifeguards/verify-email/status', adminRequired, async (req, res) => {
    try {
      const email = normalizeEmail(req.query.email)
      const entry = await getVerificationEntry(db, email)
      res.json({ verified: Boolean(entry?.verified) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to check verification status' })
    }
  })

  app.post('/api/lifeguards/welcome-email', adminRequired, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const name = String(req.body?.name || '').trim()
      const tempPassword = String(req.body?.tempPassword || '')
      if (!email || !tempPassword) {
        return res.status(400).json({ error: 'Email and temporary password are required.' })
      }

      const sent = await sendWelcomeEmail({ to: email, name, tempPassword })
      res.json({ ok: true, message: 'Welcome email sent.', demo: Boolean(sent.demo) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err.message || 'Failed to send welcome email' })
    }
  })

  app.post('/api/lifeguards', adminRequired, async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim()
      const email = normalizeEmail(req.body?.email)
      const phone = String(req.body?.phone || '').trim()
      const role = String(req.body?.role || 'Lifeguard').trim()
      const assignedZones = Array.isArray(req.body?.assignedZones) ? req.body.assignedZones : []
      const tempPassword = String(req.body?.tempPassword || '')
      const photoUri = req.body?.photoUri || null

      if (!name) return res.status(400).json({ error: 'Name is required.' })
      if (!email) return res.status(400).json({ error: 'Email is required.' })
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' })
      }
      if (await emailTaken(db, email)) {
        return res.status(400).json({ error: 'A lifeguard with this email already exists.' })
      }

      const verification = await getVerificationEntry(db, email)
      if (!verification?.verified) {
        return res.status(400).json({ error: 'Verify the email address before creating an account.' })
      }

      const passwordCheck = validatePassword(tempPassword)
      if (!passwordCheck.ok) return res.status(400).json(passwordCheck)

      const passwordHash = await bcrypt.hash(tempPassword, 10)
      const result = await run(
        db,
        `INSERT INTO users (
          email, password_hash, name, role, lifeguard_role, phone,
          assigned_zones, certifications, status, must_change_password,
          photo_uri, mobile_app_status
        ) VALUES (?, ?, ?, 'lifeguard', ?, ?, ?, ?, 'active', 1, ?, 'disconnected')`,
        [
          email,
          passwordHash,
          name,
          role,
          phone,
          JSON.stringify(assignedZones),
          JSON.stringify(['Lifeguard']),
          photoUri,
        ]
      )

      await run(
        db,
        `DELETE FROM email_verifications WHERE email = ? AND purpose = 'signup'`,
        [email]
      )

      const row = await get(db, 'SELECT * FROM users WHERE id = ?', [result.lastID])
      res.status(201).json({ ok: true, guard: rowToGuard(row) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to create lifeguard' })
    }
  })

  app.patch('/api/lifeguards/:id', adminRequired, async (req, res) => {
    try {
      const current = await getLifeguardById(db, req.params.id)
      if (!current) return res.status(404).json({ error: 'Lifeguard not found.' })

      const name = String(req.body?.name ?? current.name).trim()
      const email = normalizeEmail(req.body?.email ?? current.email)
      const phone = String(req.body?.phone ?? current.phone ?? '').trim()
      const role = String(req.body?.role ?? current.lifeguard_role ?? 'Lifeguard').trim()
      const assignedZones = Array.isArray(req.body?.assignedZones)
        ? req.body.assignedZones
        : parseJson(current.assigned_zones, [])
      const photoUri = req.body?.photoUri !== undefined ? req.body.photoUri : current.photo_uri
      let status = req.body?.status ?? current.status
      if (status === 'inactive') status = 'archived'

      if (!name) return res.status(400).json({ error: 'Name is required.' })
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' })
      }
      if (await emailTaken(db, email, req.params.id)) {
        return res.status(400).json({ error: 'A lifeguard with this email already exists.' })
      }

      await run(
        db,
        `UPDATE users SET
          name = ?, email = ?, phone = ?, lifeguard_role = ?,
          assigned_zones = ?, photo_uri = ?, status = ?
         WHERE id = ? AND role = 'lifeguard'`,
        [
          name,
          email,
          phone,
          role,
          JSON.stringify(assignedZones),
          photoUri,
          status,
          current.id,
        ]
      )

      const row = await get(db, 'SELECT * FROM users WHERE id = ?', [current.id])
      res.json({ ok: true, guard: rowToGuard(row) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to update lifeguard' })
    }
  })

  app.post('/api/lifeguards/:id/archive', adminRequired, async (req, res) => {
    try {
      const current = await getLifeguardById(db, req.params.id)
      if (!current) return res.status(404).json({ error: 'Lifeguard not found.' })

      await run(
        db,
        `UPDATE users SET status = 'archived' WHERE id = ? AND role = 'lifeguard'`,
        [current.id]
      )

      const row = await get(db, 'SELECT * FROM users WHERE id = ?', [current.id])
      res.json({ ok: true, guard: rowToGuard(row) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to archive lifeguard' })
    }
  })

  app.post('/api/lifeguards/:id/restore', adminRequired, async (req, res) => {
    try {
      const current = await getLifeguardById(db, req.params.id)
      if (!current) return res.status(404).json({ error: 'Lifeguard not found.' })

      await run(
        db,
        `UPDATE users SET status = 'active' WHERE id = ? AND role = 'lifeguard'`,
        [current.id]
      )

      const row = await get(db, 'SELECT * FROM users WHERE id = ?', [current.id])
      res.json({ ok: true, guard: rowToGuard(row) })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to restore lifeguard' })
    }
  })
}

module.exports = {
  registerLifeguardRoutes,
  rowToGuard,
  rowToMobileUser,
  getLifeguardByEmail,
  getLifeguardById,
  lifeguardId,
}
