import CameraFeedIllustration from '../camera/CameraFeedIllustration'

export default function SnapshotModal({ event, onClose }) {
  if (!event) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{event.title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-snapshot">
            <CameraFeedIllustration />
          </div>
          <div className="modal-meta-grid">
            <div className="modal-meta-row"><span className="k">Camera</span><span className="v">{event.camera}</span></div>
            <div className="modal-meta-row"><span className="k">Timestamp</span><span className="v">{event.date}, {event.time}</span></div>
            <div className="modal-meta-row"><span className="k">Confidence</span><span className="v">{event.confidence ?? '—'}</span></div>
            <div className="modal-meta-row"><span className="k">Status</span><span className="v">{event.status}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
