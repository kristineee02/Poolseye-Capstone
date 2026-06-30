import { Icon } from '../ui/Icon'
import './EventRow.css'

const ICONS = {
  alarm: Icon.AlertTriangle,
  warn: Icon.AlertTriangle,
  safe: Icon.Check,
  info: Icon.Clock,
}

const STATUS_TAG = {
  resolved: 'tag-safe',
  pending: 'tag-warn',
  dismissed: 'tag-info',
}

export default function EventRow({ event, showStatus = true }) {
  const RowIcon = ICONS[event.type] || Icon.Clock

  return (
    <div className="event-row">
      <div className={`event-icon ${event.type}`}>
        <RowIcon />
      </div>
      <div className="event-body">
        <div className="title">{event.title}</div>
        <div className="meta">{event.meta}</div>
      </div>
      <div className="event-time">{event.time}</div>
      {showStatus && (
        <span className={`tag ${STATUS_TAG[event.status]}`}>
          {event.status[0].toUpperCase() + event.status.slice(1)}
        </span>
      )}
    </div>
  )
}
