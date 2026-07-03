import { useAuth } from '../../auth/AuthContext'
import { site } from '../../data/site'
import './Topbar.css'

export default function Topbar() {
  const { user, signOut } = useAuth()

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-item topbar-item--site">
          <span className="status-dot safe" aria-hidden="true" />
          <span className="topbar-item-text">{site.name}</span>
        </span>
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="topbar-avatar"
          title={`${user.name} — sign out`}
          onClick={signOut}
        >
          {user.initials}
        </button>
      </div>
    </header>
  )
}
