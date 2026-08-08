import { Modal } from '../ui/Modal'
import CameraFeedIllustration from '../camera/CameraFeedIllustration'
import './SnapshotModal.css'

export default function SnapshotModal({ event, onClose }) {
  if (!event) return null

  return (
    <Modal isOpen={!!event} onClose={onClose} title={event.title} size="md">
      <div className="snapshot-modal-body">
        <div className="snapshot-frame">
          <CameraFeedIllustration />
        </div>
        <div className="snapshot-meta-grid">
          <div className="snapshot-meta-row">
            <span className="k">Camera</span>
            <span className="v">{event.camera}</span>
          </div>
          <div className="snapshot-meta-row">
            <span className="k">Timestamp</span>
            <span className="v">{event.date}, {event.time}</span>
          </div>
          <div className="snapshot-meta-row">
            <span className="k">Confidence</span>
            <span className="v">{event.confidence ?? '—'}</span>
          </div>
          <div className="snapshot-meta-row">
            <span className="k">Status</span>
            <span className="v">{event.status}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
