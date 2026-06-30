import './EmptyState.css'
import { Icon } from './Icon'

export function EmptyState({ icon: IconComponent = null, title, description, action = null }) {
  return (
    <div className="empty-state">
      {IconComponent && (
        <div className="empty-state-icon">
          <IconComponent />
        </div>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
