import { Icon } from '../ui/Icon'
import { eventKind } from './eventKinds'
import './EventThumb.css'

export default function EventThumb({ event, kind, size = 'md' }) {
  const k = kind || eventKind(event)
  const KindIcon = k.icon
  if (event?.snapshot_uri) {
    return (
      <div className={`event-thumb event-thumb-${size}`}>
        <img src={event.snapshot_uri} alt={event.title || 'Event snapshot'} />
      </div>
    )
  }
  return (
    <div className={`event-thumb event-thumb-${size} kind-${k.id}`} aria-hidden="true">
      <span className="event-thumb-water" />
      <Icon.Camera className="event-thumb-cam" />
      <span className="event-thumb-badge"><KindIcon /></span>
    </div>
  )
}
