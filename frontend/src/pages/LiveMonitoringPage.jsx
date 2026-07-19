import { useEffect } from 'react'
import AlertBar from '../components/layout/AlertBar'
import CameraPanel from '../components/camera/CameraPanel'
import EventLogPanel from '../components/history/EventLogPanel'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { cameras } from '../data/cameras'
import './LiveMonitoringPage.css'
import { Icon } from '../components/ui/Icon'

// Single-pool deployment: one CCTV covers the main pool
const POOL_CAMERA = cameras[0]

export default function LiveMonitoringPage() {
  const { toasts, addToast, removeToast } = useToast()

  useEffect(() => {
    const timeout = setTimeout(() => {
      addToast('⚠️ Motion detected — Main Pool (CAM-01)', 'warning')
    }, 5000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <AlertBar />

      <div className="pagehead">
        <div>
          <h1>Live monitoring</h1>
          <div className="sub">
            Main Pool · 1 CCTV online · YOLOv8-Nano @ ONNX Runtime
          </div>
        </div>
        <div className="pagehead-right">
          <button className="chip-btn"><Icon.Refresh /> Refresh</button>
          <button className="chip-btn"><Icon.Download /> Export log</button>
        </div>
      </div>

      <div className="live-camera-header">
        <div>
          <span className="live-cam-name">{POOL_CAMERA.name}</span>
          <span className="live-cam-meta">
            Main Pool · single CCTV feed
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {POOL_CAMERA.status === 'online' && <span className="live-pill">● LIVE</span>}
        </div>
      </div>

      <CameraPanel />

      <EventLogPanel />
    </div>
  )
}
