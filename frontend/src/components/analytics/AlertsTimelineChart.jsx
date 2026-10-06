const SEGMENTS = [
  { key: 'LOW', className: 'sev-low', label: 'Low' },
  { key: 'MEDIUM', className: 'sev-medium', label: 'Medium' },
  { key: 'HIGH', className: 'sev-high', label: 'High' },
]

export default function AlertsTimelineChart({ buckets }) {
  const max = Math.max(1, ...buckets.map((b) => b.total))
  const dense = buckets.length > 14

  return (
    <>
      <div className={`timeline-chart${dense ? ' is-dense' : ''}`}>
        {buckets.map((b, i) => (
          <div className="tl-col" key={b.key}>
            {!dense ? <span className="tl-val">{b.total || ''}</span> : null}
            <div
              className="tl-stack"
              style={{ height: `${(b.total / max) * 100}%` }}
              title={`${b.label}: ${b.total} total · ${b.HIGH} high · ${b.MEDIUM} medium · ${b.LOW} low`}
            >
              {SEGMENTS.map((s) =>
                b[s.key] ? (
                  <div
                    key={s.key}
                    className={`tl-seg ${s.className}`}
                    style={{ flexGrow: b[s.key] }}
                  />
                ) : null,
              )}
            </div>
            <span className="tl-label">{!dense || i % 3 === 0 ? b.label : ''}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        {[...SEGMENTS].reverse().map((s) => (
          <span key={s.key} className={`legend-item ${s.className}`}>{s.label}</span>
        ))}
      </div>
    </>
  )
}
