import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { dispatchEvent, fetchActiveAlert, fetchEventSummary, updateEventStatus } from '../../api/events'
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
  return alert.ts ? formatTime(alert.ts, true) : alert.time || '—'
}

function formatMeters(value) {
  return value == null ? null : `${Number(value).toFixed(2)} m`
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
        <span className="active-alert-icon"><Icon.Check /></span>
        <div className="active-alert-body">
          <div className="active-alert-row">
            <span className="active-alert-title">No active alerts</span>
          </div>
          <p className="active-alert-desc">Everyone in view is accounted for.</p>
        </div>
      </div>
    )
  }

  const isSupervision = alert.category === 'supervision' && alert.event !== 'AFTER_HOURS_PRESENCE'
  const zone = zoneLabel(alert)

  return (
    <>
      <div className="active-alert-item">
        <span className="active-alert-icon"><Icon.AlertTriangle /></span>
        <div className="active-alert-body">
          <div className="active-alert-row">
            <span className="active-alert-title">{alert.title}</span>
            <span className="active-alert-time">{alertTime(alert)}</span>
          </div>
          <p className="active-alert-desc">{describeAlert(alert)}</p>
        </div>
      </div>

      <div className="rr-details">
        {alert.person_id != null ? (
          <div className="det-row"><span className="k">Person</span><span className="v">#{alert.person_id}</span></div>
        ) : null}
        {zone ? <div className="det-row"><span className="k">Detected in</span><span className="v">{zone}</span></div> : null}
        {isSupervision ? (
          <div className="det-row">
            <span className="k">Nearest person</span>
            <span className="v v-dist">{formatMeters(alert.separation_distance) || 'none in view'}</span>
          </div>
        ) : null}
      </div>

      {alert.dispatched_at ? (
        <>
          <HandoffStatus alert={alert} />
          <button type="button" className="rr-close-link" onClick={onClose} disabled={Boolean(busy)}>
            {busy === 'resolved' ? 'Closing…' : 'Close alert without a lifeguard'}
          </button>
        </>
      ) : (
        <div className="rr-actions">
          <button type="button" className="qa-btn danger" onClick={onDispatch} disabled={Boolean(busy)}>
            <Icon.Bell />
            {busy === 'dispatch' ? 'Sending…' : 'Send to lifeguards'}
          </button>
          <button type="button" className="qa-btn" onClick={onDismiss} disabled={Boolean(busy)}>
            <Icon.X />
            {busy === 'dismissed' ? 'Dismissing…' : 'False alarm'}
          </button>
          {alert.ts && Date.now() / 1000 - alert.ts < AUTO_SEND_WINDOW_SEC ? (
            <p className="rr-hint">Sent to lifeguards automatically if not reviewed within 1 minute.</p>
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
    setNotice('')
  }, [alert?.id])

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
      <section className="active-alert-card">
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

      <section>
        <div className="rr-title">Today's summary</div>
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
        <section>
          <div className="rr-title">Quick actions</div>
          <div className="quick-actions">
            <button type="button" className="qa-btn" onClick={() => onNavigate('lifeguards')}>
              <Icon.Bell />
              Send manual alert
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  )
}
