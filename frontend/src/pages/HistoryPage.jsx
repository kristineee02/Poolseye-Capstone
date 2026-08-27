import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import Pagination from '../components/ui/Pagination'
import SnapshotThumb from '../components/history/SnapshotThumb'
import SnapshotModal from '../components/history/SnapshotModal'
import { events } from '../data/events'
import '../components/history/HistoryTable.css'

const TYPE_LABEL = { alarm: 'Alarm', safe: 'Safe', warn: 'Warning', info: 'Info' }
const TYPE_TAG = { alarm: 'tag-alarm', safe: 'tag-safe', warn: 'tag-info', info: 'tag-info' }
const STATUS_TAG = { resolved: 'tag-safe', pending: 'tag-warn', dismissed: 'tag-info' }
const STATUS_LABEL = { resolved: 'ACK', pending: 'NEW', dismissed: 'Dismissed' }
const PAGE_SIZE = 4

export default function HistoryPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reviewing, setReviewing] = useState(null)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [search, typeFilter, statusFilter])

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const end = Math.min(currentPage * PAGE_SIZE, filtered.length)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Event history</h1>
          <div className="sub">Search and review every detection, with the frame captured at the time of the event</div>
        </div>
        <div className="pagehead-right">
          <button className="chip-btn">
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
          <select className="field-input" disabled defaultValue="all">
            <option value="all">All cameras</option>
          </select>
          <select className="field-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All alerts</option>
            <option value="alarm">High severity</option>
            <option value="warn">Warnings</option>
            <option value="info">Deep-water / info</option>
          </select>
          <select className="field-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">New</option>
            <option value="resolved">Acknowledged</option>
          </select>
          <select className="field-input" disabled defaultValue="7">
            <option value="7">Last 7 days</option>
          </select>
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
            {pageItems.map((e) => (
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
                <td><button className="row-link" onClick={() => setReviewing(e)}>Review →</button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '28px 0' }}>
                  No events match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filtered.length > 0 ? (
          <Pagination
            className="ui-pagination--inset"
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            summary={`Showing ${start}–${end} of ${filtered.length} events`}
          />
        ) : null}
      </div>

      <SnapshotModal event={reviewing} onClose={() => setReviewing(null)} />
    </div>
  )
}
