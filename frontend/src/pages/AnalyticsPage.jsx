import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { SelectDropdown, MenuDropdown, DropdownItem } from '../components/ui/Dropdown'
import { StatusModal, useStatusModal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import AlertsTimelineChart from '../components/analytics/AlertsTimelineChart'
import PeakRiskHeatmap from '../components/analytics/PeakRiskHeatmap'
import StatCard from '../components/analytics/StatCard'
import { fetchAnalytics } from '../api/events'
import '../components/analytics/Analytics.css'
import '../components/ui/DataTable.css'
import './AnalyticsPage.css'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Icon.BarChart },
  { id: 'response', label: 'Response times', icon: Icon.Clock },
]

const COMPARISON_LABEL = {
  '1d': 'vs. yesterday',
  '7d': 'vs. previous 7 days',
  '30d': 'vs. previous 30 days',
}

const DATE_OPTIONS = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const SEV_CLASS = { HIGH: 'sev-high', MEDIUM: 'sev-medium', LOW: 'sev-low' }

function formatDuration(seconds) {
  if (seconds == null) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

function formatPercent(ratio) {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`
}

function hourRange(h) {
  const fmt = (x) => {
    const hr = x % 24
    if (hr === 0) return '12 AM'
    if (hr < 12) return `${hr} AM`
    if (hr === 12) return '12 PM'
    return `${hr - 12} PM`
  }
  return `${fmt(h)} – ${fmt(h + 1)}`
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function buildCsv(data) {
  const { summary, responseTimes, timeline, byType, byHour, byResponder } = data
  const lines = [
    ['PoolsEye analytics report'],
    ['Range', data.rangeLabel],
    ['Generated', new Date(data.generatedAt * 1000).toLocaleString()],
    [],
    ['Summary'],
    ['Total detections', summary.totalDetections],
    ['Total alerts', summary.totalAlerts],
    ['High-severity alerts', summary.highSeverity],
    ['Acknowledged', summary.acknowledged],
    ['Dismissed (false alarm)', summary.dismissed],
    ['Pending', summary.pending],
    ['Acknowledged rate', formatPercent(summary.acknowledgedRate)],
    ['False alarm rate', formatPercent(summary.falseAlarmRate)],
    [],
    ['Response times'],
    ['Average', formatDuration(responseTimes.average)],
    ['Median', formatDuration(responseTimes.median)],
    ['Fastest', formatDuration(responseTimes.fastest)],
    ['Slowest', formatDuration(responseTimes.slowest)],
    [],
    ['Detections over time'],
    ['Period', 'Total', 'High', 'Medium', 'Low'],
    ...timeline.map((b) => [b.key, b.total, b.HIGH, b.MEDIUM, b.LOW]),
    [],
    ['Detections by type'],
    ['Type', 'Severity', 'Detections', 'Alerts'],
    ...byType.map((t) => [t.title, t.severity, t.count, t.alerts]),
    [],
    ['Alerts by hour of day'],
    ['Hour', 'Alerts'],
    ...byHour.map((count, h) => [hourRange(h), count]),
    [],
    ['Responders'],
    ['Name', 'Role', 'Acknowledged', 'Dismissed', 'Average response', 'Fastest response'],
    ...byResponder.map((r) => [
      r.name,
      r.role || '',
      r.acknowledged,
      r.dismissed,
      formatDuration(r.averageResponse),
      formatDuration(r.fastestResponse),
    ]),
  ]
  return lines.map((row) => row.map(csvCell).join(',')).join('\n')
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [dateRange, setDateRange] = useState('7d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { status, showStatus, closeStatus } = useStatusModal()

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAnalytics(dateRange).then((result) => {
      if (cancelled) return
      if (result.ok) setData(result)
      else setError(result.error || 'Failed to load analytics.')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [dateRange])

  useEffect(() => load(), [load])

  const exportCsv = () => {
    if (!data) return
    const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `poolseye-report-${data.range}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showStatus({ tone: 'success', title: 'Report exported', message: 'The CSV report was downloaded.' })
  }

  const exportPdf = () => {
    if (!data) return
    window.print()
  }

  const summary = data?.summary
  const responseTimes = data?.responseTimes
  const previous = data?.previous
  const comparisonLabel = COMPARISON_LABEL[data?.range] || ''
  const hasData = Boolean(summary?.totalDetections)
  const peakHour = data?.byHour?.some((c) => c > 0)
    ? data.byHour.indexOf(Math.max(...data.byHour))
    : null
  const maxTypeCount = Math.max(1, ...(data?.byType || []).map((t) => t.count))

  return (
    <div className="page analytics-page">
      <StatusModal status={status} onClose={closeStatus} />

      <div className="pagehead">
        <div>
          <h1>Analytics &amp; reports</h1>
          <div className="sub">
            Alerts, peak-risk hours, and lifeguard response times · {data?.rangeLabel || '—'}
          </div>
        </div>
        <div className="pagehead-right analytics-filters">
          <SelectDropdown
            value={dateRange}
            onChange={setDateRange}
            options={DATE_OPTIONS}
            minWidth={140}
            ariaLabel="Date range"
          />
          <MenuDropdown
            align="right"
            minWidth={108}
            ariaLabel="Export report"
            trigger={(
              <>
                <span className="ui-dropdown-trigger-leading"><Icon.Download /></span>
                <span className="ui-dropdown-trigger-label">Export</span>
                <Icon.ChevronDown className="ui-dropdown-chevron" />
              </>
            )}
          >
            <DropdownItem icon={Icon.FileCsv} onClick={exportCsv}>CSV (.csv)</DropdownItem>
            <DropdownItem icon={Icon.FilePdf} onClick={exportPdf}>PDF (print)</DropdownItem>
          </MenuDropdown>
        </div>
      </div>

      <div className="print-only print-header">
        <h2>PoolsEye analytics report</h2>
        <p>
          {data?.rangeLabel} · generated {data ? new Date(data.generatedAt * 1000).toLocaleString() : ''}
        </p>
      </div>

      <div className="analytics-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`analytics-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="panel">
          <EmptyState icon={Icon.AlertCircle} title="Could not load analytics" description={error} />
        </div>
      ) : !data && loading ? (
        <div className="panel analytics-loading">Loading analytics…</div>
      ) : data ? (
        <div className={`analytics-body${loading ? ' is-refreshing' : ''}`}>
          {activeTab === 'overview' && (
            <section className="analytics-section">
              <div className="analytics-summary-grid">
                <StatCard
                  tone="accent"
                  icon={Icon.Bell}
                  label="Total alerts"
                  value={summary.totalAlerts}
                  trend={{ current: summary.totalAlerts, previous: previous?.totalAlerts }}
                  comparisonLabel={comparisonLabel}
                  series={data.timeline.map((b) => b.alerts)}
                />
                <StatCard
                  tone="alarm"
                  icon={Icon.AlertTriangle}
                  label="High-severity alerts"
                  value={summary.highSeverity}
                  trend={{ current: summary.highSeverity, previous: previous?.highSeverity }}
                  comparisonLabel={comparisonLabel}
                  series={data.timeline.map((b) => b.HIGH)}
                />
                <StatCard
                  tone="safe"
                  icon={Icon.CheckCircle}
                  label="Alerts responded to"
                  value={formatPercent(summary.acknowledgedRate)}
                  trend={summary.acknowledgedRate != null ? {
                    current: summary.acknowledgedRate,
                    previous: previous?.acknowledgedRate,
                    mode: 'points',
                    betterWhen: 'up',
                  } : null}
                  comparisonLabel={comparisonLabel}
                  hint={`${summary.pending} still pending`}
                  series={data.timeline.map((b) => b.responded)}
                />
                <StatCard
                  tone="warn"
                  icon={Icon.Clock}
                  label="Average response time"
                  value={formatDuration(responseTimes.average)}
                  trend={responseTimes.average != null ? {
                    current: responseTimes.average,
                    previous: previous?.averageResponse,
                  } : null}
                  comparisonLabel={comparisonLabel}
                  hint={responseTimes.samples
                    ? `From ${responseTimes.samples} acknowledged alert${responseTimes.samples === 1 ? '' : 's'}`
                    : 'No acknowledged alerts yet'}
                  series={data.timeline.map((b) => b.responded)}
                />
              </div>

              {!hasData ? (
                <div className="panel">
                  <EmptyState
                    icon={Icon.Chart}
                    title="No detections in this range"
                    description="Events from the CCTV stream will appear here once the system logs them."
                  />
                </div>
              ) : (
                <>
                  <div className="analytics-grid">
                    <div className="chart-card">
                      <div className="chart-card-head">
                        <h3>Detections over time</h3>
                        <span className="chart-sub">
                          {data.range === '1d' ? 'Per hour, by severity' : 'Per day, by severity'}
                        </span>
                      </div>
                      <AlertsTimelineChart buckets={data.timeline} />
                    </div>

                    <div className="chart-card">
                      <div className="chart-card-head">
                        <h3>Detections by type</h3>
                        <span className="chart-sub">Most frequent first</span>
                      </div>
                      <div className="incident-trend-list">
                        {data.byType.map((t) => (
                          <div key={t.title} className="incident-trend-row">
                            <span className="it-type" title={t.title}>{t.title}</span>
                            <div className="it-bar-track">
                              <div
                                className={`it-bar-fill ${SEV_CLASS[t.severity]}`}
                                style={{ width: `${(t.count / maxTypeCount) * 100}%` }}
                              />
                            </div>
                            <span className="it-count">{t.count}</span>
                            <span className={`sev-pill ${SEV_CLASS[t.severity]}`}>
                              {t.severity.toLowerCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="chart-card">
                    <div className="chart-card-head">
                      <h3>Peak-risk hours</h3>
                      <span className="chart-sub">
                        {peakHour != null
                          ? `Most alerts between ${hourRange(peakHour)} — schedule extra lifeguard coverage`
                          : 'No alerts in this range'}
                      </span>
                    </div>
                    <PeakRiskHeatmap counts={data.byHour} />
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === 'response' && (
            <section className="analytics-section">
              <div className="analytics-summary-grid">
                {[
                  { label: 'Average response', value: responseTimes.average, icon: Icon.Clock, tone: 'warn' },
                  { label: 'Median response', value: responseTimes.median, icon: Icon.Chart, tone: 'accent' },
                  { label: 'Fastest response', value: responseTimes.fastest, icon: Icon.CheckCircle, tone: 'safe' },
                  { label: 'Slowest response', value: responseTimes.slowest, icon: Icon.AlertTriangle, tone: 'alarm' },
                ].map(({ label, value, icon, tone }) => (
                  <StatCard
                    key={label}
                    tone={tone}
                    icon={icon}
                    label={label}
                    value={formatDuration(value)}
                    hint={responseTimes.samples ? `${responseTimes.samples} acknowledged alerts` : 'No acknowledged alerts yet'}
                    series={data.timeline.map((b) => b.responded)}
                  />
                ))}
              </div>

              <div className="analytics-grid analytics-grid-even">
                <div className="chart-card">
                  <div className="chart-card-head">
                    <h3>Alert outcomes</h3>
                    <span className="chart-sub">{summary.totalAlerts} alerts in range</span>
                  </div>
                  <div className="outcome-list">
                    {[
                      { label: 'Acknowledged', value: summary.acknowledged, cls: 'fill-safe' },
                      { label: 'Dismissed (false alarm)', value: summary.dismissed, cls: 'fill-warn' },
                      { label: 'Pending', value: summary.pending, cls: 'fill-alarm' },
                    ].map((o) => (
                      <div key={o.label} className="outcome-row">
                        <span className="outcome-label">{o.label}</span>
                        <div className="it-bar-track">
                          <div
                            className={`it-bar-fill ${o.cls}`}
                            style={{ width: `${summary.totalAlerts ? (o.value / summary.totalAlerts) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="it-count">{o.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="outcome-foot">
                    False alarm rate: <strong>{formatPercent(summary.falseAlarmRate)}</strong> of reviewed alerts
                  </div>
                </div>

                <div className="panel analytics-table-panel">
                  <div className="panel-head"><h3>Response by lifeguard</h3></div>
                  {data.byResponder.length ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Responder</th>
                          <th>Acknowledged</th>
                          <th>Dismissed</th>
                          <th>Avg response</th>
                          <th>Fastest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byResponder.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{r.name}</div>
                              {r.role ? <div className="responder-role">{r.role}</div> : null}
                            </td>
                            <td className="mono" style={{ color: 'var(--safe)' }}>{r.acknowledged}</td>
                            <td className="mono">{r.dismissed}</td>
                            <td className="mono">{formatDuration(r.averageResponse)}</td>
                            <td className="mono">{formatDuration(r.fastestResponse)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState
                      icon={Icon.Users}
                      title="No responses recorded yet"
                      description="Response times are tracked when a lifeguard or admin acknowledges an alert."
                    />
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  )
}
