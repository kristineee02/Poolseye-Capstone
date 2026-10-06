import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { ConfirmModal } from '../ui/Modal'
import { fetchCameraSettings, fetchStreamHealth, saveCameraSettings } from '../../api/cameraSettings'

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const HOSTNAME_RE = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function validate(ipAddress, rtspPort) {
  const errors = {}
  const host = ipAddress.trim()
  if (!host) errors.ip = 'IP address is required.'
  else if (/^[\d.]+$/.test(host) ? !IPV4_RE.test(host) : !HOSTNAME_RE.test(host)) {
    errors.ip = 'Enter a valid IP address, e.g. 192.168.0.130.'
  }
  const port = Number(rtspPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.port = 'Port must be between 1 and 65535.'
  }
  return errors
}

function formatUpdated(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function CameraSettingsCard({ showStatus }) {
  const [saved, setSaved] = useState(null)
  const [ipAddress, setIpAddress] = useState('')
  const [rtspPort, setRtspPort] = useState('554')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [health, setHealth] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await fetchCameraSettings()
    setLoading(false)
    if (!result.ok) {
      setLoadError(result.error || 'Could not load camera settings.')
      return
    }
    setLoadError('')
    setSaved(result)
    setIpAddress(result.ipAddress || '')
    setRtspPort(String(result.rtspPort || 554))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      const data = await fetchStreamHealth()
      if (!cancelled) setHealth(data)
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const dirty = saved
    ? ipAddress.trim() !== saved.ipAddress || Number(rtspPort) !== Number(saved.rtspPort)
    : false

  const requestSave = () => {
    const next = validate(ipAddress, rtspPort)
    setErrors(next)
    if (Object.keys(next).length) return
    setConfirmOpen(true)
  }

  const save = async () => {
    setSaving(true)
    const result = await saveCameraSettings({ ipAddress: ipAddress.trim(), rtspPort: Number(rtspPort) })
    setSaving(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Camera not updated', message: result.error || 'Could not save camera settings.' })
      return
    }
    setSaved(result)
    setIpAddress(result.ipAddress)
    setRtspPort(String(result.rtspPort))
    showStatus({
      tone: 'success',
      title: 'Camera updated',
      message: `The stream server will reconnect to ${result.ipAddress}:${result.rtspPort} within a few seconds.`,
    })
  }

  const streamOnline = Boolean(health?.has_frame)
  const connectedHost = health?.camera_host
  const usingWebcam = health?.source === 'webcam'

  let streamLabel = 'Stream server offline'
  if (health?.source === 'video') streamLabel = 'Playing uploaded video (CCTV paused)'
  else if (health && usingWebcam) streamLabel = 'Using laptop webcam (CCTV unreachable)'
  else if (health && streamOnline) streamLabel = `Connected to ${connectedHost || 'camera'}`
  else if (health) streamLabel = `Connecting${connectedHost ? ` to ${connectedHost}` : ''}…`

  return (
    <section className="settings-card settings-camera-card">
      <div className="settings-card-head">
        <div className="settings-card-title">
          <Icon.Camera />
          <h3>CCTV Camera Connection</h3>
        </div>
        <span className={`settings-camera-status ${streamOnline && !usingWebcam ? 'is-online' : 'is-offline'}`}>
          {streamOnline && !usingWebcam ? <Icon.Wifi /> : <Icon.WifiOff />}
          {streamLabel}
        </span>
      </div>

      {loadError ? (
        <div className="settings-camera-error">
          <span>{loadError}</span>
          <button type="button" className="btn-secondary" onClick={load}>Retry</button>
        </div>
      ) : null}

      <div className="settings-fields">
        <label className={`settings-field${errors.ip ? ' is-invalid' : ''}`}>
          <span className="field-label">Camera IP address</span>
          <input
            className="field-input"
            value={ipAddress}
            onChange={(e) => { setIpAddress(e.target.value); setErrors((er) => ({ ...er, ip: '' })) }}
            placeholder="192.168.0.130"
            disabled={loading || saving}
            inputMode="decimal"
            autoComplete="off"
          />
          {errors.ip ? <span className="field-error">{errors.ip}</span> : null}
        </label>

        <label className={`settings-field${errors.port ? ' is-invalid' : ''}`}>
          <span className="field-label">RTSP port</span>
          <input
            className="field-input"
            value={rtspPort}
            onChange={(e) => { setRtspPort(e.target.value.replace(/\D/g, '')); setErrors((er) => ({ ...er, port: '' })) }}
            placeholder="554"
            disabled={loading || saving}
            inputMode="numeric"
            autoComplete="off"
          />
          {errors.port ? <span className="field-error">{errors.port}</span> : null}
        </label>
      </div>

      <p className="settings-camera-note">
        Last updated {formatUpdated(saved?.updatedAt)}. The stream server picks up a new address
        automatically. The camera username, password and stream path stay in{' '}
        <code>scripts/config.json</code> on the camera computer.
      </p>

      <div className="settings-card-actions">
        {dirty ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => {
              setIpAddress(saved.ipAddress)
              setRtspPort(String(saved.rtspPort))
              setErrors({})
            }}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="btn-primary"
          disabled={loading || saving || !dirty}
          onClick={requestSave}
        >
          {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {saving ? 'Saving…' : 'Save camera'}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Change camera address?"
        message={`The live feed will briefly disconnect while the stream server reconnects to ${ipAddress.trim()}:${rtspPort}.`}
        tone="info"
        icon={Icon.Camera}
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={save}
      />
    </section>
  )
}
