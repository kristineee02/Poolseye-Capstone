import { Icon } from '../ui/Icon'
import EventThumb from './EventThumb'
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

export default function EventRow({ event, showStatus = true, onOpen }) {
  const RowIcon = ICONS[event.type] || Icon.Clock
  const openable = Boolean(onOpen && event.snapshot_uri)

  const content = (
    <>
      {event.snapshot_uri ? (
        <EventThumb event={event} size="sm" />
      ) : (
        <div className={`event-icon ${event.type}`}>
          <RowIcon />
        </div>
      )}
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
    </>
  )

  if (openable) {
    return (
      <button
        type="button"
        className="event-row is-openable"
        onClick={() => onOpen(event)}
        title={event.clip_uri ? 'Play the clip for this alert' : 'View the snapshot for this alert'}
      >
        {content}
      </button>
    )
  }
  return <div className="event-row">{content}</div>
}
