import { useAuth } from '../../auth/AuthContext'
import { site } from '../../data/site'
import { Icon } from '../ui/Icon'
import NotificationMenu from './NotificationMenu'
import './Topbar.css'

export default function Topbar({ onNavigate, onRequestSignOut }) {
  const { user } = useAuth()

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-item topbar-item--site">
          <span className="status-dot safe" aria-hidden="true" />
          <span className="topbar-item-text">{site.name}</span>
          <Icon.ChevronDown />
        </span>
      </div>

      <div className="topbar-right">
        <NotificationMenu onNavigate={onNavigate} />

        <button
          type="button"
          className="topbar-user"
          title={`${user.name} — sign out`}
          onClick={onRequestSignOut}
        >
          <span className="topbar-avatar">
            {user.photoUri ? <img src={user.photoUri} alt="" className="topbar-avatar-img" /> : user.initials}
          </span>
          <span className="topbar-user-copy">
            <span className="topbar-user-name">{user.name}</span>
            <span className="topbar-user-role">{user.position || 'Site Admin'}</span>
          </span>
          <Icon.ChevronDown />
        </button>
      </div>
    </header>
  )
}
