import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import CameraFeedIllustration from './CameraFeedIllustration'
import GeofenceOverlay from '../geofence/GeofenceOverlay'
import { telemetry } from '../../data/site'
import { ZONE_TYPES } from '../../data/geofence'
import { useGeofence } from '../../context/GeofenceContext'
import { STREAM_BASE } from '../../config'
import './CameraPanel.css'

export default function CameraPanel({ compact = false }) {
  const { zones, dirty, updatedAt } = useGeofence()
  const [streamStatus, setStreamStatus] = useState('connecting')
  const [reconnectToken, setReconnectToken] = useState(0)
  const streamSrc = `${STREAM_BASE}/stream`
  const online = streamStatus === 'online'

  const checkStream = useCallback(() => {
    fetch(`${STREAM_BASE}/health`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setStreamStatus(data?.has_frame ? 'online' : 'offline')
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
        <div className={`live-tag${streamStatus !== 'online' ? ' is-offline' : ''}`}>
          <span className="dot" />
          {streamStatus === 'online' ? 'LIVE' : streamStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
        </div>
        <div className="name">Main Pool — CCTV</div>
        <div className="id">CAM-01 · OV9281 · single feed</div>
        <div className="camera-head-right">
          <div className="telemetry-inline">
            <div className="t-item">FPS <span>{telemetry.fps}</span></div>
            <div className="t-item">Latency <span>{telemetry.latencyMs}ms</span></div>
            <div className="t-item">Conf <span>{telemetry.confidence}</span></div>
          </div>
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
        {online ? (
          <>
            <svg
              className="camera-geofence-overlay"
              viewBox="0 0 1000 512"
              preserveAspectRatio="xMidYMid slice"
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
            Adult — supervised
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#B6790A' }} />
            Child — tracked
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
          <button className="ctrl-btn" title="Zoom"><Icon.Search /></button>
          <button className="ctrl-btn" title="Play"><Icon.Aperture /></button>
          <button className="ctrl-btn" title="Fullscreen"><Icon.Grid /></button>
        </div>
      </div>
    </div>
  )
}
