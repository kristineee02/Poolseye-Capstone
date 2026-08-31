import { useEffect, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { SelectDropdown } from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import SnapshotThumb from '../components/history/SnapshotThumb'
import SnapshotModal from '../components/history/SnapshotModal'
import { fetchEvents, fetchEventCameras, updateEventStatus } from '../api/events'
import { useToast, ToastContainer } from '../components/ui/Toast'
import '../components/history/HistoryTable.css'

const TYPE_LABEL = { alarm: 'Alarm', safe: 'Safe', warn: 'Warning', info: 'Info' }
const TYPE_TAG = { alarm: 'tag-alarm', safe: 'tag-safe', warn: 'tag-info', info: 'tag-info' }
const STATUS_TAG = { resolved: 'tag-safe', pending: 'tag-warn', dismissed: 'tag-info' }
const STATUS_LABEL = { resolved: 'ACK', pending: 'NEW', dismissed: 'Dismissed' }
const PAGE_SIZE = 4

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All alerts' },
  { value: 'alarm', label: 'High severity' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Deep-water / info' },
]

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'New' },
  { value: 'resolved', label: 'Acknowledged' },
]

const DATE_FILTER_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
]

export default function HistoryPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [cameraFilter, setCameraFilter] = useState('all')
  const [cameras, setCameras] = useState([])
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(null)
  const [page, setPage] = useState(1)
  const { toasts, addToast, removeToast } = useToast()

  useEffect(() => {
    fetchEventCameras().then((result) => {
      if (result.ok && Array.isArray(result.cameras)) {
        setCameras(result.cameras)
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetchEvents({
      search,
      type: typeFilter,
      status: statusFilter,
      camera: cameraFilter,
      page,
      pageSize: PAGE_SIZE,
    }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setEvents([])
        setTotal(0)
        setTotalPages(1)
        addToast(result.error || 'Failed to load events', 'warning')
        return
      }
      setEvents(result.events || [])
      setTotal(result.total || 0)
      setTotalPages(result.totalPages || 1)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [search, typeFilter, statusFilter, cameraFilter, page])

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, statusFilter, cameraFilter])

  const currentPage = Math.min(page, totalPages)
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const end = Math.min(currentPage * PAGE_SIZE, total)

  const handleAcknowledge = async (event) => {
    const result = await updateEventStatus(event.id, 'resolved')
    if (!result.ok) {
      addToast(result.error || 'Failed to update event', 'warning')
      return
    }
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, status: 'resolved' } : e))
    )
    setReviewing((prev) =>
      prev?.id === event.id ? { ...prev, status: 'resolved' } : prev
    )
    addToast('Event acknowledged', 'success')
  }

  const exportCsv = () => {
    if (!events.length) {
      addToast('No events to export on this page.', 'info')
      return
    }
    const header = ['ID', 'Title', 'Type', 'Camera', 'Confidence', 'Date', 'Time', 'Status']
    const rows = events.map((e) => [
      e.id,
      e.title,
      e.type,
      e.camera,
      e.confidence ?? '',
      e.date,
      e.time,
      e.status,
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'poolseye-events.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="pagehead">
        <div>
          <h1>Event history</h1>
          <div className="sub">Search and review every detection, with the frame captured at the time of the event</div>
        </div>
        <div className="pagehead-right">
          <button type="button" className="chip-btn" onClick={exportCsv}>
            <Icon.Download />
            Export CSV
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="filter-bar">
          <input
            className="field-input filter-search"
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SelectDropdown
            value={cameraFilter}
            onChange={setCameraFilter}
            options={[
              { value: 'all', label: 'All cameras' },
              ...cameras.map((cam) => ({ value: cam, label: cam })),
            ]}
            minWidth={140}
            ariaLabel="Camera filter"
          />
          <SelectDropdown
            value={typeFilter}
            onChange={setTypeFilter}
            options={TYPE_FILTER_OPTIONS}
            minWidth={148}
            ariaLabel="Alert type filter"
          />
          <SelectDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTER_OPTIONS}
            minWidth={140}
            ariaLabel="Status filter"
          />
          <SelectDropdown
            value="7"
            onChange={() => {}}
            options={DATE_FILTER_OPTIONS}
            minWidth={140}
            disabled
            ariaLabel="Date range"
          />
        </div>

        <table className="history-table">
          <thead>
            <tr>
              <th>Snapshot</th>
              <th>Event</th>
              <th>Camera</th>
              <th>Confidence</th>
              <th>Timestamp</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '28px 0' }}>
                  Loading events…
                </td>
              </tr>
            ) : events.map((e) => (
              <tr key={e.id}>
                <td className="thumb-cell">
                  <SnapshotThumb type={e.type} />
                  <span className={`tag ${TYPE_TAG[e.type]}`}>{TYPE_LABEL[e.type]}</span>
                </td>
                <td>{e.title}</td>
                <td className="mono">{e.camera}</td>
                <td className="mono">{e.confidence ?? '—'}</td>
                <td className="mono">{e.date}, {e.time}</td>
                <td><span className={`tag ${STATUS_TAG[e.status]}`}>{STATUS_LABEL[e.status] || e.status}</span></td>
                <td><button type="button" className="row-link" onClick={() => setReviewing(e)}>Review →</button></td>
              </tr>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '28px 0' }}>
                  No events match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!loading && total > 0 ? (
          <Pagination
            className="ui-pagination--inset"
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            summary={`Showing ${start}–${end} of ${total} events`}
          />
        ) : null}
      </div>

      <SnapshotModal
        event={reviewing}
        onClose={() => setReviewing(null)}
        onAcknowledge={reviewing?.status === 'pending' ? () => handleAcknowledge(reviewing) : undefined}
      />
    </div>
  )
}
