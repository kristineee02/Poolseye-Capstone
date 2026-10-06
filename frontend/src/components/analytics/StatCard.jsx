import { Icon } from '../ui/Icon'
import './StatCard.css'

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
}) {
  const t = trend ? computeTrend(trend) : null
  const TrendIcon = t ? TREND_ICON[t.direction] : null

  return (
    <div className={`stat-card tone-${tone}`}>
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
