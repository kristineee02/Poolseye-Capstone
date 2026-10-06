import Logo from '../ui/Logo'
import './NavRail.css'

const NAV_ITEMS = [
  { id: 'live',       label: 'Live monitoring',     icon: 'dashboard.png' },
  { id: 'geofence',   label: 'Geofence editor',     icon: 'map.png' },
  { id: 'lifeguards', label: 'Lifeguard accounts',  icon: 'people.svg' },
  { id: 'history',    label: 'Event history',       icon: 'events.png' },
  { id: 'analytics',  label: 'Analytics & reports', icon: 'analytics.png' },
]

function NavIcon({ file }) {
  return (
    <span
      className="navitem-icon"
      style={{ '--nav-icon': `url(/icons/nav/${file})` }}
      aria-hidden="true"
    />
  )
}

function NavItemButton({ label, icon, active, onClick, className = '' }) {
  return (
    <div className="navitem-wrap">
      <button
        type="button"
        className={`navitem ${active ? 'active' : ''} ${className}`.trim()}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
      >
        <NavIcon file={icon} />
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
          {NAV_ITEMS.map((item) => (
            <NavItemButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={activePage === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </div>
      </div>

      <div className="navrail-footer">
        <NavItemButton
          label="Settings"
          icon="settings.png"
          active={activePage === 'settings'}
          onClick={() => onNavigate('settings')}
        />
        <NavItemButton
          label="Sign out"
          icon="logout.png"
          className="navitem-logout"
          onClick={onRequestSignOut}
        />
      </div>
    </nav>
  )
}
