import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { ConfirmModal } from '../ui/Modal'
import Toggle from '../ui/Toggle'
import { fetchOperatingHours, saveOperatingHours } from '../../api/operatingHours'

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function formatTime(hhmm) {
  if (!TIME_RE.test(hhmm || '')) return hhmm || '—'
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

function validate(schedule) {
  const errors = {}
  for (const { key, label } of DAYS) {
    const day = schedule[key]
    if (day.closed) continue
    if (!TIME_RE.test(day.open) || !TIME_RE.test(day.close)) errors[key] = `Enter open and close times for ${label}.`
    else if (day.open === day.close) errors[key] = 'Open and close can’t be the same. Mark the day closed instead.'
  }
  return errors
}

function sameSchedule(a, b) {
  return DAYS.every(({ key }) =>
    a[key].closed === b[key].closed && a[key].open === b[key].open && a[key].close === b[key].close)
}

export default function OperatingHoursCard({ showStatus }) {
  const [saved, setSaved] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [timezone, setTimezone] = useState('Asia/Manila')
  const [schedule, setSchedule] = useState(null)
  const [status, setStatus] = useState(null)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const applySaved = (result) => {
    setSaved(result)
    setEnabled(result.enabled)
    setTimezone(result.timezone)
    setSchedule(result.schedule)
    setStatus(result.status)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const result = await fetchOperatingHours()
    setLoading(false)
    if (!result.ok) {
      setLoadError(result.error || 'Could not load operating hours.')
      return
    }
    setLoadError('')
    applySaved(result)
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh only the "open / after hours" indicator so unsaved edits are kept.
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await fetchOperatingHours()
      if (result.ok) setStatus(result.status)
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const dirty = Boolean(saved && schedule) && (
    enabled !== saved.enabled || !sameSchedule(schedule, saved.schedule)
  )

  const updateDay = (key, patch) => {
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const requestSave = () => {
    const next = validate(schedule)
    setErrors(next)
    if (Object.keys(next).length) return
    setConfirmOpen(true)
  }

  const save = async () => {
    setSaving(true)
    const result = await saveOperatingHours({ enabled, timezone, schedule })
    setSaving(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Schedule not saved', message: result.error || 'Could not save operating hours.' })
      return
    }
    applySaved(result)
    showStatus({
      tone: 'success',
      title: 'Operating hours saved',
      message: result.enabled
        ? 'Anyone detected outside these hours will be flagged as unsupervised. The stream server picks up the change within 15 seconds.'
        : 'The schedule was saved. The after-hours rule is off, so detection runs normally at all times.',
    })
  }

  let statusLabel = 'Loading…'
  let statusClass = ''
  if (status && saved) {
    if (!saved.enabled) statusLabel = 'After-hours rule off'
    else if (status.afterHours) { statusLabel = `After hours now (${formatTime(status.localTime)})`; statusClass = 'is-closed' }
    else { statusLabel = `Open now (${formatTime(status.localTime)})`; statusClass = 'is-online' }
  }

  const disabled = loading || saving || !schedule

  return (
    <section className="settings-card settings-hours-card">
      <div className="settings-card-head">
        <div className="settings-card-title">
          <Icon.Clock />
          <h3>Operating Hours</h3>
        </div>
        <span className={`settings-camera-status ${statusClass}`}>
          <Icon.Clock />
          {statusLabel}
        </span>
      </div>

      {loadError ? (
        <div className="settings-camera-error">
          <span>{loadError}</span>
          <button type="button" className="btn-secondary" onClick={load}>Retry</button>
        </div>
      ) : null}

      <div className="settings-hours-rule">
        <div>
          <p className="settings-hours-rule-title">After-hours rule</p>
          <p className="settings-hours-rule-copy">
            Outside these hours, any person the camera detects is flagged as unsupervised right away,
            even if other people are nearby.
          </p>
        </div>
        <Toggle on={enabled} onChange={setEnabled} label="Enable after-hours rule" />
      </div>

      {schedule ? (
        <div className="settings-hours-table" role="table" aria-label="Weekly operating hours">
          <div className="settings-hours-row settings-hours-head" role="row">
            <span role="columnheader">Day</span>
            <span role="columnheader">Opens</span>
            <span role="columnheader">Closes</span>
            <span role="columnheader">Closed all day</span>
          </div>
          {DAYS.map(({ key, label }) => {
            const day = schedule[key]
            const overnight = !day.closed && TIME_RE.test(day.open) && TIME_RE.test(day.close) && day.close < day.open
            return (
              <div key={key} className={`settings-hours-row${errors[key] ? ' is-invalid' : ''}`} role="row">
                <span className="settings-hours-day" role="cell">{label}</span>
                <span role="cell">
                  <input
                    type="time"
                    className="field-input"
                    value={day.open}
                    onChange={(e) => updateDay(key, { open: e.target.value })}
                    disabled={disabled || day.closed}
                    aria-label={`${label} opening time`}
                  />
                </span>
                <span role="cell">
                  <input
                    type="time"
                    className="field-input"
                    value={day.close}
                    onChange={(e) => updateDay(key, { close: e.target.value })}
                    disabled={disabled || day.closed}
                    aria-label={`${label} closing time`}
                  />
                  {overnight ? <span className="settings-hours-hint">next day</span> : null}
                </span>
                <span role="cell">
                  <input
                    type="checkbox"
                    className="settings-hours-check"
                    checked={day.closed}
                    onChange={(e) => updateDay(key, { closed: e.target.checked })}
                    disabled={disabled}
                    aria-label={`${label} closed all day`}
                  />
                </span>
                {errors[key] ? <span className="field-error settings-hours-error">{errors[key]}</span> : null}
              </div>
            )
          })}
        </div>
      ) : null}

      <p className="settings-camera-note">
        A closing time earlier than the opening time means the pool stays open past midnight.
      </p>

      <div className="settings-card-actions">
        {dirty ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => { applySaved(saved); setErrors({}) }}
          >
            Cancel
          </button>
        ) : null}
        <button type="button" className="btn-primary" disabled={disabled || !dirty} onClick={requestSave}>
          {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Save operating hours?"
        message={enabled
          ? 'People detected outside these hours will trigger unsupervised alerts.'
          : 'The schedule will be saved, but the after-hours rule stays off.'}
        tone="info"
        icon={Icon.Clock}
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={save}
      />
    </section>
  )
}
