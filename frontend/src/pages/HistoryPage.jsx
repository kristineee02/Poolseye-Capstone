import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { SelectDropdown } from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusModal, useStatusModal } from '../components/ui/Modal'
import StatCard from '../components/analytics/StatCard'
import EventThumb from '../components/history/EventThumb'
import SnapshotModal from '../components/history/SnapshotModal'
import { eventKind, isAlertEvent, zoneLabel, formatDate, formatTime } from '../components/history/eventKinds'
import { fetchEvents, updateEventStatus } from '../api/events'
import '../components/history/HistoryTable.css'
import './HistoryPage.css'

const PAGE_SIZE = 8
const EXPORT_PAGE_SIZE = 100

const DATE_OPTIONS = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const RANGE_DAYS = { '1d': 1, '7d': 7, '30d': 30 }
const RANGE_LABEL = Object.fromEntries(DATE_OPTIONS.map((o) => [o.value, o.label]))

function sinceFor(range) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((RANGE_DAYS[range] || 30) - 1))
  return Math.floor(start.getTime() / 1000)
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

const SUMMARY_CARDS = [
  {
    status: 'all',
    key: 'total',
    label: 'Total events',
    tone: 'accent',
    icon: Icon.FileText,
    hint: (s) => (s?.logged ? `Includes ${plural(s.logged, 'activity log')}` : 'Across all statuses'),
  },
  {
    status: 'unacknowledged',
    key: 'unacknowledged',
    label: 'Unacknowledged',
    tone: 'alarm',
    icon: Icon.AlertTriangle,
    hint: (s) => (s ? (s.unacknowledged ? 'Alerts waiting for review' : 'All alerts reviewed') : null),
  },
  {
    status: 'resolved',
    key: 'acknowledged',
    label: 'Acknowledged',
    tone: 'safe',
    icon: Icon.CheckCircle,
    hint: () => 'Reviewed by a lifeguard or admin',
  },
  {
    status: 'dismissed',
    key: 'dismissed',
    label: 'Dismissed',
    tone: 'warn',
    icon: Icon.X,
    hint: () => 'Marked as false alarm',
  },
]

const KIND_OPTIONS = [
  { value: 'all', label: 'All event types' },
  { value: 'alerts', label: 'Alerts only' },
  { value: 'intrusion', label: 'Red zone intrusion' },
  { value: 'deep-water', label: 'Deep-pool entry' },
  { value: 'drowning', label: 'Possible drowning' },
  { value: 'activity', label: 'Zone activity' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'unacknowledged', label: 'Unacknowledged' },
  { value: 'resolved', label: 'Acknowledged' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'logged', label: 'Activity log' },
]

