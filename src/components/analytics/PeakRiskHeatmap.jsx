const SCALE = ['#E3F4F6', '#BCE3E8', '#7FC9D2', '#0E94A6', '#B6790A', '#D6364A']

function hourLabel(h) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

export default function PeakRiskHeatmap({ values }) {
  return (
    <>
      <div className="heatmap">
        {values.map((v, i) => (
          <div
            key={i}
            className="hcell"
            title={hourLabel(i)}
            style={{ background: SCALE[Math.min(v, SCALE.length - 1)] }}
          />
        ))}
      </div>
      <div className="heatmap-legend">
        <span>Fewer</span>
        <div className="hl-track">
          {SCALE.map((c) => (
            <div className="hl-cell" key={c} style={{ background: c }} />
          ))}
        </div>
        <span>More</span>
      </div>
    </>
  )
}
