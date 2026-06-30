import { useMemo, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import SnapshotThumb from '../components/history/SnapshotThumb'
import SnapshotModal from '../components/history/SnapshotModal'
import { events } from '../data/events'
import '../components/history/HistoryTable.css'

const TYPE_LABEL = { alarm: 'Intrusion', safe: 'Supervised', warn: 'PIR', info: 'System' }
const TYPE_TAG = { alarm: 'tag-alarm', safe: 'tag-safe', warn: 'tag-info', info: 'tag-info' }
const STATUS_TAG = { resolved: 'tag-safe', pending: 'tag-warn', dismissed: 'tag-info' }

export default function HistoryPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reviewing, setReviewing] = useState(null)

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [search, typeFilter, statusFilter])

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
            <option value="all">All event types</option>
            <option value="alarm">Unsupervised intrusion</option>
            <option value="safe">Supervised access</option>
            <option value="warn">PIR trigger</option>
            <option value="info">System</option>
          </select>
          <select className="field-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
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
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="thumb-cell">
                  <SnapshotThumb type={e.type} />
                  <span className={`tag ${TYPE_TAG[e.type]}`}>{TYPE_LABEL[e.type]}</span>
                </td>
                <td>{e.title}</td>
                <td className="mono">{e.camera}</td>
                <td className="mono">{e.confidence ?? '—'}</td>
                <td className="mono">{e.date}, {e.time}</td>
                <td><span className={`tag ${STATUS_TAG[e.status]}`}>{e.status[0].toUpperCase() + e.status.slice(1)}</span></td>
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

        <div className="pagination">
          <span>Showing {filtered.length} of {events.length} events</span>
          <div className="page-btns">
            <div className="page-btn active">1</div>
            <div className="page-btn">2</div>
            <div className="page-btn">3</div>
            <div className="page-btn">…</div>
            <div className="page-btn">24</div>
          </div>
        </div>
      </div>

      <SnapshotModal event={reviewing} onClose={() => setReviewing(null)} />
    </div>
  )
}
