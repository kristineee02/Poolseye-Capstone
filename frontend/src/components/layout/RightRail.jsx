import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { createTestAlert, dispatchEvent, fetchActiveAlert, fetchEventSummary, updateEventStatus } from '../../api/events'
import { formatTime, zoneLabel } from '../history/eventKinds'
import './RightRail.css'

const POLL_MS = 5000
// Mirrors LOOKBACK_SEC in backend/dispatch.js: older alerts are never auto-sent.
const AUTO_SEND_WINDOW_SEC = 15 * 60

function describeAlert(alert) {
  const person = alert.person_id != null ? `Person #${alert.person_id}` : 'A person'
  const zone = zoneLabel(alert)
  const where = zone ? ` in the ${zone.toLowerCase()}` : ''

  if (alert.event === 'AFTER_HOURS_PRESENCE') return `${person} detected${where} outside operating hours.`
  if (alert.category === 'supervision') {
    const threshold = alert.supervision_threshold ?? 0.7
    return `${person} inside restricted zone, no one else within ${threshold} m.`
  }
  if (alert.category === 'intrusion') return `${person} crossed into the restricted red zone.`
  if (alert.category === 'deep-water') return `${person} entered the deep-pool area.`
  if (alert.category === 'drowning') return `${person} may be in distress${where}. Respond immediately.`
  return alert.meta || `${person} triggered an alert${where}.`
}

function alertTime(alert) {
  return alert.ts ? formatTime(alert.ts) : alert.time || '—'
}

