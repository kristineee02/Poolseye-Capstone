import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { DATA_RESET_EVENT, createBackup, fetchDataSummary, resetData } from '../../api/dataManagement'
import './DataManagementCard.css'

const CATEGORIES = [
  {
    key: 'detections',
    label: 'Event History',
    description: 'Delete recorded detection events and activity logs.',
    unit: 'records',
  },
  {
    key: 'alerts',
    label: 'Alerts & Notifications',
    description: 'Delete alerts and acknowledgment records.',
    unit: 'records',
  },
  {
    key: 'broadcasts',
    label: 'Broadcasts & Test Alerts',
    description: 'Delete emergency broadcasts and test alerts.',
    unit: 'records',
  },
  {
    key: 'responseStats',
    label: 'Response Time Records',
    description: 'Clear lifeguard response-time statistics.',
    unit: 'lifeguards',
  },
]

const PRESERVED = 'Accounts and passwords, CCTV settings, geofence zones, operating hours, AI models and system settings are never cleared.'

function formatDateTime(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function categoryLabel(key) {
  return CATEGORIES.find((c) => c.key === key)?.label || key
}

function dependencyNotes(selected) {
  const notes = []
  if (selected.has('detections') || selected.has('alerts')) {
    notes.push('Analytics and reports have no separate records. Their charts and totals are recalculated without the cleared records.')
  }
  if (selected.has('alerts')) {
    notes.push('Pending alerts are removed too, which silences an active drowning alarm. Snapshots and clips stay in media storage.')
  }
  if (selected.has('alerts') && !selected.has('responseStats')) {
    notes.push('Lifeguard acknowledged and missed counters are stored on each profile and stay unless "Lifeguard response statistics" is also selected.')
  }
  if (selected.has('responseStats') && !selected.has('alerts')) {
    notes.push('Average response time in Analytics is calculated from alert records, so it stays until "Alerts & acknowledgments" is also cleared.')
  }
  return notes
}

export default function DataManagementCard({ showStatus }) {
  const [summary, setSummary] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [backup, setBackup] = useState(null)
  const [backingUp, setBackingUp] = useState(false)
  const [backupProgress, setBackupProgress] = useState({ percent: null, stage: '', indeterminate: true })
  const [now, setNow] = useState(() => Date.now())

  const [selected, setSelected] = useState(() => new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [resetting, setResetting] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchDataSummary()
    setLoading(false)
    if (!data.ok) {
      setLoadError(data.error || 'Could not load data summary.')
      return
    }
    setLoadError('')
    setSummary(data)
    setBackup(data.lastBackup || null)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const maxAgeMs = (summary?.backupMaxAgeSec || 1800) * 1000
  const backupValid = Boolean(backup?.verifiedAt) && now - backup.createdAt < maxAgeMs
  const minutesLeft = backupValid ? Math.max(1, Math.ceil((backup.createdAt + maxAgeMs - now) / 60000)) : 0

  const counts = summary?.counts || {}
  const selectedList = CATEGORIES.filter((c) => selected.has(c.key))
  const allSelected = selected.size === CATEGORIES.length
  const notes = useMemo(() => dependencyNotes(selected), [selected])
  const totalRecords = selectedList.reduce((sum, c) => sum + (c.unit === 'records' ? counts[c.key] || 0 : 0), 0)
  const canConfirm = typed === 'RESET' && (!notes.length || understood) && !resetting

  const runBackup = async () => {
    if (backingUp) return
    setBackupProgress({ percent: null, stage: 'Starting backup…', indeterminate: true })
    setBackingUp(true)
    const result = await createBackup(setBackupProgress)
    setBackingUp(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Backup failed', message: result.error })
      return
    }
    setBackup(result.backup)
    setNow(Date.now())
    showStatus({
      tone: 'success',
      title: 'Backup saved',
      message: `${result.backup.fileName} was downloaded and verified. Reset Data is unlocked for 30 minutes.`,
    })
  }

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(CATEGORIES.map((category) => category.key)))
  }

  const goToConfirm = () => {
    if (!selected.size) return
    setTyped('')
    setUnderstood(false)
    setConfirmOpen(true)
  }

  const runReset = async () => {
    if (!canConfirm) return
    setResetting(true)
    const result = await resetData({
      categories: selectedList.map((c) => c.key),
      backupId: backup?.id,
      confirm: typed,
    })
    setResetting(false)
    setConfirmOpen(false)

    if (!result.ok) {
      if (result.code === 'backup_required') setBackup(null)
      showStatus({ tone: 'error', title: 'Reset not completed', message: result.error || 'Reset failed. No data was changed.' })
      await load()
      return
    }

    const cleared = selectedList
      .map((c) => `${categoryLabel(c.key)}: ${result.deletedCounts?.[c.key] ?? 0}`)
      .join(' · ')
    setSelected(new Set())
    setBackup(null)
    window.dispatchEvent(new CustomEvent(DATA_RESET_EVENT))
    await load()
    showStatus({ tone: 'success', title: 'Data reset complete', message: cleared })
  }

  return (
    <div className="dm-grid">
      <section className="settings-card dm-card">
        <div className="dm-card-heading">
          <span className="dm-heading-icon dm-heading-icon-backup"><Icon.Database /></span>
          <div>
            <h3>Backup Data</h3>
            <p>Download a complete copy of the PoolsEye database.</p>
          </div>
        </div>

        <div className="dm-backup-contents">
          <p>This will create a downloadable <code>.sqlite3</code> file containing your system records, including:</p>
          <ul>
            <li>Event history and detections</li>
            <li>Alerts and acknowledgments</li>
            <li>Analytics and reports</li>
            <li>Lifeguard records</li>
            <li>CCTV camera settings and operating hours</li>
            <li>Geofence zones and configurations</li>
          </ul>
        </div>

        <div className="dm-media-note">
          <Icon.Info />
          <span><strong>Snapshots and video clips remain in media storage.</strong> The backup will keep their links, not the actual media files.</span>
        </div>

        {backingUp ? (
          <div
            className={`dm-backup-progress${backupProgress.indeterminate ? ' is-indeterminate' : ''}`}
            role="progressbar"
            aria-label="Backup progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={backupProgress.percent ?? undefined}
          >
            <div className="dm-progress-meta">
              <span>{backupProgress.stage}</span>
              <strong>{backupProgress.percent == null ? 'Preparing…' : `${backupProgress.percent}%`}</strong>
            </div>
            <div className="dm-progress-track" aria-hidden="true">
              <span style={backupProgress.percent == null ? undefined : { width: `${backupProgress.percent}%` }} />
            </div>
            <p>Keep this page open. The file will download only after verification succeeds.</p>
          </div>
        ) : null}

        {backup ? (
          <p className={`dm-last-backup${backupValid ? ' is-valid' : ''}`}>
            {backupValid ? <Icon.CheckCircle /> : <Icon.Info />}
            <span>Last verified backup: <strong>{backup.fileName}</strong> · {formatDateTime(backup.createdAt)}</span>
          </p>
        ) : null}

        <div className="settings-card-actions dm-backup-action">
          <button type="button" className="btn-primary" onClick={runBackup} disabled={backingUp || loading}>
            {backingUp ? <span className="btn-spinner" aria-hidden="true" /> : <Icon.Download />}
            {backingUp ? 'Creating backup…' : 'Backup & Download'}
          </button>
        </div>
      </section>

      <section className="settings-card dm-card">
        <div className="dm-card-heading">
          <span className="dm-heading-icon dm-heading-icon-reset"><Icon.Trash /></span>
          <div>
            <h3>Reset Data</h3>
            <p>Clear selected monitoring records. Accounts and system settings will remain unchanged.</p>
          </div>
        </div>

        <div className="dm-danger-note">
          <Icon.AlertTriangle />
          <span><strong>This will permanently delete the selected records.</strong> {PRESERVED}</span>
        </div>

        {loadError ? (
          <div className="settings-camera-error">
            <span>{loadError}</span>
            <button type="button" className="btn-secondary" onClick={load}>Retry</button>
          </div>
        ) : null}

        <div className="dm-select-heading">
          <h4>Select data to reset</h4>
          <p>Choose exactly which records you want to clear.</p>
        </div>

        <label className={`dm-check dm-select-all${allSelected ? ' is-checked' : ''}`}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span className="dm-check-box" aria-hidden="true"><Icon.Check /></span>
          <span className="dm-check-label">Select All</span>
          <span className="dm-select-count">{selected.size} of {CATEGORIES.length} selected</span>
        </label>

        <div className="dm-inline-check-list">
          {CATEGORIES.map((c) => (
            <label key={c.key} className={`dm-check dm-inline-check${selected.has(c.key) ? ' is-checked' : ''}`}>
              <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
              <span className="dm-check-box" aria-hidden="true"><Icon.Check /></span>
              <span className="dm-check-body">
                <span className="dm-check-label">{c.label}</span>
                <span className="dm-check-desc">{c.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="dm-reset-footer">
          <div className={`dm-reset-lock${backupValid ? ' is-ready' : ''}`}>
            {backupValid ? <Icon.Shield /> : <Icon.Lock />}
            <span>
              <strong>{backupValid ? 'Verified backup ready.' : 'A verified backup is required before resetting.'}</strong>
              {backupValid
                ? ` Reset is available for ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'}.`
                : ' Reset will be available for 30 minutes after a successful backup.'}
            </span>
          </div>
          <button
            type="button"
            className="btn-danger dm-reset-button"
            onClick={goToConfirm}
            disabled={!backupValid || !selected.size || loading || resetting}
          >
            <Icon.Trash />
            Reset Selected Data
          </button>
        </div>
      </section>

      <Modal
        isOpen={confirmOpen}
        onClose={resetting ? undefined : () => setConfirmOpen(false)}
        title="Confirm data reset"
        size="md"
        elevated
      >
        <div className="dm-modal">
          <div className="dm-confirm-scope">
            <Icon.CheckCircle />
            <p>Only the checked categories below will be reset. Every unchecked category will be preserved.</p>
          </div>

          <ul className="dm-summary">
            {selectedList.map((c) => (
              <li key={c.key}>
                <span>{c.label}</span>
                <strong>{(counts[c.key] ?? 0).toLocaleString()} {c.unit}</strong>
              </li>
            ))}
            {totalRecords ? (
              <li className="dm-summary-total">
                <span>Total records deleted</span>
                <strong>{totalRecords.toLocaleString()}</strong>
              </li>
            ) : null}
          </ul>

          {notes.length ? (
            <div className="dm-deps">
              <span className="dm-deps-title"><Icon.AlertTriangle /> Related data</span>
              <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
              <label className="dm-check dm-check-inline">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={resetting} />
                <span className="dm-check-box" aria-hidden="true"><Icon.Check /></span>
                <span className="dm-check-label">I understand how this affects related data</span>
              </label>
            </div>
          ) : null}

          <p className="dm-backup-line">
            <Icon.Shield /> Backup on file: {backup?.fileName || '—'}
          </p>

          <label className="settings-field">
            <span className="field-label">Type <strong>RESET</strong> to confirm</span>
            <input
              className="field-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="RESET"
              autoComplete="off"
              spellCheck={false}
              disabled={resetting}
            />
          </label>

          <div className="form-modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setConfirmOpen(false)} disabled={resetting}>Back</button>
            <button type="button" className="btn-danger" onClick={runReset} disabled={!canConfirm}>
              {resetting ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {resetting ? 'Resetting…' : 'Reset data'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
