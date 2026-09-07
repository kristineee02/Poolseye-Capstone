import { useCallback, useEffect } from 'react'
import AlertBar from '../components/layout/AlertBar'
import CameraPanel from '../components/camera/CameraPanel'
import LiveEventLogPanel from '../components/history/LiveEventLogPanel'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { cameras } from '../data/cameras'
import { STREAM_BASE } from '../config'
import './LiveMonitoringPage.css'
import { Icon } from '../components/ui/Icon'

// Single-pool deployment: one CCTV covers the main pool
const POOL_CAMERA = cameras[0]

export default function LiveMonitoringPage() {
  const { toasts, addToast, removeToast } = useToast()

  const handleNewAlert = useCallback(
    (evt) => {
      const tone = evt.type === 'alarm' ? 'error' : evt.type === 'warn' ? 'warning' : 'info'
      addToast(`${evt.title} — ${evt.meta}`, tone)
    },
    [addToast],
  )

  useEffect(() => {
    // Soft reminder if stream server is not up yet (non-blocking)
    const timeout = setTimeout(() => {
      fetch(`${STREAM_BASE}/health`, { cache: 'no-store' }).catch(() => {
        addToast('CCTV event feed offline — start scripts/live_server.py', 'warning')
      })
    }, 2500)
    return () => clearTimeout(timeout)
  }, [addToast])

  return (
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <AlertBar />

      <div className="pagehead">
        <div>
          <h1>Live monitoring</h1>
          <div className="sub">
            Main Pool · live CCTV
          </div>
        </div>
        <div className="pagehead-right">
          <button
            className="chip-btn"
            type="button"
            onClick={() => window.open(`${STREAM_BASE}/events`, '_blank')}
          >
            <Icon.Refresh /> Events API
          </button>
        </div>
      </div>

      <div className="live-camera-header">
        <div>
          <span className="live-cam-name">{POOL_CAMERA.name}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {POOL_CAMERA.status === 'online' && <span className="live-pill">● LIVE</span>}
        </div>
      </div>

      <CameraPanel />

      <LiveEventLogPanel onNewAlert={handleNewAlert} />
    </div>
  )
}
