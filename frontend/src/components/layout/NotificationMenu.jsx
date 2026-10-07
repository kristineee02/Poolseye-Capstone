import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import { fetchEvents } from '../../api/events'
import { zoneLabel } from '../history/eventKinds'
import './NotificationMenu.css'

const POLL_MS = 10000
const LIMIT = 6

function timeAgo(ts) {
  if (!ts) return ''
  const sec = Math.max(0, Date.now() / 1000 - ts)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function handoff(event) {
  if (event.responding_at) return { label: `${event.responder_name || 'Lifeguard'} responding`, tone: 'safe' }
  if (event.escalated_at) return { label: 'No response', tone: 'alarm' }
  if (event.dispatched_at) return { label: 'Sent', tone: 'accent' }
  return { label: 'New', tone: 'warn' }
}

export default function NotificationMenu({ onNavigate }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  const rootRef = useRef(null)

  const load = useCallback(async () => {
    const result = await fetchEvents({ kind: 'alerts', status: 'unacknowledged', pageSize: LIMIT })
    if (!result.ok) {
      setError(result.error || 'Could not load notifications.')
      return
    }
    setError('')
    setItems(result.events || [])
    setCount(result.total || 0)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return undefined
    load()
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, load])

  const go = (page) => {
    setOpen(false)
    onNavigate?.(page)
  }

  return (
    <div className="notif" ref={rootRef}>
      <button
        type="button"
        className={`topbar-bell${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Notifications"
      >
        <Icon.Bell />
        {count > 0 ? <span className="notif-badge">{count > 99 ? '99+' : count}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <h3>Notifications</h3>
            {count > 0 ? <span className="notif-count">{count} unacknowledged</span> : null}
          </div>

          {error ? <div className="notif-empty is-error">{error}</div> : null}

          {!error && items.length === 0 ? (
            <div className="notif-empty">
              <Icon.CheckCircle />
              <span>You're all caught up. No active alerts.</span>
            </div>
          ) : null}

          {items.length ? (
            <ul className="notif-list">
              {items.map((event) => {
                const status = handoff(event)
                const zone = zoneLabel(event)
                return (
                  <li key={event.id}>
                    <button type="button" className="notif-item" onClick={() => go(event.camera === 'TEST' ? 'live' : 'history')}>
                      <span className={`notif-icon tone-${event.category === 'drowning' ? 'alarm' : event.type === 'alarm' ? 'alarm' : 'warn'}`}>
                        <Icon.AlertTriangle />
                      </span>
                      <span className="notif-body">
                        <span className="notif-title">{event.title}</span>
                        <span className="notif-meta">
                          {zone ? `${zone} · ` : ''}{timeAgo(event.ts)}
                        </span>
                      </span>
                      <span className={`notif-status tone-${status.tone}`}>{status.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          <div className="notif-foot">
            <button type="button" onClick={() => go('live')}>Live monitoring</button>
            <button type="button" className="is-primary" onClick={() => go('history')}>
              View all events <Icon.ArrowRight />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
