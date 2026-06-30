import './Badge.css'

export function Badge({ label, variant = 'default', icon: Icon = null }) {
  return (
    <span className={`badge badge-${variant}`}>
      {Icon && <Icon />}
      {label}
    </span>
  )
}

export function StatusBadge({ status }) {
  const variants = {
    online: 'success',
    offline: 'error',
    active: 'success',
    inactive: 'neutral',
    pending: 'warning',
    resolved: 'success',
    dismissed: 'neutral',
  }

  const labels = {
    online: 'Online',
    offline: 'Offline',
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    resolved: 'Resolved',
    dismissed: 'Dismissed',
  }

  return <Badge label={labels[status] || status} variant={variants[status] || 'default'} />
}

export function SeverityBadge({ severity }) {
  const variants = {
    low: 'info',
    medium: 'warning',
    high: 'error',
    critical: 'error',
  }

  return <Badge label={severity.charAt(0).toUpperCase() + severity.slice(1)} variant={variants[severity] || 'default'} />
}
