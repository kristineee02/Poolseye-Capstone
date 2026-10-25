import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import CameraFeedIllustration from './CameraFeedIllustration'
import GeofenceOverlay from '../geofence/GeofenceOverlay'
import { ZONE_TYPES } from '../../data/geofence'
import { useGeofence } from '../../context/GeofenceContext'
import { STREAM_BASE } from '../../config'
import { ACCEPTED_VIDEO_TYPES, returnToLiveFeed, uploadVideo } from '../../api/videoSource'
import { AlertDialog, StatusModal, useStatusModal } from '../ui/Modal'
import './CameraPanel.css'

const GEOFENCE_VISIBLE_KEY = 'poolseye.live.showGeofences'
const PROBE_TIMEOUT_MS = 8000
const MIN_RECONNECT_MS = 900
const STREAM_IS_LOCAL = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(STREAM_BASE)

/** Ask live_server.py for its health and classify why the feed is (not) available. */
async function probeStream() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'browser-offline' }
  }

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
    case 'browser-offline':
      return {
        title: 'No internet connection',
        message: 'This device appears to be offline. Check your Wi-Fi or network connection, then try reconnecting to the CCTV feed.',
      }
    case 'timeout':
      return {
        title: 'Stream server is not responding',
        message: `The connection took longer than ${PROBE_TIMEOUT_MS / 1000} seconds. Your Wi-Fi may be weak or unstable, or the CCTV computer may be busy. Move closer to the router or check the CCTV network, then try again.`,
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
          ? 'The CCTV service is not responding. Check that this device is connected to the correct Wi-Fi and that the stream server is running, then try again.'
          : 'The CCTV service could not be reached. Possible causes include weak or unstable Wi-Fi, the CCTV computer being offline, or the stream tunnel not running. Check the connection and try again.',
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
  const [uploadFileName, setUploadFileName] = useState('')
  const [switchingToLive, setSwitchingToLive] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const { status, showStatus, closeStatus } = useStatusModal()
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
    if (result.kind === 'ok') {
      showStatus({
        tone: 'success',
        title: 'CCTV feed connected',
        message: 'The live monitoring feed is connected and ready.',
      })
    } else {
      showStatus({ tone: 'error', ...reconnectFailure(result) })
    }
  }

  const onVideoSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadFileName(file.name)
    setUploadProgress(0)
    const result = await uploadVideo(file, setUploadProgress)
    setUploadProgress(null)
    if (!result.ok) {
      showStatus({
        tone: 'error',
        title: 'Video upload failed',
        message: result.error || 'The video could not be uploaded. Please try again.',
      })
      return
    }
    setSource('video')
    setVideoName(result.video_name || file.name)
    showStatus({
      tone: 'success',
      title: 'Video uploaded successfully',
      message: `${result.video_name || file.name} is now playing with AI detection. It will loop continuously until you click “Back to live CCTV”.`,
    })
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
      <AlertDialog
        open={uploading}
        tone="processing"
        title={uploadProgress >= 100 ? 'Preparing video…' : 'Uploading video…'}
        message={uploadFileName || 'Please wait while your video is uploaded.'}
        progress={uploadProgress ?? 0}
      />
      <StatusModal status={status} onClose={closeStatus} />
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
        ) : streamStatus === 'connecting' ? (
          <div className="camera-stage-loading" role="status" aria-live="polite">
            <span className="feed-spinner" aria-hidden="true" />
            <p>{reconnecting ? 'Reconnecting to the CCTV feed…' : 'Connecting to the CCTV feed…'}</p>
            <span className="camera-connection-hint">Please wait while we check the camera connection.</span>
          </div>
        ) : (
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