function statusInfo(event) {
  if (event.status === 'resolved') return { label: 'Acknowledged', tone: 'safe' }
  if (event.status === 'dismissed') return { label: 'Dismissed', tone: 'muted' }
  if (!isAlertEvent(event)) return { label: 'Logged', tone: 'muted' }
  return { label: 'Unacknowledged', tone: 'alarm' }
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export default function HistoryPage() {
  const [dateRange, setDateRange] = useState('30d')
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { status, showStatus, closeStatus } = useStatusModal()
  const pendingPick = useRef(null)

  const since = useMemo(() => sinceFor(dateRange), [dateRange])

  useEffect(() => {
    setPage(1)
  }, [search, kind, statusFilter, dateRange])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchEvents({ search, kind, status: statusFilter, since, page, pageSize: PAGE_SIZE }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        const list = result.events || []
        setEvents(list)
        setTotal(result.total || 0)
        setTotalPages(result.totalPages || 1)
        setSummary(result.summary || null)
        if (pendingPick.current && list.length) {
          setReviewing(pendingPick.current === 'last' ? list[list.length - 1] : list[0])
        }
        pendingPick.current = null
      } else {
        setEvents([])
        setTotal(0)
        setTotalPages(1)
        setSummary(null)
        showStatus({ tone: 'error', title: 'Could not load events', message: result.error || 'Failed to load events.' })
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [search, kind, statusFilter, since, page, refreshKey, showStatus])

  const handleAcknowledge = async (event) => {
    const result = await updateEventStatus(event.id, 'resolved')
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Update failed', message: result.error || 'Failed to update this event.' })
      return
    }
    setReviewing((prev) => (prev?.id === event.id ? { ...prev, ...result.event } : prev))
    setRefreshKey((n) => n + 1)
    showStatus({ tone: 'success', title: 'Event acknowledged', message: 'This event was marked as resolved.' })
  }

  const exportCsv = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    const rows = []
    let current = 1
    let pages = 1
    while (current <= pages) {
      const result = await fetchEvents({
        search, kind, status: statusFilter, since, page: current, pageSize: EXPORT_PAGE_SIZE,
      })
      if (!result.ok) {
        setExporting(false)
        showStatus({ tone: 'error', title: 'Export failed', message: result.error || 'Failed to export events.' })
        return
      }
      rows.push(...(result.events || []))
      pages = result.totalPages || 1
      current += 1
    }
    setExporting(false)

    if (!rows.length) {
      showStatus({ tone: 'notfound', title: 'Nothing to export', message: 'No events match your selected filters.' })
      return
    }
    const header = ['ID', 'Event', 'Kind', 'Camera', 'Zone', 'Person', 'Date', 'Time', 'Status', 'Acknowledged at']
    const lines = rows.map((e) => [
      e.id,
      e.title,
      eventKind(e).label,
      e.camera,
      zoneLabel(e) || '',
      e.person_id != null ? `#${e.person_id}` : '',
      formatDate(e.ts),
      formatTime(e.ts, true),
      statusInfo(e).label,
      e.acknowledged_at ? new Date(e.acknowledged_at * 1000).toLocaleString() : '',
    ])
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `poolseye-events-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showStatus({ tone: 'success', title: 'Events exported', message: `${rows.length} events were downloaded as CSV.` })
  }, [since, exporting, search, kind, statusFilter, dateRange, showStatus])

  const currentPage = Math.min(page, totalPages)
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const end = Math.min(currentPage * PAGE_SIZE, total)

  const reviewIndex = reviewing ? events.findIndex((e) => e.id === reviewing.id) : -1
  const hasPrevEvent = reviewIndex > 0 || (reviewIndex === 0 && currentPage > 1)
  const hasNextEvent = (reviewIndex >= 0 && reviewIndex < events.length - 1)
    || (reviewIndex === events.length - 1 && currentPage < totalPages)

  const goPrevEvent = () => {
    if (reviewIndex > 0) setReviewing(events[reviewIndex - 1])
    else if (currentPage > 1) {
      pendingPick.current = 'last'
      setPage(currentPage - 1)
    }
  }

  const goNextEvent = () => {
    if (reviewIndex >= 0 && reviewIndex < events.length - 1) setReviewing(events[reviewIndex + 1])
    else if (currentPage < totalPages) {
      pendingPick.current = 'first'
      setPage(currentPage + 1)
    }
  }

  return (
    <div className="page history-page">
      <StatusModal status={status} onClose={closeStatus} />

      <div className="pagehead">
        <div>
          <h1>Event history</h1>
          <div className="sub">Review past detections captured from the CCTV stream · {RANGE_LABEL[dateRange]}</div>
        </div>
        <div className="pagehead-right">
          <SelectDropdown
            value={dateRange}
            onChange={setDateRange}
            options={DATE_OPTIONS}
            minWidth={140}
            ariaLabel="Date range"
          />
          <button type="button" className="chip-btn" onClick={exportCsv} disabled={exporting}>
            <Icon.Download />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="history-summary-grid">
        {SUMMARY_CARDS.map((card) => (
          <StatCard
            key={card.status}
            tone={card.tone}
            icon={card.icon}
            label={card.label}
            value={summary ? (summary[card.key] || 0).toLocaleString() : '—'}
            hint={card.hint(summary)}
          />
        ))}
      </div>

      <div className="panel">
        <div className="filter-bar">
          <label className="history-search">
            <Icon.Search />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <SelectDropdown
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            minWidth={170}
            ariaLabel="Event type filter"
          />
          <SelectDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            minWidth={150}
            ariaLabel="Status filter"
          />
        </div>

        <div className="history-table-wrap">
          <table className="history-table history-events-table">
            <thead>
              <tr>
                <th>Snapshot</th>
                <th>Event</th>
                <th>Camera</th>
                <th>Time</th>
                <th>Status</th>
                <th className="col-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && !events.length ? (
                <tr>
                  <td colSpan={6} className="history-table-note">Loading events…</td>
                </tr>
              ) : events.map((e) => {
                const k = eventKind(e)
                const KindIcon = k.icon
                const st = statusInfo(e)
                return (
                  <tr key={e.id}>
                    <td><EventThumb event={e} kind={k} size="row" /></td>
                    <td>
                      <div className="history-event">
                        <span className={`history-event-icon kind-${k.id}`}><KindIcon /></span>
                        <div>
                          <div className="history-event-title">{e.title}</div>
                          <div className="history-event-meta">
                            {[zoneLabel(e), e.person_id != null ? `Person #${e.person_id}` : null]
                              .filter(Boolean)
                              .join(' · ') || k.label}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="history-camera">
                        <Icon.Camera />
                        {e.camera || '—'}
                      </span>
                    </td>
                    <td>
                      <div className="history-time-date">{formatDate(e.ts)}</div>
                      <div className="history-time-clock">{formatTime(e.ts, true)}</div>
                    </td>
                    <td>
                      <span className={`history-status tone-${st.tone}`}>
                        <span className="history-status-dot" />
                        {st.label}
                      </span>
                    </td>
                    <td className="col-action">
                      <button type="button" className="history-review-btn" onClick={() => setReviewing(e)}>
                        <Icon.Play />
                        Review
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && events.length === 0 ? (
          <EmptyState
            icon={Icon.Camera}
            title="No events found"
            description="No detections match these filters in the selected date range."
          />
        ) : null}

        {total > 0 ? (
          <Pagination
            className="ui-pagination--inset"
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            summary={`Showing ${start}–${end} of ${total.toLocaleString()} events`}
          />
        ) : null}
      </div>

      <SnapshotModal
        event={reviewing}
        events={events}
        onSelect={setReviewing}
        onPrev={goPrevEvent}
        onNext={goNextEvent}
        hasPrev={hasPrevEvent}
        hasNext={hasNextEvent}
        onClose={() => setReviewing(null)}
        onAcknowledge={reviewing?.status === 'pending' ? () => handleAcknowledge(reviewing) : undefined}
      />
    </div>
  )
}
