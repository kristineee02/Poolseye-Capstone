import { Icon } from '../ui/Icon'
import Logo from '../ui/Logo'
import './NavRail.css'

const NAV_ITEMS = [
  { id: 'live',       label: 'Live monitoring',     icon: Icon.Grid   },
  { id: 'geofence',   label: 'Geofence editor',     icon: Icon.Fence  },
  { id: 'lifeguards', label: 'Lifeguard accounts',  icon: Icon.Users  },
  { id: 'history',    label: 'Event history',       icon: Icon.Clock  },
  { id: 'analytics',  label: 'Analytics & reports', icon: Icon.Chart  },
]

export default function NavRail({ activePage, onNavigate, onRequestSignOut }) {
  return (
    <nav className="navrail" aria-label="Main navigation">
      <div className="navrail-top">
        <div className="navrail-brand">
          <span className="navrail-mark" aria-hidden="true">
            <Logo size={56} />
          </span>
        </div>

        <div className="navrail-items">
          {NAV_ITEMS.map(({ id, label, icon: ItemIcon }) => (
            <button
              key={id}
              type="button"
              className={`navitem ${activePage === id ? 'active' : ''}`}
              title={label}
              aria-label={label}
              aria-current={activePage === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
            >
              <ItemIcon />
            </button>
          ))}
        </div>
      </div>

      <div className="navrail-footer">
        <button type="button" className="navitem" title="Settings" aria-label="Settings">
          <Icon.Settings />
        </button>
        <button
          type="button"
          className="navitem navitem-logout"
          title="Sign out"
          aria-label="Sign out"
          onClick={onRequestSignOut}
        >
          <Icon.LogOut />
        </button>
      </div>
    </nav>
  )
}
