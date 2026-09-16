require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { initDb } = require('./db')
const geofence = require('./geofence')
const { registerLifeguardRoutes } = require('./lifeguards')
const { registerMobileAuthRoutes } = require('./mobileAuth')
const { registerMobileEventRoutes } = require('./mobileEvents')
const { registerEventRoutes, seedDemoEvents } = require('./events')
const { registerAdminAuthRoutes } = require('./adminAuth')

const app = express()
const PORT = process.env.PORT || 4000
const HOST = process.env.HOST || '0.0.0.0'

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Using insecure dev default.')
  process.env.JWT_SECRET = 'poolseye-dev-secret-change-me'
}

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (origin.startsWith('http://localhost:')) return true
  if (origin.startsWith('http://127.0.0.1:')) return true
  if (/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return true
  if (/^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)) return true
  if (/^exp:\/\//.test(origin)) return true

  // Production frontends (Vercel, Netlify, custom domain)
  const allowed = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (allowed.includes(origin)) return true

  return false
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '2mb' }))

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

function adminRequired(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' })
    }
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

let db

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
    registerAdminAuthRoutes(app, db)
    registerLifeguardRoutes(app, db, adminRequired)
    registerMobileAuthRoutes(app, db)
    registerMobileEventRoutes(app, db)
    registerEventRoutes(app, db, adminRequired)
    await geofence.seedGeofence(db)
    await seedDemoEvents(db)
    app.listen(PORT, HOST, () => {
      console.log(`Backend running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
      if (HOST === '0.0.0.0') {
        console.log('Mobile devices: use your PC LAN IP, e.g. http://192.168.x.x:' + PORT)
      }
    })
  })
  .catch((err) => {
    console.error('Failed to start backend:', err)
    process.exit(1)
  })
