import { useEffect, useRef, useState } from 'react'
import CameraPanel from '../components/camera/CameraPanel'
import LiveEventLogPanel from '../components/history/LiveEventLogPanel'
import RightRail from '../components/layout/RightRail'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { StatusModal, useStatusModal } from '../components/ui/Modal'
import { STREAM_BASE } from '../config'
import './LiveMonitoringPage.css'
import { Icon } from '../components/ui/Icon'

const OFFLINE_NOTICE_KEY = 'poolseye.live.offlineNoticeShown'

function offlineNoticeShown() {
  try {
    return sessionStorage.getItem(OFFLINE_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function setOfflineNoticeShown(shown) {
  try {
    if (shown) sessionStorage.setItem(OFFLINE_NOTICE_KEY, '1')
    else sessionStorage.removeItem(OFFLINE_NOTICE_KEY)
  } catch {
    // storage unavailable (private mode); the notice may show again next visit
  }
}

export default function LiveMonitoringPage({ onNavigate }) {
  const { toasts, addToast, removeToast } = useToast()
  const { status, showStatus, closeStatus } = useStatusModal()
  const cameraRef = useRef(null)
  const [cameraBusy, setCameraBusy] = useState(false)

  useEffect(() => {
    // Shown once per browser session; reset when the stream server is reachable again
    const timeout = setTimeout(() => {
      fetch(`${STREAM_BASE}/health`, { cache: 'no-store' })
        .then((res) => {
          if (res.ok) setOfflineNoticeShown(false)
        })
        .catch(() => {
          if (offlineNoticeShown()) return
          setOfflineNoticeShown(true)
          showStatus({
            tone: 'warning',
            title: 'CCTV feed offline',
            message: `Cannot reach the stream server at ${STREAM_BASE}. Start live_server.py (and the Cloudflare tunnel for the hosted site) on the CCTV computer, then reload this page.`,
          })
        })
    }, 2500)
    return () => clearTimeout(timeout)
  }, [showStatus])

  return (
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <StatusModal status={status} onClose={closeStatus} />

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
