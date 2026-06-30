import { Icon } from '../ui/Icon'
import './NavRail.css'

const NAV_ITEMS = [
  { id: 'live',       label: 'Live monitoring',          icon: Icon.Grid    },
  { id: 'geofence',   label: 'Geofence editor',          icon: Icon.Fence   },
  { id: 'cameras',    label: 'IP Cameras',                icon: Icon.Camera  },
  { id: 'lifeguards', label: 'Lifeguard accounts',        icon: Icon.Users   },
  { id: 'history',    label: 'Event history',             icon: Icon.Clock   },
  { id: 'analytics',  label: 'Analytics & reports',       icon: Icon.Chart   },
]

export default function NavRail({ activePage, onNavigate }) {
  return (
    <nav className="navrail">
      {NAV_ITEMS.map(({ id, label, icon: ItemIcon, hasBadge }) => (
        <button
          key={id}
          className={`navitem ${activePage === id ? 'active' : ''}`}
          title={label}
          aria-label={label}
          aria-current={activePage === id ? 'page' : undefined}
          onClick={() => onNavigate(id)}
        >
          <ItemIcon />
          {hasBadge && <span className="badge" />}
        </button>
      ))}
      <div className="spacer" />
      <button className="navitem" title="Settings" aria-label="Settings">
        <Icon.Settings />
      </button>
    </nav>
  )
}
