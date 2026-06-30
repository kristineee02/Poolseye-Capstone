import './LoadingSpinner.css'

export function LoadingSpinner({ size = 'md', fullscreen = false }) {
  return (
    <div className={`spinner-wrapper ${fullscreen ? 'fullscreen' : ''}`}>
      <div className={`spinner spinner-${size}`} aria-label="Loading" />
    </div>
  )
}

export function LoadingBar({ percentage = 0 }) {
  return (
    <div className="loading-bar">
      <div className="loading-bar-fill" style={{ width: `${percentage}%` }} />
    </div>
  )
}

export function ProgressIndicator({ current, total, label }) {
  const percentage = (current / total) * 100
  return (
    <div className="progress-indicator">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percentage}%` }} />
      </div>
      <span className="progress-label">
        {label}: {current} / {total}
      </span>
    </div>
  )
}
