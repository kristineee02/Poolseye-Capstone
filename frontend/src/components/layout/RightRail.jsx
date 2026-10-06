import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { fetchActiveAlert, fetchEventSummary, updateEventStatus } from '../../api/events'
import './RightRail.css'

const POLL_MS = 5000

const SUBTITLES = {
  UNSUPERVISED: (t) => `No one within ${t ?? 0.7} m`,
  AFTER_HOURS_PRESENCE: () => 'Detected outside operating hours',
}

function formatConf(value) {
  return value == null ? null : `conf ${Number(value).toFixed(2)}`
}

function formatMeters(value) {
  return value == null ? null : `${Number(value).toFixed(2)} m`
}

function detectedAt(alert) {
  if (alert.time) return alert.time
  if (!alert.ts) return '—'
  return new Date(alert.ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function ProximityMeter({ distance, threshold }) {
  const scale = Math.max(threshold * 2, distance ?? 0)
  const fill = distance == null ? 100 : Math.min(100, (distance / scale) * 100)
  const tooFar = distance == null || distance > threshold
  return (
    <div className="proximity-meter">
      <div className="pm-label">
        <span>Separation vs. threshold</span>
        <span>{distance == null ? 'alone' : formatMeters(distance)} / {formatMeters(threshold)}</span>
      </div>
      <div className="proximity-track">
        <div className={`proximity-fill${tooFar ? '' : ' is-safe'}`} style={{ width: `${fill}%` }} />
        <div className="proximity-threshold" style={{ left: `${(threshold / scale) * 100}%` }} />
      </div>
    </div>
  )
}

function ActiveAlertCard({ alert, onResolve, resolving }) {
  if (!alert) {
    return (
      <div className="alert-detail-card is-clear">
        <div className="alert-status-row">
          <div className="alert-status-icon">
            <Icon.Check />
          </div>
          <div>
            <div className="stitle">No active alerts</div>
            <div className="ssub">Everyone in view is accounted for</div>
          </div>
        </div>
      </div>
    )
  }

  const threshold = alert.supervision_threshold
  const isSupervision = alert.category === 'supervision'
  const subtitle = SUBTITLES[alert.event]?.(threshold) || alert.meta
  const nearest = alert.nearest_person_id != null
    ? `#${alert.nearest_person_id}${alert.nearest_confidence != null ? ` · ${formatConf(alert.nearest_confidence)}` : ''}`
    : 'none in view'

  return (
    <div className="alert-detail-card">
      <div className="alert-status-row">
        <div className="alert-status-icon">
          <Icon.AlertTriangle />
        </div>
        <div>
          <div className="stitle">{alert.title}</div>
          {subtitle ? <div className="ssub">{subtitle}</div> : null}
        </div>
      </div>
      {alert.person_id != null ? (
        <div className="det-row">
          <span className="k">Person detected</span>
          <span className="v v-child">
            #{alert.person_id}{alert.confidence != null ? ` · ${formatConf(alert.confidence)}` : ''}
          </span>
        </div>
      ) : null}
      {isSupervision && alert.event !== 'AFTER_HOURS_PRESENCE' ? (
        <>
          <div className="det-row"><span className="k">Nearest person</span><span className="v v-adult">{nearest}</span></div>
          <div className="det-row">
            <span className="k">Separation distance</span>
            <span className="v v-dist">{formatMeters(alert.separation_distance) || 'alone'}</span>
          </div>
          {threshold != null ? (
            <div className="det-row"><span className="k">Allowed threshold</span><span className="v">{formatMeters(threshold)}</span></div>
          ) : null}
        </>
      ) : null}
      {alert.zone_label ? (
        <div className="det-row"><span className="k">Zone</span><span className="v">{alert.zone_label}</span></div>
      ) : null}
      <div className="det-row"><span className="k">Detected at</span><span className="v">{detectedAt(alert)}</span></div>

      {isSupervision && threshold != null && alert.event !== 'AFTER_HOURS_PRESENCE' ? (
        <ProximityMeter distance={alert.separation_distance} threshold={threshold} />
      ) : null}

      <button type="button" className="qa-btn rr-resolve" onClick={onResolve} disabled={resolving}>
        <Icon.Check />
        {resolving ? 'Resolving…' : 'Mark as resolved'}
      </button>
    </div>
  )
}

export default function RightRail() {
  const [alert, setAlert] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(false)

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

  const resolve = async () => {
    if (!alert) return
    setResolving(true)
    const result = await updateEventStatus(alert.id, 'resolved')
    setResolving(false)
    if (!result.ok) {
      setError(result.error || 'Could not resolve the alert.')
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
      <section>
        <div className="rr-title">Active alert</div>
        <ActiveAlertCard alert={alert} onResolve={resolve} resolving={resolving} />
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

      <section>
        <div className="rr-title">Quick actions</div>
        <div className="quick-actions">
          <button className="qa-btn danger">
            <Icon.Power />
            Trigger manual alarm
          </button>
        </div>
      </section>
    </aside>
  )
}
