import './PeakRiskHeatmap.css'

function hourLabel(h) {
  if (h === 0)  return '12am'
  if (h < 12)  return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function riskColor(v) {
  if (v === 0) return 'var(--bg-inset)'
  if (v <= 1)  return 'var(--accent-tint)'
  if (v <= 2)  return '#7FC9D2'
  if (v <= 3)  return 'var(--accent)'
  if (v <= 4)  return 'var(--warn)'
  return 'var(--alarm)'
}

function riskLabel(v) {
  if (v === 0) return 'None'
  if (v <= 1)  return 'Very low'
  if (v <= 2)  return 'Low'
  if (v <= 3)  return 'Moderate'
  if (v <= 4)  return 'High'
  return 'Peak'
}

const LEGEND = [
  { color: 'var(--bg-inset)',    label: 'None'     },
  { color: 'var(--accent-tint)', label: 'Very low' },
  { color: '#7FC9D2',            label: 'Low'      },
  { color: 'var(--accent)',      label: 'Moderate' },
  { color: 'var(--warn)',        label: 'High'     },
  { color: 'var(--alarm)',       label: 'Peak'     },
]

const maxVal = 5

export default function PeakRiskHeatmap({ values }) {
  return (
    <div className="prh-wrapper">
      {/* Bar chart */}
      <div className="prh-chart">
        {values.map((v, i) => (
          <div key={i} className="prh-col">
            <div className="prh-bar-track">
              <div
                className="prh-bar-fill"
                style={{
                  height: v === 0 ? '2px' : `${(v / maxVal) * 100}%`,
                  background: riskColor(v),
                  opacity: v === 0 ? 0.3 : 1,
                }}
                title={`${hourLabel(i)}: ${riskLabel(v)}`}
              />
            </div>
            <div className="prh-label">{hourLabel(i)}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="prh-legend">
        {LEGEND.map(({ color, label }) => (
          <div key={label} className="prh-legend-item">
            <span className="prh-legend-dot" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
