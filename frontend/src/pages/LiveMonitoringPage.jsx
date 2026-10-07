import { useEffect, useRef, useState } from 'react'
import CameraPanel from '../components/camera/CameraPanel'
import LiveEventLogPanel from '../components/history/LiveEventLogPanel'
import RightRail from '../components/layout/RightRail'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { STREAM_BASE } from '../config'
import './LiveMonitoringPage.css'
import { Icon } from '../components/ui/Icon'

export default function LiveMonitoringPage({ onNavigate }) {
  const { toasts, addToast, removeToast } = useToast()
  const cameraRef = useRef(null)
  const [cameraBusy, setCameraBusy] = useState(false)

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

      <div className="pagehead live-pagehead">
        <div>
          <h1>Live Monitoring</h1>
          <div className="sub">Main Pool · Live CCTV</div>
        </div>
        <div className="pagehead-right">
          {onNavigate ? (
            <button className="live-head-btn" type="button" onClick={() => onNavigate('history')}>
              <Icon.FileSearch /> Event View
            </button>
          ) : null}
          <button
            className="btn-primary live-head-btn"
            type="button"
            onClick={() => cameraRef.current?.openUpload()}
            disabled={cameraBusy}
            title="Upload a video to run through detection in place of the CCTV feed"
          >
            <Icon.Upload /> Upload Video
          </button>
        </div>
      </div>

      <div className="live-grid">
        <div className="live-main">
          <CameraPanel ref={cameraRef} onNotify={addToast} onUploadingChange={setCameraBusy} />
          <LiveEventLogPanel />
        </div>
        <RightRail onNavigate={onNavigate} />
      </div>
    </div>
  )
}
