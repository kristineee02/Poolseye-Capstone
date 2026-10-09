import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import CameraFeedIllustration from './CameraFeedIllustration'
import GeofenceOverlay from '../geofence/GeofenceOverlay'
import { ZONE_TYPES } from '../../data/geofence'
import { useGeofence } from '../../context/GeofenceContext'
import { STREAM_BASE } from '../../config'
import { ACCEPTED_VIDEO_TYPES, returnToLiveFeed, uploadVideo } from '../../api/videoSource'
import { StatusModal, useStatusModal } from '../ui/Modal'
import './CameraPanel.css'

const GEOFENCE_VISIBLE_KEY = 'poolseye.live.showGeofences'
const PROBE_TIMEOUT_MS = 8000
const MIN_RECONNECT_MS = 900
const STREAM_IS_LOCAL = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(STREAM_BASE)

/** Ask live_server.py for its health and classify why the feed is (not) available. */
async function probeStream() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${STREAM_BASE}/health`, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) return { kind: 'http', status: res.status }
    const data = await res.json().catch(() => ({}))
    return { kind: data?.has_frame ? 'ok' : 'no-frame', data }
  } catch (err) {
    return { kind: err?.name === 'AbortError' ? 'timeout' : 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

function reconnectFailure(result) {
  switch (result.kind) {
    case 'timeout':
      return {
        title: 'Stream server is not responding',
        message: `${STREAM_BASE} did not answer within ${PROBE_TIMEOUT_MS / 1000} seconds. The CCTV computer may be busy or its internet connection slow. Try again in a moment.`,
      }
    case 'http':
      return {
        title: `Stream server error (HTTP ${result.status})`,
        message: STREAM_IS_LOCAL
          ? 'live_server.py answered with an error. Check its terminal for messages and restart it.'
          : 'The tunnel answered but live_server.py did not. Make sure live_server.py is still running on the CCTV computer, then try again.',
      }
    case 'no-frame': {
      const host = result.data?.camera_host
      return {
        title: 'Connected, but no camera picture',
        message: `live_server.py is running but is not receiving video from the camera${host ? ` at ${host}` : ''}. Check that the CCTV is powered on and on the same Wi-Fi as the computer, and that the camera IP in Settings is correct.`,
      }
    }
    default:
      return {
        title: 'Could not reach the stream server',
        message: STREAM_IS_LOCAL
          ? `Nothing is answering at ${STREAM_BASE}. Start it on this computer with "python scripts/live_server.py", then try again.`
          : `Nothing is answering at ${STREAM_BASE}. Make sure live_server.py and the Cloudflare tunnel are running on the CCTV computer. Quick-tunnel addresses change every restart, so the site's VITE_STREAM_URL may need the new address.`,
      }
  }
}

function readGeofenceVisible() {
  try {
    return localStorage.getItem(GEOFENCE_VISIBLE_KEY) !== 'false'
  } catch {
    return true
  }
}

