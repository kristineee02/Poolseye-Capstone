export default function KpiCard({ label, value, unit, trend, trendDir, fill, color }) {
  return (
    <div className="kpi-card">
      <div className="label">
        <span>{label}</span>
        <span className={`trend ${trendDir}`}>{trend}</span>
      </div>
      <div className="value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="bar-track">
        <div className={`bar-fill fill-${color}`} style={{ width: `${fill}%` }} />
      </div>
    </div>
  )
}
