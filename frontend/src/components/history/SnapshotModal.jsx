import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ui/Icon'
import EventThumb from './EventThumb'
import { mediaUrl } from '../../config'
import { cameraName, eventKind, handlingNote, isAlertEvent, sourceLabel, zoneLabel, formatDate, formatTime, formatDateTime } from './eventKinds'
import './SnapshotModal.css'

const SPEEDS = [0.5, 1, 1.5, 2]
const SEEK_MARKERS = 6

function clipOf(event) {
  return mediaUrl(event?.clip_uri || event?.video_uri)
}

function extensionOf(url, fallback) {
  const match = /\.([a-z0-9]+)(?:$|\?)/i.exec(url || '')
  return match ? match[1].toLowerCase() : fallback
}

// The `download` attribute is ignored for cross-origin links (Render / Cloudinary), so fetch the file first.
async function downloadFile(url, filename) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const objectUrl = URL.createObjectURL(await res.blob())
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

function statusInfo(event) {
  if (event.status === 'resolved') return { label: 'Acknowledged', tone: 'safe' }
  if (event.status === 'dismissed') return { label: 'Dismissed', tone: 'muted' }
  if (!isAlertEvent(event)) return { label: 'Logged', tone: 'muted' }
  return { label: 'Unacknowledged', tone: 'alarm' }
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '00:00'
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function toggleFullscreen(el) {
  if (!el) return
  if (document.fullscreenElement) document.exitFullscreen?.()
  else el.requestFullscreen?.()
}

function EventPlayer({ event, kind, videoRef, onTime, onDuration }) {
  const frameRef = useRef(null)
  const [clipFailed, setClipFailed] = useState(false)
  const [snapshotFailed, setSnapshotFailed] = useState(false)
  const clip = clipFailed ? null : clipOf(event)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed, videoRef])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const seek = (value) => {
    const v = videoRef.current
    if (v && duration) v.currentTime = (Number(value) / 100) * duration
  }

  const progress = duration ? (time / duration) * 100 : 0

  return (
    <div className="review-player" ref={frameRef}>
      {clip ? (
        <video
          ref={videoRef}
          className="review-player-media"
          src={clip}
          poster={mediaUrl(event.snapshot_uri) || undefined}
          muted={muted}
          autoPlay
          playsInline
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); onTime?.(e.currentTarget.currentTime) }}
          onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); onDuration?.(e.currentTarget.duration) }}
          onError={() => {
            setClipFailed(true)
            setPlaying(false)
            onDuration?.(0)
          }}
        />
      ) : (
        <div className="review-player-media">
          <EventThumb event={event} kind={kind} size="fill" onMissing={() => setSnapshotFailed(true)} />
          {clipFailed ? (
            <div className="review-player-empty">
              <Icon.VideoOff />
              <span>Video no longer available</span>
              <small>The recording for this event was removed or could not be loaded.</small>
            </div>
          ) : snapshotFailed ? (
            <div className="review-player-empty">
              <Icon.VideoOff />
              <span>Snapshot unavailable</span>
              <small>The saved image for this event was removed or could not be loaded.</small>
            </div>
          ) : !event.snapshot_uri ? (
            <div className="review-player-empty">
              <Icon.VideoOff />
              <span>No recording for this event</span>
              <small>Clips are saved automatically for alerts detected on the live feed.</small>
            </div>
          ) : (
            <div className="review-player-note">Snapshot only — no video was saved for this event</div>
          )}
        </div>
      )}

      <div className="review-player-chip">
        <strong>{sourceLabel(event)}</strong>
        <span>{formatDate(event.ts)} · {formatTime(event.ts, true)}</span>
      </div>

      <button
        type="button"
        className="review-player-icon-btn review-player-corner"
        onClick={() => toggleFullscreen(frameRef.current)}
        aria-label="Fullscreen"
      >
        <Icon.Maximize />
      </button>

      {clip ? (
        <div className="review-player-controls">
          <input
            type="range"
            className="review-player-progress"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={(e) => seek(e.target.value)}
            style={{ '--progress': `${progress}%` }}
            aria-label="Seek"
          />
          <div className="review-player-bar">
            <button type="button" className="review-player-icon-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Icon.PauseBars /> : <Icon.Play />}
            </button>
            <button type="button" className="review-player-icon-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <Icon.VolumeOff /> : <Icon.Volume />}
            </button>
            <span className="review-player-time">{formatClock(time)} / {formatClock(duration)}</span>
            <span className="review-player-spacer" />
            <select
              className="review-player-speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              aria-label="Playback speed"
            >
              {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
            </select>
            <button
              type="button"
              className="review-player-icon-btn"
              onClick={() => toggleFullscreen(frameRef.current)}
              aria-label="Fullscreen"
            >
              <Icon.Maximize />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ReviewStrip({ event, events, onSelect, videoRef, duration, time }) {
  const trackRef = useRef(null)
  const clip = clipOf(event)

  const scroll = (dir) => trackRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' })

  useEffect(() => {
    trackRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [event?.id])

  const items = clip && duration
    ? Array.from({ length: SEEK_MARKERS }, (_, i) => {
      const at = (duration * i) / (SEEK_MARKERS - 1)
      return {
        key: `t${i}`,
        label: formatClock(at),
        active: time >= at && (i === SEEK_MARKERS - 1 || time < (duration * (i + 1)) / (SEEK_MARKERS - 1)),
        thumb: event,
        onClick: () => { if (videoRef.current) videoRef.current.currentTime = at },
      }
    })
    : events.map((e) => ({
      key: e.id,
      label: formatTime(e.ts),
      active: e.id === event.id,
      thumb: e,
      onClick: () => onSelect?.(e),
    }))

  if (items.length < 2) return null

  return (
    <div className="review-strip">
      <button type="button" className="review-strip-arrow" onClick={() => scroll(-1)} aria-label="Scroll left">
        <Icon.ChevronLeft />
      </button>
      <div className="review-strip-track" ref={trackRef}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`review-strip-item${item.active ? ' is-active' : ''}`}
            onClick={item.onClick}
          >
            <EventThumb event={item.thumb} size="fill" />
            <span className="review-strip-label">{item.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className="review-strip-arrow" onClick={() => scroll(1)} aria-label="Scroll right">
        <Icon.ChevronRight />
      </button>
    </div>
  )
}

export default function SnapshotModal({
  event,
  events = [],
  onClose,
  onSelect,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}) {
  const videoRef = useRef(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setTime(0)
    setDuration(0)
  }, [event?.id])

  useEffect(() => {
    if (!event) return undefined
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') onClose?.()
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev?.()
      else if (e.key === 'ArrowRight' && hasNext) onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [event, hasPrev, hasNext, onPrev, onNext, onClose])

  if (!event) return null

  const kind = eventKind(event)
  const KindIcon = kind.icon
  const status = statusInfo(event)
  const clip = clipOf(event)
  const download = clip
    ? { href: clip, label: 'Download Video', filename: `poolseye-${event.id}.${extensionOf(clip, 'webm')}` }
    : event.snapshot_uri
      ? {
          href: mediaUrl(event.snapshot_uri),
          label: 'Download Snapshot',
          filename: `poolseye-${event.id}.${extensionOf(event.snapshot_uri, 'jpg')}`,
        }
      : null

  const details = [
    { icon: Icon.Calendar, label: 'Timestamp', value: `${formatDate(event.ts)}   ·   ${formatTime(event.ts, true)}` },
    { icon: Icon.Camera, label: 'Camera', value: cameraName(event) },
    { icon: Icon.MapPin, label: 'Detected in', value: zoneLabel(event) || '—' },
    { icon: Icon.Users, label: 'Person', value: event.person_id != null ? `#${event.person_id}` : '—' },
  ]

  const node = (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="review-head">
          <span className={`review-head-icon kind-${kind.id}`}><Icon.Camera /></span>
          <div className="review-head-text">
            <h2 id="review-modal-title">{event.title}</h2>
            <p>{sourceLabel(event)}</p>
          </div>
          <button type="button" className="review-close" onClick={onClose} aria-label="Close">
            <Icon.X />
          </button>
        </header>

        <div className="review-body">
          <div className="review-media">
            <EventPlayer
              key={event.id}
              event={event}
              kind={kind}
              videoRef={videoRef}
              onTime={setTime}
              onDuration={setDuration}
            />
            <ReviewStrip
              event={event}
              events={events}
              onSelect={onSelect}
              videoRef={videoRef}
              duration={duration}
              time={time}
            />
          </div>

          <aside className="review-details">
            <div className="review-details-head">
              <h3>Event Details</h3>
              <span className={`review-kind kind-${kind.id}`}>
                <KindIcon />
                {kind.label}
              </span>
            </div>
            {details.map((d) => (
              <div key={d.label} className="review-detail-row">
                <d.icon />
                <div>
                  <span className="k">{d.label}</span>
                  <span className="v">{d.value}</span>
                </div>
              </div>
            ))}
            <div className="review-detail-row">
              <Icon.FileText />
              <div>
                <span className="k">Status</span>
                <span className={`review-status tone-${status.tone}`}>{status.label}</span>
                {handlingNote(event) ? <span className="review-detail-note">{handlingNote(event)}</span> : null}
                {event.acknowledged_at ? (
                  <span className="review-detail-note">
                    {event.status === 'dismissed' ? 'Dismissed' : 'Acknowledged'} {formatDateTime(event.acknowledged_at)}
                  </span>
                ) : event.responding_at ? (
                  <span className="review-detail-note">Responding since {formatDateTime(event.responding_at)}</span>
                ) : null}
              </div>
            </div>
          </aside>
        </div>

        <footer className="review-foot">
          {download ? (
            <a
              className="review-btn is-outline"
              href={download.href}
              download={download.filename}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault()
                downloadFile(download.href, download.filename)
              }}
            >
              <Icon.Download />
              {download.label}
            </a>
          ) : (
            <button type="button" className="review-btn is-outline" disabled title="No recording saved for this event yet">
              <Icon.Download />
              Download Video
            </button>
          )}
          <div className="review-foot-nav">
            <button type="button" className="review-btn is-outline" onClick={onPrev} disabled={!hasPrev}>
              <Icon.ArrowLeft />
              Previous Event
            </button>
            <button type="button" className="review-btn is-primary" onClick={onNext} disabled={!hasNext}>
              Next Event
              <Icon.ArrowRight />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') return createPortal(node, document.body)
  return node
}
