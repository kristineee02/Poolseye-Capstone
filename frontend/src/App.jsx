import { useState } from 'react'
import Topbar from './components/layout/Topbar'
import NavRail from './components/layout/NavRail'
import { ConfirmModal } from './components/ui/Modal'
import { Icon } from './components/ui/Icon'
import LoginPage from './pages/LoginPage'
import LiveMonitoringPage from './pages/LiveMonitoringPage'
import GeofenceEditorPage from './pages/GeofenceEditorPage'
import LifeguardsPage from './pages/LifeguardsPage'
import HistoryPage from './pages/HistoryPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import { useAuth } from './auth/AuthContext'

const PAGES = {
  live: LiveMonitoringPage,
  geofence: GeofenceEditorPage,
  lifeguards: LifeguardsPage,
  history: HistoryPage,
  analytics: AnalyticsPage,
  settings: SettingsPage,
}

export default function App() {
  const { user, ready, signOut } = useAuth()
  const [activePage, setActivePage] = useState('live')
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  if (!ready) return null
  if (!user) return <LoginPage />

  const ActivePageComponent = PAGES[activePage]
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
        <Topbar onNavigate={setActivePage} onRequestSignOut={requestSignOut} />
        <div className="workspace-body">
          <main className="main">
            <ActivePageComponent onNavigate={setActivePage} />
          </main>
        </div>
      </div>

      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Sign out"
        message="Are you sure you want to log out? You’ll need to sign in again to access the admin dashboard."
        onConfirm={signOut}
        isDangerous
        icon={Icon.LogOut}
        confirmText="Log out"
        cancelText="Cancel"
      />
    </div>
  )
}
