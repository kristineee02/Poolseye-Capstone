const { get, run } = require('./db')

const DEFAULT_CAMERA = 'CAM-01'
const DEFAULT_IP = process.env.CCTV_DEFAULT_IP || '192.168.0.130'
const DEFAULT_RTSP_PORT = 554

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const HOSTNAME_RE = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function validateHost(value) {
  const host = String(value || '').trim()
  if (!host) return { error: 'IP address is required' }
  if (/^[\d.]+$/.test(host)) {
    return IPV4_RE.test(host) ? { host } : { error: 'Enter a valid IPv4 address, e.g. 192.168.0.130' }
  }
  return HOSTNAME_RE.test(host) ? { host } : { error: 'Enter a valid IP address or hostname' }
}

function validatePort(value) {
  if (value === undefined || value === null || value === '') return { port: DEFAULT_RTSP_PORT }
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: 'RTSP port must be a whole number between 1 and 65535' }
  }
  return { port }
}

function toPayload(row) {
  return {
    cameraId: row.camera_id,
    ipAddress: row.ip_address,
    rtspPort: Number(row.rtsp_port),
    revision: Number(row.revision),
    updatedAt: row.updated_at,
  }
}

async function readSettings(db, cameraId = DEFAULT_CAMERA) {
  return get(db, 'SELECT * FROM camera_settings WHERE camera_id = ?', [cameraId])
}

async function seedCameraSettings(db) {
  const existing = await readSettings(db)
  if (existing) return toPayload(existing)
  const now = new Date().toISOString()
  await run(
    db,
    `INSERT INTO camera_settings (camera_id, ip_address, rtsp_port, revision, updated_at)
     VALUES (?, ?, ?, 1, ?)`,
    [DEFAULT_CAMERA, DEFAULT_IP, DEFAULT_RTSP_PORT, now]
  )
  console.log('Default CCTV settings seeded for', DEFAULT_CAMERA)
  return toPayload(await readSettings(db))
}

function registerCameraSettingsRoutes(app, db, adminRequired) {
  // Public read: the stream server polls this to know which camera IP to connect to.
  // RTSP credentials are never stored here; they stay in scripts/config.json.
  app.get('/api/camera-settings', async (_req, res) => {
    try {
      const row = await readSettings(db)
      if (!row) return res.status(404).json({ error: 'Camera settings not found' })
      res.json(toPayload(row))
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load camera settings' })
    }
  })

  app.put('/api/camera-settings', adminRequired, async (req, res) => {
    const { host, error: hostError } = validateHost(req.body?.ipAddress)
    if (hostError) return res.status(400).json({ error: hostError })
    const { port, error: portError } = validatePort(req.body?.rtspPort)
    if (portError) return res.status(400).json({ error: portError })

    try {
      const now = new Date().toISOString()
      await run(
        db,
        `INSERT INTO camera_settings (camera_id, ip_address, rtsp_port, revision, updated_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(camera_id) DO UPDATE SET
           ip_address = excluded.ip_address,
           rtsp_port = excluded.rtsp_port,
           revision = camera_settings.revision + 1,
           updated_at = excluded.updated_at`,
        [DEFAULT_CAMERA, host, port, now]
      )
      res.json(toPayload(await readSettings(db)))
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to save camera settings' })
    }
  })
}

module.exports = { registerCameraSettingsRoutes, seedCameraSettings }
