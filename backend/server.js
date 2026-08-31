require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { initDb, get } = require('./db')
const geofence = require('./geofence')

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '1mb' }))

function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

let db

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const user = await get(
      db,
      'SELECT id, email, password_hash, name, role FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    )

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        initials: initials(user.name),
        role: user.role,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await get(
      db,
      'SELECT id, email, name, role FROM users WHERE id = ?',
      [payload.id]
    )
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        initials: initials(user.name),
        role: user.role,
      },
    })
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
})

app.get('/api/geofence', async (_req, res) => {
  try {
    const payload = await geofence.readLayout(db, geofence.DEFAULT_CAMERA)
    if (!payload) return res.status(404).json({ error: 'Geofence layout not found' })
    res.json(payload)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load geofence' })
  }
})

app.get('/api/geofence/live', (_req, res) => {
  const payload = geofence.getLiveState()
  if (!payload) return res.status(404).json({ error: 'Geofence layout not found' })
  res.json(payload)
})

app.get('/api/geofence/stream', (req, res) => {
  const origin = req.headers.origin
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const current = geofence.getLiveState()
  if (current) res.write(`data: ${JSON.stringify(current)}\n\n`)

  const remove = geofence.addSseClient(res)
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n') } catch { /* closed */ }
  }, 15000)

  req.on('close', () => {
    clearInterval(heartbeat)
    remove()
  })
})

app.put('/api/geofence/live', authRequired, async (req, res) => {
  try {
    const cameraId = String(req.body?.cameraId || geofence.DEFAULT_CAMERA)
    const payload = await geofence.writeLayout(db, cameraId, req.body?.zones, { persist: false })
    payload.clientId = req.body?.clientId || null
    geofence.setLiveState(payload)
    geofence.broadcast(payload)
    res.json(payload)
  } catch (err) {
    const status = err.status || 500
    if (status === 500) console.error(err)
    res.status(status).json({ error: err.message || 'Failed to update live geofence' })
  }
})

app.put('/api/geofence', authRequired, async (req, res) => {
  try {
    const cameraId = String(req.body?.cameraId || geofence.DEFAULT_CAMERA)
    const payload = await geofence.writeLayout(db, cameraId, req.body?.zones, { persist: true })
    payload.clientId = req.body?.clientId || null
    geofence.setLiveState(payload)
    geofence.broadcast(payload)
    res.json(payload)
  } catch (err) {
    const status = err.status || 500
    if (status === 500) console.error(err)
    res.status(status).json({ error: err.message || 'Failed to save geofence' })
  }
})

initDb()
  .then(async (database) => {
    db = database
    await geofence.seedGeofence(db)
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to start backend:', err)
    process.exit(1)
  })