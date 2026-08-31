import { useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { SelectDropdown, MenuDropdown, DropdownItem } from '../components/ui/Dropdown'
import { useToast, ToastContainer } from '../components/ui/Toast'
import WeeklyBarChart from '../components/analytics/WeeklyBarChart'
import FalsePositiveLineChart from '../components/analytics/FalsePositiveLineChart'
import PeakRiskHeatmap from '../components/analytics/PeakRiskHeatmap'
import { weeklyDetections, falsePositiveTrend, peakRiskHours } from '../data/analytics'
import { reportingMetrics } from '../data/reporting'
import { cameras } from '../data/cameras'
import { lifeguards } from '../data/lifeguards'
import '../components/analytics/Analytics.css'
import './AnalyticsPage.css'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'detections', label: 'Detections' },
  { id: 'response', label: 'Response times' },
  { id: 'cameras', label: 'Camera activity' },
  { id: 'accuracy', label: 'Accuracy' },
]

const DATE_OPTIONS = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'This year' },
]

const EXPORT_OPTIONS = [
  { id: 'xlsx', label: 'Excel (.xlsx)', format: 'xlsx', Icon: Icon.FileExcel },
  { id: 'pdf', label: 'PDF (.pdf)', format: 'pdf', Icon: Icon.FilePdf },
  { id: 'csv', label: 'CSV (.csv)', format: 'csv', Icon: Icon.FileCsv },
]

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [dateRange, setDateRange] = useState('7d')
  const [filterCamera, setFilterCamera] = useState('all')
  const [filterLifeguard, setFilterLifeguard] = useState('all')
  const { toasts, addToast, removeToast } = useToast()

  const cameraOptions = [
    { value: 'all', label: 'All cameras' },
    ...cameras.map((c) => ({ value: c.id, label: c.name })),
  ]

  const lifeguardOptions = [
    { value: 'all', label: 'All lifeguards' },
    ...lifeguards.map((lg) => ({ value: lg.id, label: lg.name })),
  ]

  const handleExport = (format) => {
    addToast(`Exporting report as ${format.toUpperCase()}…`, 'info')
    setTimeout(() => addToast(`Report exported as ${format.toUpperCase()} successfully`, 'success'), 1200)
  }

  const { detectionsSummary, alertResponseTimes, cameraActivity, detectionAccuracy, peakMonitoringHours } = reportingMetrics

  return (
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="pagehead">
        <div>
          <h1>Analytics &amp; reports</h1>
          <div className="sub">Detection trends, response times, and system performance</div>
        </div>
        <div className="pagehead-right analytics-filters">
          <SelectDropdown
            value={dateRange}
            onChange={setDateRange}
            options={DATE_OPTIONS}
            minWidth={140}
            ariaLabel="Date range"
          />
          <SelectDropdown
            value={filterCamera}
            onChange={setFilterCamera}
            options={cameraOptions}
            minWidth={140}
            ariaLabel="Camera filter"
          />
          <SelectDropdown
            value={filterLifeguard}
            onChange={setFilterLifeguard}
            options={lifeguardOptions}
            minWidth={148}
            ariaLabel="Lifeguard filter"
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
            {EXPORT_OPTIONS.map((option) => (
              <DropdownItem
                key={option.id}
                icon={option.Icon}
                onClick={() => handleExport(option.format)}
              >
                {option.label}
              </DropdownItem>
            ))}
          </MenuDropdown>
        </div>
      </div>

      {/* Tabs */}
      <div className="analytics-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`analytics-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <>
          <div className="analytics-summary-grid">
            <div className="summary-stat-card">
              <div className="ss-icon safe"><Icon.Check /></div>
              <div className="ss-val">{detectionsSummary.confirmed}</div>
              <div className="ss-label">Confirmed detections</div>
            </div>
            <div className="summary-stat-card">
              <div className="ss-icon alarm"><Icon.AlertTriangle /></div>
              <div className="ss-val">{detectionsSummary.falsePositives}</div>
              <div className="ss-label">False positives</div>
            </div>
            <div className="summary-stat-card">
              <div className="ss-icon accent"><Icon.Clock /></div>
              <div className="ss-val">{alertResponseTimes.average}</div>
              <div className="ss-label">Avg response time</div>
            </div>
            <div className="summary-stat-card">
              <div className="ss-icon warn"><Icon.Camera /></div>
              <div className="ss-val">{cameraActivity.uptimePercentage}%</div>
              <div className="ss-label">Camera uptime</div>
            </div>
          </div>

          <div className="analytics-grid">
            <div className="chart-card">
              <div className="chart-card-head">
                <h3>Detections per week</h3>
                <span className="chart-sub">Unsupervised intrusions flagged</span>
              </div>
              <WeeklyBarChart data={weeklyDetections} />
            </div>
            <div className="chart-card">
              <div className="chart-card-head">
                <h3>False positive rate</h3>
                <span className="chart-sub">Trending down over 8 weeks</span>
              </div>
              <FalsePositiveLineChart data={falsePositiveTrend} />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3>Peak-risk hours</h3>
              <span className="chart-sub">Detection frequency by hour of day</span>
            </div>
            <PeakRiskHeatmap values={peakRiskHours} />
          </div>
        </>
      )}

      {/* ── DETECTIONS ── */}
      {activeTab === 'detections' && (
        <>
          <div className="analytics-grid">
            <div className="chart-card">
              <div className="chart-card-head">
                <h3>Daily detections (last 7 days)</h3>
                <span className="chart-sub">Confirmed vs. false positives</span>
              </div>
              <div className="detection-bar-chart">
                {detectionsSummary.byDay.map((d) => (
                  <div key={d.date} className="det-bar-group">
                    <div className="det-bars">
                      <div className="det-bar confirmed" style={{ height: `${(d.confirmed / 55) * 100}%` }} title={`Confirmed: ${d.confirmed}`} />
                      <div className="det-bar fp" style={{ height: `${(d.falsePositives / 55) * 100}%` }} title={`False pos: ${d.falsePositives}`} />
                    </div>
                    <div className="det-bar-label">{new Date(d.date).toLocaleDateString('en', { weekday: 'short' })}</div>
                    <div className="det-bar-count">{d.count}</div>
                  </div>
                ))}
              </div>
              <div className="chart-legend">
                <span className="legend-item confirmed">Confirmed</span>
                <span className="legend-item fp">False positive</span>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-card-head">
                <h3>Incident trends</h3>
                <span className="chart-sub">Severity over the past 7 days</span>
              </div>
              <div className="incident-trend-list">
                {reportingMetrics.incidentTrends.map((t) => (
                  <div key={t.date} className="incident-trend-row">
                    <span className="it-date">{new Date(t.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                    <div className="it-bar-track">
                      <div className={`it-bar-fill sev-${t.severity}`} style={{ width: `${(t.incidents / 45) * 100}%` }} />
                    </div>
                    <span className="it-count">{t.incidents}</span>
                    <span className={`sev-pill sev-${t.severity}`}>{t.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── RESPONSE TIMES ── */}
      {activeTab === 'response' && (
        <>
          <div className="analytics-summary-grid">
            {[
              { label: 'Average', value: alertResponseTimes.average, icon: Icon.Clock },
              { label: 'Median', value: alertResponseTimes.median, icon: Icon.Chart },
              { label: 'Fastest', value: alertResponseTimes.fastest, icon: Icon.Check },
              { label: 'Slowest', value: alertResponseTimes.slowest, icon: Icon.AlertTriangle },
            ].map(({ label, value, icon: SIcon }) => (
              <div key={label} className="summary-stat-card">
                <div className="ss-icon accent"><SIcon /></div>
                <div className="ss-val">{value}</div>
                <div className="ss-label">{label} response</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Response time by lifeguard</h3></div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lifeguard</th>
                  <th>Avg response</th>
                  <th>Acknowledged</th>
                  <th>Missed</th>
                  <th>Performance</th>
                </tr>
              </thead>
              <tbody>
                {alertResponseTimes.byLifeguard.map((row) => {
                  const pct = Math.max(0, 100 - (parseFloat(row.avg) / 50) * 100)
                  return (
                    <tr key={row.lifeguardId}>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{row.avg}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--safe)' }}>{row.acknowledged}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: row.missed > 0 ? 'var(--alarm)' : 'var(--text-secondary)' }}>{row.missed}</td>
                      <td style={{ minWidth: 120 }}>
                        <div className="bar-track" style={{ marginTop: 0 }}>
                          <div className="bar-fill fill-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── CAMERA ACTIVITY ── */}
      {activeTab === 'cameras' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Camera activity &amp; detection frequency</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Total frames processed: {cameraActivity.totalFramesProcessed.toLocaleString()} · Avg inference: {cameraActivity.averageInferenceTime}
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Camera</th>
                <th>Detections (month)</th>
                <th>Uptime</th>
                <th>Avg confidence</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {cameraActivity.byCamera.map((row) => {
                const pct = (row.detections / 200) * 100
                return (
                  <tr key={row.cameraId}>
                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{row.detections}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{row.uptime}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{row.confidence}</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="bar-track" style={{ marginTop: 0 }}>
                        <div className="bar-fill fill-accent" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ACCURACY ── */}
      {activeTab === 'accuracy' && (
        <>
          <div className="analytics-summary-grid">
            {Object.entries(detectionAccuracy).map(([key, val]) => (
              <div key={key} className="summary-stat-card">
                <div className="ss-icon accent"><Icon.Aperture /></div>
                <div className="ss-val">{val.accuracy || '—'}</div>
                <div className="ss-label">{key.replace(/([A-Z])/g, ' $1').trim()} accuracy</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {val.detected} detected{val.correct ? ` · ${val.correct} correct` : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3>Peak monitoring hours</h3>
              <span className="chart-sub">Detection count by hour of day</span>
            </div>
            <div className="peak-hour-chart">
              {peakMonitoringHours.map((h) => (
                <div key={h.hour} className="peak-hour-bar">
                  <div
                    className="peak-hour-fill"
                    style={{ height: `${(h.detections / 35) * 100}%` }}
                    title={`${h.hour}: ${h.detections} detections`}
                  />
                  <div className="peak-hour-label">{h.hour.split(':')[0]}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
