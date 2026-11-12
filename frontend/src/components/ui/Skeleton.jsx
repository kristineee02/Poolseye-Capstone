import { useEffect, useState } from 'react'
import './Skeleton.css'

const SLOW_LOADING_MS = 6000

export function useSlowLoading(loading, delay = SLOW_LOADING_MS) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    setSlow(false)
    if (!loading) return undefined
    const timer = setTimeout(() => setSlow(true), delay)
    return () => clearTimeout(timer)
  }, [loading, delay])

  return slow
}

export function Skeleton({ className = '', width, height, circle = false }) {
  return (
    <span
      className={`skeleton${circle ? ' skeleton-circle' : ''}${className ? ` ${className}` : ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

export function LoadingHint({ loading = true, onRetry, delay = SLOW_LOADING_MS, compact = false }) {
  const slow = useSlowLoading(loading, delay)
  if (!slow) return null
  return (
    <div className={`loading-hint${compact ? ' is-compact' : ''}`} role="status" aria-live="polite">
      <span>Taking longer than usual. Please check your connection.</span>
      {onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}
    </div>
  )
}

export function AnalyticsSkeleton({ onRetry }) {
  return (
    <div className="skeleton-page" role="status" aria-label="Loading analytics">
      <div className="skeleton-stat-grid">
        {Array.from({ length: 5 }, (_, i) => (
          <div className="skeleton-card" key={i}>
            <Skeleton circle width={36} height={36} />
            <Skeleton width="58%" height={11} />
            <Skeleton width="38%" height={27} />
          </div>
        ))}
      </div>
      <div className="skeleton-chart-grid">
        {Array.from({ length: 2 }, (_, i) => (
          <div className="skeleton-card skeleton-chart" key={i}>
            <Skeleton width="42%" height={16} />
            <Skeleton width="100%" height={180} />
          </div>
        ))}
      </div>
      <LoadingHint onRetry={onRetry} />
    </div>
  )
}

export function TableSkeleton({ rows = 5, columns = 5, onRetry }) {
  return (
    <div className="skeleton-table" style={{ '--skeleton-columns': columns }} role="status" aria-label="Loading data">
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-table-row" key={row}>
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton key={col} width={col === 0 ? '72%' : `${52 + ((row + col) % 4) * 10}%`} height={12} />
          ))}
        </div>
      ))}
      <LoadingHint onRetry={onRetry} compact />
    </div>
  )
}

export function CardListSkeleton({ rows = 4, onRetry }) {
  return (
    <div className="skeleton-list" role="status" aria-label="Loading items">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-list-row" key={i}>
          <Skeleton circle width={42} height={42} />
          <span className="skeleton-list-copy">
            <Skeleton width={`${62 + (i % 2) * 14}%`} height={13} />
            <Skeleton width="45%" height={10} />
          </span>
        </div>
      ))}
      <LoadingHint onRetry={onRetry} compact />
    </div>
  )
}

export function SettingsCardSkeleton({ rows = 3, onRetry }) {
  return (
    <div className="skeleton-settings" role="status" aria-label="Loading settings">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-setting-row" key={i}>
          <Skeleton width={i % 2 ? '34%' : '45%'} height={12} />
          <Skeleton width="100%" height={38} />
        </div>
      ))}
      <LoadingHint onRetry={onRetry} compact />
    </div>
  )
}
