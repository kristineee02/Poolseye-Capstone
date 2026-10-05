import { useId } from 'react'
import { Icon } from '../ui/Icon'
import './StatCard.css'

const PLACEHOLDER_SERIES = [3, 4.5, 3.8, 5.6, 4.6, 6.4, 5.4, 7]

function sparkPath(series, width, height) {
  const values = series.length >= 2 && series.some((v) => v > 0) ? series : PLACEHOLDER_SERIES
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((v, i) => [i * step, height - 4 - ((v - min) / span) * (height * 0.7)])

  let line = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const cx = (x0 + x1) / 2
    line += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`
  }
  return { line, area: `${line} L ${width} ${height} L 0 ${height} Z` }
}

function Sparkline({ series }) {
  const gradientId = useId()
  const { line, area } = sparkPath(series, 120, 48)
  return (
    <svg className="stat-card-spark" viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  )
}

function computeTrend({ current, previous, mode = 'percent', betterWhen = 'down' }) {
  if (current == null || previous == null) return null
  let delta
  let text
  if (mode === 'points') {
    delta = Math.round((current - previous) * 100)
    text = `${Math.abs(delta)} pts`
  } else if (previous === 0) {
    delta = current === 0 ? 0 : 100
    text = current === 0 ? '0%' : 'New'
  } else {
    delta = Math.round(((current - previous) / previous) * 100)
    text = `${Math.abs(delta)}%`
  }

  if (delta === 0) return { direction: 'flat', tone: 'neutral', text }
  const direction = delta > 0 ? 'up' : 'down'
  const good = direction === betterWhen
  return { direction, tone: good ? 'good' : 'bad', text }
}

const TREND_ICON = { up: Icon.ArrowUp, down: Icon.ArrowDown, flat: Icon.Minus }

export default function StatCard({
  tone = 'accent',
  icon: CardIcon,
  label,
  value,
  trend,
  comparisonLabel,
  hint,
  series = [],
}) {
  const t = trend ? computeTrend(trend) : null
  const TrendIcon = t ? TREND_ICON[t.direction] : null

  return (
    <div className={`stat-card tone-${tone}`}>
      <Sparkline series={series} />
      <div className="stat-card-icon">
        <CardIcon />
      </div>
      <div className="stat-card-body">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value">{value}</div>
        {t ? (
          <div className="stat-card-trend">
            <span className={`stat-card-delta is-${t.tone}`}>
              <TrendIcon />
              {t.text}
            </span>
            <span className="stat-card-compare">{comparisonLabel}</span>
          </div>
        ) : null}
        {hint ? <div className="stat-card-hint">{hint}</div> : null}
      </div>
    </div>
  )
}
