import WeeklyBarChart from '../components/analytics/WeeklyBarChart'
import FalsePositiveLineChart from '../components/analytics/FalsePositiveLineChart'
import PeakRiskHeatmap from '../components/analytics/PeakRiskHeatmap'
import { metricStrip, weeklyDetections, falsePositiveTrend, peakRiskHours } from '../data/analytics'
import '../components/analytics/Analytics.css'

export default function AnalyticsPage() {
  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Analytics</h1>
          <div className="sub">Model performance and detection trends for stakeholder reporting</div>
        </div>
        <div className="pagehead-right">
          <select className="field-input" style={{ width: 'auto' }} defaultValue="8w">
            <option value="8w">Last 8 weeks</option>
            <option value="6m">Last 6 months</option>
          </select>
        </div>
      </div>

      <div className="metric-strip">
        {metricStrip.map((m) => (
          <div className="kpi-card" key={m.label}>
            <div className="label">
              <span>{m.label}</span>
              <span className="trend up">{m.trend}</span>
            </div>
            <div className="value">
              {m.value}
              <small>{m.unit}</small>
            </div>
          </div>
        ))}
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
            <span className="chart-sub">Trending down</span>
          </div>
          <FalsePositiveLineChart data={falsePositiveTrend} />
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-head">
          <h3>Peak-risk hours</h3>
          <span className="chart-sub">Unsupervised intrusion frequency by hour, last 8 weeks</span>
        </div>
        <PeakRiskHeatmap values={peakRiskHours} />
      </div>
    </div>
  )
}
