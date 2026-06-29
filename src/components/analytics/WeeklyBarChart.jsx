export default function WeeklyBarChart({ data }) {
  const max = Math.max(...data.map((d) => d.value))

  return (
    <div className="bar-chart">
      {data.map((d, i) => {
        const isLast = i === data.length - 1
        const heightPct = Math.max(8, (d.value / max) * 100)
        return (
          <div className="bcol" key={d.label}>
            <span className="bval">{d.value}</span>
            <div
              className={`bar ${isLast ? 'highlight' : ''}`}
              style={{ height: `${heightPct}%` }}
            />
            <span className="blabel">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}
