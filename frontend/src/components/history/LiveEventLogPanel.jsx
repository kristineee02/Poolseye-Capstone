import { useCallback, useEffect, useRef, useState } from 'react'
import EventRow from './EventRow'
import { Icon } from '../ui/Icon'
import './LiveEventLogPanel.css'

const EVENTS_URL = 'http://localhost:8000/events'
const POLL_MS = 1500
const MAX_VISIBLE = 40

export default function LiveEventLogPanel({ onNewAlert }) {
  const [events, setEvents] = useState([])
  const [online, setOnline] = useState(false)
  const [error, setError] = useState('')
  const [peopleCount, setPeopleCount] = useState(0)
  const seenIds = useRef(new Set())
  const listRef = useRef(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(EVENTS_URL, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const next = Array.isArray(data.events) ? data.events : []
      setOnline(Boolean(data.stream_online ?? data.ok))
      setPeopleCount(Array.isArray(data.people) ? data.people.length : 0)
      setError('')

      // Notify parent of brand-new alert events
      for (const evt of next) {
        if (seenIds.current.has(evt.id)) continue
        seenIds.current.add(evt.id)
        if (evt.is_alert && typeof onNewAlert === 'function') {
          onNewAlert(evt)
        }
      }
      // Cap memory of seen ids
      if (seenIds.current.size > 200) {
        const keep = next.map((e) => e.id)
        seenIds.current = new Set(keep)
      }

      setEvents(next.slice(0, MAX_VISIBLE))
    } catch {
      setOnline(false)
      setError('Live event feed offline — start scripts/live_server.py')
    }
  }, [onNewAlert])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  return (
    <div className="panel live-event-log">
      <div className="panel-head live-event-log-head">
        <div className="live-event-log-title">
          <h3>Event log</h3>
          <span className={`live-event-pill ${online ? 'on' : 'off'}`}>
            {online ? '● LIVE' : '○ OFFLINE'}
          </span>
        </div>
        <div className="live-event-log-meta">
          <span>{peopleCount} tracked</span>
          <span>{events.length} events</span>
          <button type="button" className="live-event-refresh" onClick={poll} title="Refresh now">
            <Icon.Refresh />
          </button>
        </div>
      </div>

      {error && <div className="live-event-error">{error}</div>}

      <div className="live-event-scroll" ref={listRef}>
        {events.length === 0 && !error ? (
          <div className="live-event-empty">
            Waiting for zone crossings… walk Yellow → Red → Orange to generate events.
          </div>
        ) : (
          events.map((event) => (
            <EventRow key={event.id} event={event} showStatus />
          ))
        )}
      </div>
    </div>
  )
}
