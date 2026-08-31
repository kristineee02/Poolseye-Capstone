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

function NavItemButton({ label, active, onClick, children, className = '' }) {
  return (
    <div className="navitem-wrap">
      <button
        type="button"
        className={`navitem ${active ? 'active' : ''} ${className}`.trim()}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
      >
        {children}
      </button>
      <span className="navitem-tooltip">{label}</span>
    </div>
  )
}

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
            <NavItemButton
              key={id}
              label={label}
              active={activePage === id}
              onClick={() => onNavigate(id)}
            >
              <ItemIcon />
            </NavItemButton>
          ))}
        </div>
      </div>

      <div className="navrail-footer">
        <NavItemButton
          label="Settings"
          active={activePage === 'settings'}
          onClick={() => onNavigate('settings')}
        >
          <Icon.Settings />
        </NavItemButton>
        <NavItemButton
          label="Sign out"
          className="navitem-logout"
          onClick={onRequestSignOut}
        >
          <Icon.LogOut />
        </NavItemButton>
      </div>
    </nav>
  )
}