const CameraPanel = forwardRef(function CameraPanel({ compact = false, onNotify, onUploadingChange }, ref) {
  const { zones, dirty, updatedAt } = useGeofence()
  const [showGeofences, setShowGeofences] = useState(readGeofenceVisible)
  const [streamStatus, setStreamStatus] = useState('connecting')
  const [serverUp, setServerUp] = useState(false)
  const [reconnectToken, setReconnectToken] = useState(0)
  const [source, setSource] = useState(null)
  const [videoName, setVideoName] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [switchingToLive, setSwitchingToLive] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const { status: failure, showStatus: showFailure, closeStatus: closeFailure } = useStatusModal()
  const fileInputRef = useRef(null)
  const streamSrc = `${STREAM_BASE}/stream`
  const online = streamStatus === 'online'
  const playingVideo = source === 'video'
  const uploading = uploadProgress !== null

  useImperativeHandle(ref, () => ({
    openUpload: () => {
      if (!serverUp) {
        onNotify?.(
          `Stream server not reachable at ${STREAM_BASE}. Run "python scripts/live_server.py" first, then upload again.`,
          'error',
        )
        return
      }
      fileInputRef.current?.click()
    },
  }), [serverUp, onNotify])

  useEffect(() => {
    onUploadingChange?.(uploading || switchingToLive)
  }, [uploading, switchingToLive, onUploadingChange])

  const applyProbe = useCallback((result) => {
    const reachable = result.kind === 'ok' || result.kind === 'no-frame'
    setServerUp(reachable)
    setStreamStatus(result.kind === 'ok' ? 'online' : 'offline')
    if (reachable) {
      setSource(result.data?.source || null)
      setVideoName(result.data?.video_name || null)
    }
  }, [])

  const checkStream = useCallback(() => {
    probeStream().then(applyProbe)
  }, [applyProbe])

  useEffect(() => {
    if (compact || reconnecting) return undefined
    checkStream()
    const id = setInterval(checkStream, 5000)
    return () => clearInterval(id)
  }, [compact, checkStream, reconnectToken, reconnecting])

  const reconnect = () => {
    setStreamStatus('connecting')
    setReconnectToken((n) => n + 1)
  }

  const manualReconnect = async () => {
    if (reconnecting) return
    setReconnecting(true)
    setStreamStatus('connecting')
    const started = Date.now()
    const result = await probeStream()
    const remaining = MIN_RECONNECT_MS - (Date.now() - started)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
    applyProbe(result)
    setReconnecting(false)
    setReconnectToken((n) => n + 1)
    if (result.kind !== 'ok') showFailure({ tone: 'error', ...reconnectFailure(result) })
  }

  const onVideoSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadProgress(0)
    const result = await uploadVideo(file, setUploadProgress)
    setUploadProgress(null)
    if (!result.ok) {
      onNotify?.(result.error || 'Video upload failed.', 'error')
      return
    }
    setSource('video')
    setVideoName(result.video_name || file.name)
    onNotify?.(`Playing ${result.video_name || file.name} with detection — alerts are tagged as uploaded video`, 'info')
    setTimeout(reconnect, 1500)
  }

  const backToLive = async () => {
    setSwitchingToLive(true)
    const result = await returnToLiveFeed()
    setSwitchingToLive(false)
    if (!result.ok) {
      onNotify?.(result.error || 'Could not switch back to live CCTV.', 'error')
      return
    }
    setSource(null)
    setVideoName(null)
    onNotify?.('Switched back to live CCTV', 'info')
    setTimeout(reconnect, 1500)
  }

  const toggleGeofences = () => {
    setShowGeofences((prev) => {
      const next = !prev
      try {
        localStorage.setItem(GEOFENCE_VISIBLE_KEY, String(next))
      } catch {
        // storage unavailable (private mode); keep in-memory state only
      }
      return next
    })
  }

  if (compact) {
    return (
      <div className="camera-panel camera-panel-compact">
        <div className="camera-stage" style={{ maxHeight: 120 }}>
          <CameraFeedIllustration zones={zones} />
        </div>
      </div>
    )
  }

  return (
    <div className="camera-panel">
      <StatusModal status={failure} onClose={closeFailure} />
      <div className="camera-head">
        <div
          className={`live-tag${streamStatus !== 'online' ? ' is-offline' : ''}${playingVideo && online ? ' is-video' : ''}`}
        >
          <span className="dot" />
          {streamStatus === 'online'
            ? (playingVideo ? 'VIDEO' : 'LIVE')
            : streamStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
        </div>
        {playingVideo ? (
          <>
            <div className="name camera-video-name" title={videoName || ''}>
              Uploaded video — {videoName || 'video'}
            </div>
            <div className="id">Detection running · alerts tagged UPLOAD</div>
          </>
        ) : (
          <>
            <div className="name">Main Pool — CCTV</div>
            <div className="id">CAM-01 · OV9281 · single feed</div>
          </>
        )}
        <div className="camera-head-right">
          {uploading ? <span className="t-pill">Uploading <b>{uploadProgress}%</b></span> : null}
          {playingVideo ? (
            <button
              type="button"
              className="ctrl-btn ctrl-btn-labeled"
              onClick={backToLive}
              disabled={switchingToLive || uploading}
            >
              <Icon.Camera />
              {switchingToLive ? 'Switching…' : 'Back to live CCTV'}
            </button>
          ) : null}
          <button
            type="button"
            className={`ctrl-btn${reconnecting ? ' is-spinning' : ''}`}
            onClick={manualReconnect}
            disabled={reconnecting}
            title={reconnecting ? 'Reconnecting…' : 'Reconnect feed'}
            aria-label={reconnecting ? 'Reconnecting' : 'Reconnect feed'}
          >
            <Icon.Refresh />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_VIDEO_TYPES}
            className="camera-video-input"
            onChange={onVideoSelected}
          />
        </div>
      </div>

      <div className={`camera-stage${online ? '' : ' is-offline'}`}>
        {online ? (
          <img
            key={reconnectToken}
            className="camera-stage-feed"
            src={streamSrc}
            alt="Main Pool CCTV"
            onError={() => setStreamStatus('offline')}
            onLoad={() => setStreamStatus('online')}
          />
        ) : reconnecting ? null : (
          <div className="camera-stage-offline" role="status">
            <Icon.VideoOff />
            <p className="feed-unavailable-copy">
              <strong>FEED UNAVAILABLE</strong>
              <span> — Please check connection.</span>
            </p>
            <button type="button" className="feed-reconnect" onClick={manualReconnect}>
              Reconnect
            </button>
          </div>
        )}
        {reconnecting ? (
          <div className="camera-stage-loading" role="status" aria-live="polite">
            <span className="feed-spinner" aria-hidden="true" />
            <p>Reconnecting to the CCTV feed…</p>
          </div>
        ) : null}
        {online && showGeofences ? (
          <>
            <svg
              className="camera-geofence-overlay"
              viewBox="0 0 1000 512"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <GeofenceOverlay zones={zones} />
            </svg>
            <div className={`geofence-sync-chip ${dirty ? 'is-live' : ''}`}>
              {dirty ? 'Geofence live preview' : 'Geofence synced'}
              {updatedAt && !dirty ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ''}
            </div>
          </>
        ) : null}
      </div>

      <div className="camera-footbar">
        <div className="legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#1B9C6E' }} />
            Supervised
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#D6364A' }} />
            Unsupervised
          </span>
          {Object.values(ZONE_TYPES).map((t) => (
            <span className="legend-item" key={t.id}>
              <span
                className={`legend-swatch ${t.geometry === 'polyline' ? 'legend-swatch-line' : ''}`}
                style={{ background: t.color }}
              />
              {t.label}
            </span>
          ))}
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#D6364A' }} />
            Proximity exceeded
          </span>
        </div>
        <div className="camera-controls">
          <button
            type="button"
            className={`ctrl-btn ctrl-btn-labeled${showGeofences ? ' is-active' : ''}`}
            onClick={toggleGeofences}
            aria-pressed={showGeofences}
            title={showGeofences ? 'Hide geofence overlay' : 'Show geofence overlay'}
          >
            {showGeofences ? <Icon.Eye /> : <Icon.EyeOff />}
            {showGeofences ? 'Hide geofences' : 'Show geofences'}
          </button>
        </div>
      </div>
    </div>
  )
})

export default CameraPanel