function timeAgo(ts) {
  if (!ts) return null
  const sec = Math.max(0, Date.now() / 1000 - ts)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function HandoffStatus({ alert }) {
  if (alert.responding_at) {
    return (
      <div className="rr-handoff is-responding">
        <Icon.CheckCircle />
        <span>
          <b>{alert.responder_name || 'A lifeguard'}</b> is responding · since {formatTime(alert.responding_at)}
        </span>
      </div>
    )
  }
  if (alert.escalated_at) {
    return (
      <div className="rr-handoff is-escalated">
        <Icon.AlertTriangle />
        <span>
          <b>No response yet</b> — re-sent as urgent at {formatTime(alert.escalated_at)}
        </span>
      </div>
    )
  }
  return (
    <div className="rr-handoff">
      <Icon.Bell />
      <span>
        <b>{alert.dispatched_by == null ? 'Sent automatically' : 'Sent to lifeguards'}</b> ·{' '}
        {formatTime(alert.dispatched_at)} — waiting for a lifeguard
      </span>
    </div>
  )
}

function ActiveAlert({ alert, busy, onDispatch, onClose, onDismiss }) {
  if (!alert) {
    return (
      <div className="active-alert-item is-clear">
        <div className="active-alert-top">
          <span className="active-alert-icon"><Icon.Check /></span>
          <span className="active-alert-title">No active alerts</span>
        </div>
        <p className="active-alert-desc">Everyone in view is accounted for.</p>
      </div>
    )
  }

  const zone = zoneLabel(alert)
  const age = timeAgo(alert.ts)

  return (
    <>
      <div className="active-alert-item">
        <div className="active-alert-top">
          <span className="active-alert-icon"><Icon.AlertTriangle /></span>
          <span className="active-alert-title">{alert.title}</span>
        </div>
        <p className="active-alert-desc">{describeAlert(alert)}</p>
        <div className="active-alert-meta">
          <span>{alertTime(alert)}{age ? ` · ${age}` : ''}</span>
          {zone ? <span className="active-alert-zone">{zone}</span> : null}
        </div>
      </div>

      {alert.dispatched_at ? (
        <>
          <HandoffStatus alert={alert} />
          <button type="button" className="rr-text-btn" onClick={onClose} disabled={Boolean(busy)}>
            {busy === 'resolved' ? 'Closing…' : 'Close alert without a lifeguard'}
          </button>
        </>
      ) : (
        <div className="rr-actions">
          <button type="button" className="qa-btn danger" onClick={onDispatch} disabled={Boolean(busy)}>
            <Icon.Bell />
            {busy === 'dispatch' ? 'Sending…' : 'Send to lifeguards'}
          </button>
          <button type="button" className="rr-text-btn" onClick={onDismiss} disabled={Boolean(busy)}>
            {busy === 'dismissed' ? 'Dismissing…' : 'Mark as false alarm'}
          </button>
          {alert.ts && Date.now() / 1000 - alert.ts < AUTO_SEND_WINDOW_SEC ? (
            <p className="rr-hint">Auto-sends to lifeguards if not reviewed within 1 minute.</p>
          ) : null}
        </div>
      )}
    </>
  )
}

export default function RightRail({ onNavigate }) {
  const [alert, setAlert] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const [active, totals] = await Promise.all([fetchActiveAlert(), fetchEventSummary()])
    if (!active.ok || !totals.ok) {
      setError(active.error || totals.error || 'Could not load alerts.')
      return
    }
    setError('')
    setAlert(active.active)
    setSummary(totals)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!notice) return undefined
    const id = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(id)
  }, [notice])

  const dispatch = async () => {
    if (!alert) return
    setBusy('dispatch')
    const result = await dispatchEvent(alert.id)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Could not send the alert.')
      return
    }
    setNotice(result.recipients ? `Sent to ${result.recipients} lifeguard${result.recipients === 1 ? '' : 's'}.` : 'No active lifeguards to notify.')
    load()
  }

  const testAlert = async (kind) => {
    setBusy(`test-${kind}`)
    const result = await createTestAlert(kind)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Could not create the test alert.')
      return
    }
    setNotice(kind === 'drowning' ? 'Test drowning alert created and sent to lifeguards.' : 'Test alert created — review it above.')
    load()
  }

  const setStatus = async (status) => {
    if (!alert) return
    setBusy(status)
    const result = await updateEventStatus(alert.id, status)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Could not update the alert.')
      return
    }
    load()
  }

  const stats = [
    { label: 'Intrusions flagged', value: summary?.intrusions_flagged },
    { label: 'Supervised visits', value: summary?.supervised_visits },
  ]

  return (
    <aside className="rightrail">
      <section className="rr-card">
        <div className="active-alert-head">
          <h2>Active Alert</h2>
          {onNavigate ? (
            <button type="button" className="active-alert-link" onClick={() => onNavigate('history')}>
              View All
            </button>
          ) : null}
        </div>
        <ActiveAlert
          alert={alert}
          busy={busy}
          onDispatch={dispatch}
          onClose={() => setStatus('resolved')}
          onDismiss={() => setStatus('dismissed')}
        />
        {notice ? <div className="rr-notice">{notice}</div> : null}
        {error ? <div className="rr-error">{error}</div> : null}
      </section>

      <section className="rr-card">
        <div className="active-alert-head">
          <h2>Today's Summary</h2>
        </div>
        <div className="mini-stat-grid">
          {stats.map((s) => (
            <div className="mini-stat" key={s.label}>
              <div className="ml">{s.label}</div>
              <div className="mv">{s.value ?? '—'}</div>
            </div>
          ))}
        </div>
      </section>

      {onNavigate ? (
        <section className="rr-card">
          <div className="active-alert-head">
            <h2>Quick Actions</h2>
          </div>
          <div className="quick-actions">
            <button type="button" className="qa-btn" onClick={() => onNavigate('lifeguards')}>
              <Icon.Bell />
              Send manual alert
            </button>
            <button type="button" className="qa-btn" onClick={() => testAlert('intrusion')} disabled={Boolean(busy)}>
              <Icon.AlertTriangle />
              {busy === 'test-intrusion' ? 'Creating…' : 'Test intrusion alert'}
            </button>
            <button type="button" className="qa-btn" onClick={() => testAlert('drowning')} disabled={Boolean(busy)}>
              <Icon.Waves />
              {busy === 'test-drowning' ? 'Creating…' : 'Test drowning alert (auto-sends)'}
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  )
}
