import { Icon } from '../ui/Icon'
import { mediaUrl } from '../../config'
import { eventKind } from './eventKinds'
import './EventThumb.css'

export default function EventThumb({ event, kind, size = 'md' }) {
  const k = kind || eventKind(event)
  const KindIcon = k.icon
  const snapshot = mediaUrl(event?.snapshot_uri)
  if (snapshot) {
    return (
      <div className={`event-thumb event-thumb-${size}`}>
        <img src={snapshot} alt={event.title || 'Event snapshot'} loading="lazy" />
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
