import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { mediaUrl } from '../../config'
import { eventKind } from './eventKinds'
import './EventThumb.css'

export default function EventThumb({ event, kind, size = 'md', onMissing }) {
  const k = kind || eventKind(event)
  const KindIcon = k.icon
  const snapshot = mediaUrl(event?.snapshot_uri)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [snapshot])

  const hasClip = Boolean(event?.clip_uri)
  const playBadge = hasClip && size !== 'fill' ? (
    <span className="event-thumb-play" title="Video recorded"><Icon.Play /></span>
  ) : null
  if (snapshot && !failed) {
    return (
      <div className={`event-thumb event-thumb-${size}`}>
        <img
          src={snapshot}
          alt={event.title || 'Event snapshot'}
          loading="lazy"
          onError={() => {
            setFailed(true)
            onMissing?.()
          }}
        />
        {playBadge}
      </div>
    )
  }
  return (
    <div
      className={`event-thumb event-thumb-${size} kind-${k.id}`}
      aria-hidden={failed ? undefined : 'true'}
      title={failed ? 'Snapshot unavailable' : undefined}
    >
      <span className="event-thumb-water" />
      <Icon.Camera className="event-thumb-cam" />
      <span className="event-thumb-badge"><KindIcon /></span>
      {failed ? <span className="event-thumb-missing">Snapshot unavailable</span> : null}
      {playBadge}
    </div>
  )
}
