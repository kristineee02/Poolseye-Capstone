import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import CameraFeedIllustration from './CameraFeedIllustration'
import GeofenceOverlay from '../geofence/GeofenceOverlay'
import { telemetry } from '../../data/site'
import { ZONE_TYPES } from '../../data/geofence'
import { useGeofence } from '../../context/GeofenceContext'
import { STREAM_BASE } from '../../config'
import { ACCEPTED_VIDEO_TYPES, returnToLiveFeed, uploadVideo } from '../../api/videoSource'
import './CameraPanel.css'

const GEOFENCE_VISIBLE_KEY = 'poolseye.live.showGeofences'

function readGeofenceVisible() {
  try {
    return localStorage.getItem(GEOFENCE_VISIBLE_KEY) !== 'false'
  } catch {
    return true
  }
}

export default function CameraPanel({ compact = false, onNotify }) {
  const { zones, dirty, updatedAt } = useGeofence()
  const [showGeofences, setShowGeofences] = useState(readGeofenceVisible)
  const [streamStatus, setStreamStatus] = useState('connecting')
  const [reconnectToken, setReconnectToken] = useState(0)
  const [source, setSource] = useState(null)
  const [videoName, setVideoName] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [switchingToLive, setSwitchingToLive] = useState(false)
  const fileInputRef = useRef(null)
  const streamSrc = `${STREAM_BASE}/stream`
  const online = streamStatus === 'online'
  const playingVideo = source === 'video'
  const uploading = uploadProgress !== null

  const checkStream = useCallback(() => {
    fetch(`${STREAM_BASE}/health`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setStreamStatus(data?.has_frame ? 'online' : 'offline')
        setSource(data?.source || null)
        setVideoName(data?.video_name || null)
      })
      .catch(() => {
        setStreamStatus('offline')
      })
  }, [])

  useEffect(() => {
    if (compact) return undefined
    checkStream()
    const id = setInterval(checkStream, 5000)
    return () => clearInterval(id)
  }, [compact, checkStream, reconnectToken])

  const reconnect = () => {
    setStreamStatus('connecting')
    setReconnectToken((n) => n + 1)
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
          {!playingVideo ? (
            <div className="telemetry-inline">
              <div className="t-item">FPS <span>{telemetry.fps}</span></div>
              <div className="t-item">Latency <span>{telemetry.latencyMs}ms</span></div>
              <div className="t-item">Conf <span>{telemetry.confidence}</span></div>
            </div>
          ) : null}
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
            className="ctrl-btn ctrl-btn-labeled"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || switchingToLive}
            title="Upload a video to run through detection in place of the CCTV feed"
          >
            <Icon.Download style={{ transform: 'rotate(180deg)' }} />
            {uploading ? `Uploading ${uploadProgress}%` : playingVideo ? 'Replace video' : 'Upload video'}
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
            className="camera-stage-feed"
            src={streamSrc}
            alt="Main Pool CCTV"
            onError={() => setStreamStatus('offline')}
            onLoad={() => setStreamStatus('online')}
          />
        ) : (
          <div className="camera-stage-offline" role="status">
            <Icon.VideoOff />
            <p className="feed-unavailable-copy">
              <strong>FEED UNAVAILABLE</strong>
              <span> — Please check connection.</span>
            </p>
            <button
              type="button"
              className="feed-reconnect"
              onClick={reconnect}
              disabled={streamStatus === 'connecting'}
            >
              {streamStatus === 'connecting' ? 'Reconnecting…' : 'Reconnect'}
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
}
