import { useState } from 'react'
import Topbar from './components/layout/Topbar'
import NavRail from './components/layout/NavRail'
import RightRail from './components/layout/RightRail'
import { ConfirmModal } from './components/ui/Modal'
import LoginPage from './pages/LoginPage'
import LiveMonitoringPage from './pages/LiveMonitoringPage'
import GeofenceEditorPage from './pages/GeofenceEditorPage'
import CamerasPage from './pages/CamerasPage'
import LifeguardsPage from './pages/LifeguardsPage'
import HistoryPage from './pages/HistoryPage'
import AnalyticsPage from './pages/AnalyticsPage'
import { useAuth } from './auth/AuthContext'

const PAGES = {
  live: LiveMonitoringPage,
  geofence: GeofenceEditorPage,
  cameras: CamerasPage,
  lifeguards: LifeguardsPage,
  history: HistoryPage,
  analytics: AnalyticsPage,
}

export default function App() {
  const { user, ready, signOut } = useAuth()
  const [activePage, setActivePage] = useState('live')
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  if (!ready) return null
  if (!user) return <LoginPage />

  const ActivePageComponent = PAGES[activePage]
  const showRightRail = activePage === 'live'
  const requestSignOut = () => setShowLogoutModal(true)

  return (
    <div className="shell">
      <aside className="sidebar-slot">
        <NavRail
          activePage={activePage}
          onNavigate={setActivePage}
          onRequestSignOut={requestSignOut}
        />
      </aside>

      <div className="workspace">
        <Topbar onRequestSignOut={requestSignOut} />
        <div className={`workspace-body ${showRightRail ? '' : 'no-rail'}`}>
          <main className="main">
            <ActivePageComponent />
          </main>
          {showRightRail && <RightRail />}
        </div>
      </div>

      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Sign out"
        message="Are you sure you want to log out? You’ll need to sign in again to access the admin dashboard."
        onConfirm={signOut}
        isDangerous
        confirmText="Log out"
        cancelText="Cancel"
      />
    </div>
  )
}
