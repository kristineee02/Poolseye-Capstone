export default function FalsePositiveLineChart({ data }) {
  const w = 300
  const h = 160
  const padTop = 24
  const padBottom = 28
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 20) + 10
    const y = padTop + ((max - v) / range) * (h - padTop - padBottom - 6) + 6
    return { x, y }
  })

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const last = points[points.length - 1]

  return (
    <div className="line-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        <polyline points={polylinePoints} fill="none" stroke="#D6364A" strokeWidth="2.5" />
        <circle cx={last.x} cy={last.y} r="4" fill="#D6364A" />
        <text x={Math.min(last.x - 30, w - 40)} y={Math.max(last.y - 10, 14)} fill="#D6364A" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="700">
          {data[data.length - 1]}%
        </text>
        <text x="6" y="16" fill="#9AA1B0" fontFamily="Roboto Mono, monospace" fontSize="10">
          {max}%
        </text>
        <line x1="0" y1={h - padBottom + 2} x2={w} y2={h - padBottom + 2} stroke="#E7E9EE" strokeWidth="1" />
        <text x="10" y={h - 6} fill="#9AA1B0" fontFamily="Roboto Mono, monospace" fontSize="9">
          W1
        </text>
        <text x={w - 26} y={h - 6} fill="#9AA1B0" fontFamily="Roboto Mono, monospace" fontSize="9">
          W{data.length}
        </text>
      </svg>
    </div>
  )
}
