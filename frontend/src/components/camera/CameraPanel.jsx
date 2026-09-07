import { useEffect, useState } from 'react'
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
  const [streamOnline, setStreamOnline] = useState(true)
  const streamSrc = `${STREAM_BASE}/stream`

  useEffect(() => {
    if (compact) return undefined
    let cancelled = false

    const check = () => {
      fetch(`${STREAM_BASE}/health`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (!cancelled) setStreamOnline(Boolean(data?.has_frame ?? data?.ok))
        })
        .catch(() => {
          if (!cancelled) setStreamOnline(false)
        })
    }

    check()
    const id = setInterval(check, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [compact])

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
        <div className={`live-tag${!streamOnline ? ' is-offline' : ''}`}>
          <span className="dot" />
          {streamOnline ? 'LIVE' : 'OFFLINE'}
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

      <div className="camera-stage">
        {streamOnline ? (
          <img
            className="camera-stage-feed"
            src={streamSrc}
            alt="Main Pool CCTV"
            onError={() => setStreamOnline(false)}
            onLoad={() => setStreamOnline(true)}
          />
        ) : (
          <div className="camera-stage-offline" role="status">
            <Icon.AlertTriangle />
            <strong>CCTV offline</strong>
            <p>
              Start <code>scripts/live_server.py</code> on the on-site PC, or set{' '}
              <code>VITE_STREAM_URL</code> when hosting online.
            </p>
          </div>
        )}
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
