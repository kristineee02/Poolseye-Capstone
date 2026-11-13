import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import { LoadingHint, Skeleton } from '../ui/Skeleton'
import {
  createTestAlert,
  dispatchEvent,
  fetchActiveAlert,
  fetchAlarm,
  fetchEvents,
  fetchEventSummary,
  getAlertStreamUrl,
  resendEvent,
  setManualAlarm,
} from '../../api/events'
import { DATA_RESET_EVENT } from '../../api/dataManagement'
import { formatTime, zoneLabel } from '../history/eventKinds'
import './RightRail.css'

const POLL_MS = 5000
// Mirrors LOOKBACK_SEC in backend/dispatch.js: older alerts are never auto-sent.
const AUTO_SEND_WINDOW_SEC = 15 * 60

function describeAlert(alert) {
  const affectedCount = Number(alert.affected_count || alert.person_ids?.length || 1)
  const person = affectedCount > 1
    ? `${affectedCount} swimmers`
    : alert.person_id != null ? `Person #${alert.person_id}` : 'A person'
  const zone = zoneLabel(alert)
  const where = zone ? ` in the ${zone.toLowerCase()}` : ''

  if (alert.event === 'AFTER_HOURS_PRESENCE') return `${person} detected${where} outside operating hours.`
  if (String(alert.id || '').startsWith('digest-') || (alert.meta && /Persons #/.test(alert.meta))) {
    if (alert.category === 'drowning') {
      return `${alert.meta || 'Multiple people may be in distress'}. Respond immediately.`
    }
    if (alert.category === 'supervision') {
      return `${alert.meta || 'Multiple swimmers need closer supervision'}.`
    }
  }
  if (alert.category === 'supervision') {
    if (affectedCount > 1) return `${affectedCount} swimmers detected without supervision${where}.`
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

function responseTime(seconds) {
  if (seconds == null) return null
  const rounded = Math.max(0, Math.round(seconds))
  return rounded < 60 ? `${rounded}s` : `${Math.floor(rounded / 60)}m ${rounded % 60}s`
}

function closedTime(alert) {
  return formatTime(alert.closed_at || alert.acknowledged_at || alert.ts)
}

function RecentHistoryAlert({ alert }) {
  const dismissed = alert.status === 'dismissed'
  const handledBy = alert.closed_by_name || alert.acknowledged_by_name || alert.responder_name

  return (
    <div className="rr-history-item">
      <div className="rr-history-top">
        <span className="rr-history-title">{alert.title}</span>
        <span className={`rr-history-status ${dismissed ? 'is-dismissed' : 'is-resolved'}`}>
          {dismissed ? 'False alarm' : 'Resolved'}
        </span>
      </div>
      <p className="rr-history-desc">{describeAlert(alert)}</p>
      <div className="rr-history-meta">
        <span>{closedTime(alert)}</span>
        {handledBy ? <span>Handled by {handledBy}</span> : null}
      </div>
    </div>
  )
}

function HandoffStatus({ alert, busy, onResend }) {
  if (alert.responding_at) {
    return (
      <div className="rr-handoff is-responding">
        <Icon.CheckCircle />
        <span>
          <b>{alert.responder_name || 'A lifeguard'}</b> is responding · {responseTime(alert.response_time_seconds) || 'now'} response time
        </span>
      </div>
    )
  }
  if (alert.acknowledged_at) {
    return (
      <div className="rr-handoff is-responding">
        <Icon.CheckCircle />
        <span><b>{alert.acknowledged_by_name || 'A lifeguard'}</b> acknowledged · awaiting response</span>
      </div>
    )
  }
  if (alert.escalated_at) {
    return (
      <div className="rr-actions">
        <div className="rr-handoff is-escalated">
          <Icon.AlertTriangle />
          <span>
            <b>No response yet</b> — last sent as urgent at {formatTime(alert.escalated_at)}
          </span>
        </div>
        <button type="button" className="qa-btn danger rr-resend" onClick={onResend} disabled={Boolean(busy)}>
          <Icon.Bell />
          {busy === 'resend' ? 'Re-sending…' : 'Re-send as urgent to lifeguards'}
        </button>
      </div>
    )
  }
  return (
    <div className="rr-handoff">
      <Icon.Bell />
      <span>
        <b>Awaiting Response</b> · {alert.dispatched_by == null ? 'sent automatically' : 'sent to lifeguards'}{' '}
        at {formatTime(alert.dispatched_at)}
      </span>
    </div>
  )
}

function describeSupervised(event) {
  const person = event.person_id != null ? `Person #${event.person_id}` : 'A person'
  const zone = zoneLabel(event)
  const where = zone ? ` in the ${zone.toLowerCase()}` : ''
  const distance = event.separation_distance != null ? ` · ${Number(event.separation_distance).toFixed(1)} m from Person #${event.nearest_person_id ?? '?'}` : ''
  return `${person} supervised${where}${distance}`
}

function ActiveAlert({ alert, supervised, busy, onDispatch, onResend }) {
  if (!alert) {
    return (
      <div className="active-alert-item is-clear">
        <div className="active-alert-top">
          <span className="active-alert-icon"><Icon.Check /></span>
          <span className="active-alert-title">No active alerts</span>
        </div>
        <p className="active-alert-desc">No intrusion, unsupervised swimmer or possible drowning detected.</p>
        {supervised ? (
          <div className="active-alert-meta">
            <span>{describeSupervised(supervised)}</span>
            <span>{timeAgo(supervised.ts)}</span>
          </div>
        ) : null}
      </div>
    )
  }

  const zone = zoneLabel(alert)
  const age = timeAgo(alert.ts)
  const isTest = alert.camera === 'TEST'

  return (
    <>
      <div className="active-alert-item">
        <div className="active-alert-top">
          <span className="active-alert-icon"><Icon.AlertTriangle /></span>
          <span className="active-alert-title">{alert.title}</span>
          {isTest ? <span className="active-alert-test">TEST</span> : null}
        </div>
        <p className="active-alert-desc">{describeAlert(alert)}</p>
        <div className="active-alert-meta">
          <span>{alertTime(alert)}{age ? ` · ${age}` : ''}</span>
          {zone ? <span className="active-alert-zone">{zone}</span> : null}
          <span>{alert.detection_source || (alert.camera === 'UPLOAD' ? 'Uploaded Video' : 'Live CCTV')}</span>
        </div>
      </div>

      {alert.dispatched_at ? (
        <HandoffStatus alert={alert} busy={busy} onResend={onResend} />
      ) : (
        <div className="rr-actions">
          <button type="button" className="qa-btn danger" onClick={onDispatch} disabled={Boolean(busy)}>
            <Icon.Bell />
            {busy === 'dispatch' ? 'Sending…' : 'Send to lifeguards'}
          </button>
          {alert.ts && Date.now() / 1000 - alert.ts < AUTO_SEND_WINDOW_SEC ? (
            <p className="rr-hint">Auto-sends to lifeguards if not sent within 1 minute. Only a lifeguard can acknowledge or dismiss it.</p>
          ) : null}
        </div>
      )}
    </>
  )
}

export default function RightRail({ onNavigate }) {
  const [alertTab, setAlertTab] = useState('active')
  const [alert, setAlert] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [historyAlerts, setHistoryAlerts] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [supervised, setSupervised] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(null)
  const [alarm, setAlarm] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadRequestId = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current
    const [active, totals, alarmState, resolved, dismissed] = await Promise.all([
      fetchActiveAlert(),
      fetchEventSummary(),
      fetchAlarm(),
      fetchEvents({ kind: 'alerts', status: 'resolved', page: 1, pageSize: 4 }),
      fetchEvents({ kind: 'alerts', status: 'dismissed', page: 1, pageSize: 4 }),
    ])
    // Ignore an older poll that finishes after a newer SSE-triggered refresh.
    if (requestId !== loadRequestId.current) return
    if (alarmState.ok) setAlarm(alarmState)
    if (!active.ok || !totals.ok) {
      setError(active.error || totals.error || 'Could not load alerts.')
      setLoading(false)
      return
    }
    setError('')
    const activeAlerts = (active.alerts || (active.active ? [active.active] : []))
      .filter((item) => item.status === 'pending' || item.status === 'responding')
    setAlert(activeAlerts[0] || null)
    setAlerts(activeAlerts)
    setSupervised(active.supervised || null)
    setSummary(totals)
    if (resolved.ok && dismissed.ok) {
      setHistoryError('')
      setHistoryAlerts(
        [...(resolved.events || []), ...(dismissed.events || [])]
          .sort((a, b) => Number(b.closed_at || b.acknowledged_at || b.ts || 0)
            - Number(a.closed_at || a.acknowledged_at || a.ts || 0))
          .slice(0, 4)
      )
    } else {
      setHistoryError(resolved.error || dismissed.error || 'Could not load alert history.')
    }
    setLoading(false)
  }, [])

  const retryLoad = () => {
    setLoading(true)
    load()
  }

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    const streamUrl = getAlertStreamUrl()
    const stream = streamUrl ? new EventSource(streamUrl) : null
    stream?.addEventListener('alerts', load)
    window.addEventListener(DATA_RESET_EVENT, load)
    return () => {
      clearInterval(id)
      stream?.close()
      window.removeEventListener(DATA_RESET_EVENT, load)
    }
  }, [load])

  useEffect(() => {
    if (!notice) return undefined
    const id = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(id)
  }, [notice])

  const dispatch = async (eventId = alert?.id) => {
    if (!eventId) return
    setBusy('dispatch')
    const result = await dispatchEvent(eventId)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Could not send the alert.')
      return
    }
    setNotice(result.recipients ? `Sent to ${result.recipients} lifeguard${result.recipients === 1 ? '' : 's'}.` : 'No active lifeguards to notify.')
    load()
  }

  const resend = async (eventId = alert?.id) => {
    if (!eventId) return
    setBusy('resend')
    const result = await resendEvent(eventId)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Could not re-send the alert.')
      return
    }
    setNotice(result.recipients
      ? `Re-sent as urgent to ${result.recipients} lifeguard${result.recipients === 1 ? '' : 's'}.`
      : 'No active lifeguards to notify.')
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
    setNotice(kind === 'drowning'
      ? 'Test drowning alert created and sent to lifeguards. It is not saved to Event history.'
      : 'Test alert created — send it to lifeguards above. It is not saved to Event history.')
    load()
  }

  const toggleAlarm = async () => {
    const turnOn = !alarm?.manualActive
    setBusy('alarm')
    const result = await setManualAlarm(turnOn)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Could not update the alarm.')
      return
    }
    setAlarm(result)
    setNotice(turnOn ? 'Pool alarm activated.' : 'Manual alarm silenced.')
  }

  const stats = [
    { label: 'Intrusions flagged', value: summary?.intrusions_flagged },
    { label: 'Supervised visits', value: summary?.supervised_visits },
  ]

  return (
    <aside className="rightrail">
      <section className="rr-card">
        <div className="active-alert-head">
          <h2>Active Alerts</h2>
          {onNavigate && alertTab === 'history' ? (
            <button type="button" className="active-alert-link" onClick={() => onNavigate('history')}>
              View All
            </button>
          ) : null}
        </div>
        <div className="rr-alert-tabs" role="tablist" aria-label="Alert views">
          <button
            type="button"
            role="tab"
            aria-selected={alertTab === 'active'}
            className={alertTab === 'active' ? 'is-active' : ''}
            onClick={() => setAlertTab('active')}
          >
            Active ({alerts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={alertTab === 'history'}
            className={alertTab === 'history' ? 'is-active' : ''}
            onClick={() => setAlertTab('history')}
          >
            History
          </button>
        </div>
        {loading ? (
          <div className="rr-loading" role="status" aria-label="Loading active alert">
            <Skeleton width="42%" height={22} />
            <Skeleton width="86%" height={13} />
            <Skeleton width="100%" height={38} />
            <LoadingHint onRetry={retryLoad} compact />
          </div>
        ) : alertTab === 'active' ? (
          alerts.length ? (
            <div className="rr-active-alert-list" role="tabpanel">
              {alerts.map((item) => (
                <div className="rr-active-alert-group" key={item.id}>
                  <ActiveAlert
                    alert={item}
                    supervised={null}
                    busy={busy}
                    onDispatch={() => dispatch(item.id)}
                    onResend={() => resend(item.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <ActiveAlert alert={null} supervised={supervised} busy={busy} onDispatch={dispatch} onResend={resend} />
          )
        ) : (
          <div className="rr-history-list" role="tabpanel">
            {historyAlerts.length ? historyAlerts.map((item) => (
              <RecentHistoryAlert key={item.id} alert={item} />
            )) : (
              <div className="rr-history-empty">
                <span>No alert history yet</span>
                <p>Resolved and false-alarm incidents will appear here.</p>
              </div>
            )}
            {historyError ? <div className="rr-error"><span>{historyError}</span><button type="button" onClick={retryLoad}>Retry</button></div> : null}
          </div>
        )}
        {notice ? <div className="rr-notice">{notice}</div> : null}
        {error ? <div className="rr-error"><span>{error}</span><button type="button" onClick={retryLoad}>Retry</button></div> : null}
      </section>

      <section className="rr-card">
        <div className="active-alert-head">
          <h2>Alarm Speaker</h2>
          <span className={`rr-node-status ${alarm?.nodeOnline ? 'is-online' : 'is-offline'}`}>
            {alarm?.nodeOnline ? 'Node online' : 'Node offline'}
          </span>
        </div>
        <p className={`rr-alarm-state ${alarm?.alarm ? 'is-sounding' : ''}`}>
          {!alarm?.alarm
            ? 'Silent'
            : alarm.reason === 'drowning'
              ? 'Sounding — possible drowning. Stops once a lifeguard acknowledges or dismisses it.'
              : 'Sounding — manual alarm.'}
        </p>
        <div className="quick-actions">
          <button
            type="button"
            className={alarm?.manualActive ? 'qa-btn' : 'qa-btn danger'}
            onClick={toggleAlarm}
            disabled={Boolean(busy)}
          >
            <Icon.Bell />
            {busy === 'alarm' ? 'Updating…' : alarm?.manualActive ? 'Silence manual alarm' : 'Activate pool alarm'}
          </button>
        </div>
      </section>

      <section className="rr-card">
        <div className="active-alert-head">
          <h2>Today's Summary</h2>
        </div>
        <div className="mini-stat-grid">
          {stats.map((s) => (
            <div className="mini-stat" key={s.label}>
              <div className="ml">{s.label}</div>
              <div className="mv">{loading ? <Skeleton width={38} height={24} /> : s.value ?? '—'}</div>
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
