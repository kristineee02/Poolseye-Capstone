import { useState, useEffect } from 'react'
import AlertBar from '../components/layout/AlertBar'
import CameraPanel from '../components/camera/CameraPanel'
import EventLogPanel from '../components/history/EventLogPanel'
import { StatusBadge } from '../components/ui/Badge'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { cameras } from '../data/cameras'
import './LiveMonitoringPage.css'
import { Icon } from '../components/ui/Icon'

const LAYOUTS = [
  { id: 'single', label: 'Single',   icon: Icon.Maximize },
  { id: 'grid2',  label: '2×2 Grid', icon: Icon.Layout   },
  { id: 'list',   label: 'List',     icon: Icon.BarChart  },
]

export default function LiveMonitoringPage() {
  const [layout, setLayout] = useState('single')
  const [activeCamera, setActiveCamera] = useState(cameras[0])
  const { toasts, addToast, removeToast } = useToast()

  // Simulate occasional push notifications
  useEffect(() => {
    const timeout = setTimeout(() => {
      addToast('⚠️ Motion detected — South Patio Pool (CAM-01)', 'warning')
    }, 5000)
    return () => clearTimeout(timeout)
  }, [])

  const onlineCameras = cameras.filter((c) => c.status === 'online')

  return (
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <AlertBar />

      <div className="pagehead">
        <div>
          <h1>Live monitoring</h1>
          <div className="sub">
            {onlineCameras.length} of {cameras.length} cameras online · YOLOv8-Nano @ ONNX Runtime
          </div>
        </div>
        <div className="pagehead-right">
          <div className="layout-switcher">
            {LAYOUTS.map(({ id, label, icon: LIcon }) => (
              <button
                key={id}
                className={`layout-btn ${layout === id ? 'active' : ''}`}
                title={label}
                onClick={() => setLayout(id)}
              >
                <LIcon />
              </button>
            ))}
          </div>
          <button className="chip-btn"><Icon.Refresh /> Refresh</button>
          <button className="chip-btn"><Icon.Download /> Export log</button>
        </div>
      </div>

      {/* Camera selector tabs */}
      <div className="camera-selector">
        {cameras.map((cam) => (
          <button
            key={cam.id}
            className={`cam-tab ${activeCamera.id === cam.id ? 'active' : ''} ${cam.status === 'offline' ? 'offline' : ''}`}
            onClick={() => setActiveCamera(cam)}
          >
            <span className={`cam-dot ${cam.status}`} />
            <span className="cam-tab-name">{cam.name}</span>
            <StatusBadge status={cam.status} />
          </button>
        ))}
      </div>

      {/* Single view */}
      {layout === 'single' && (
        <div>
          <div className="live-camera-header">
            <div>
              <span className="live-cam-name">{activeCamera.name}</span>
              <span className="live-cam-meta">
                {activeCamera.ipAddress} · {activeCamera.resolution} · {activeCamera.inferenceFrameRate} FPS inference
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {activeCamera.status === 'online' && <span className="live-pill">● LIVE</span>}
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Uptime: {activeCamera.uptime}
              </span>
            </div>
          </div>
          <CameraPanel />
        </div>
      )}

      {/* 2×2 grid view */}
      {layout === 'grid2' && (
        <div className="camera-grid-2x2">
          {cameras.map((cam) => (
            <div
              key={cam.id}
              className={`camera-grid-cell ${cam.status === 'offline' ? 'offline' : ''}`}
              onClick={() => { setActiveCamera(cam); setLayout('single') }}
            >
              <div className="cgc-header">
                <span className="cgc-name">{cam.name}</span>
                {cam.status === 'online'
                  ? <span className="live-pill small">● LIVE</span>
                  : <span className="offline-pill">OFFLINE</span>}
              </div>
              {cam.status === 'online' ? (
                <CameraPanel compact />
              ) : (
                <div className="camera-offline-placeholder">
                  <Icon.WifiOff />
                  <span>Camera offline</span>
                  <span style={{ fontSize: '11px' }}>
                    Last seen: {new Date(cam.lastHeartbeat).toLocaleTimeString()}
                  </span>
                </div>
              )}
              <div className="cgc-footer">
                <span>{cam.detections.today} detections today</span>
                <span>{cam.zone}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {layout === 'list' && (
        <div className="panel">
          <div className="panel-head"><h3>All cameras — status overview</h3></div>
          <div>
            {cameras.map((cam) => (
              <div
                key={cam.id}
                className="camera-list-row"
                onClick={() => { setActiveCamera(cam); setLayout('single') }}
              >
                <span className={`cam-dot ${cam.status}`} style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{cam.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{cam.location} · {cam.ipAddress}</div>
                </div>
                <StatusBadge status={cam.status} />
                <div style={{ textAlign: 'right', fontSize: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{cam.detections.today}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>today</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {cam.uptime} uptime
                </div>
                <Icon.ChevronRight style={{ width: 16, height: 16, color: 'var(--text-tertiary)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event log only — no KPI row, no hardware panel */}
      <EventLogPanel />
    </div>
  )
}
