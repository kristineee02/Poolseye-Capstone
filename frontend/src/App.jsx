import { useState } from 'react'
import Topbar from './components/layout/Topbar'
import NavRail from './components/layout/NavRail'
import RightRail from './components/layout/RightRail'
import LiveMonitoringPage from './pages/LiveMonitoringPage'
import GeofenceEditorPage from './pages/GeofenceEditorPage'
import CamerasPage from './pages/CamerasPage'
import LifeguardsPage from './pages/LifeguardsPage'
import HistoryPage from './pages/HistoryPage'
import AnalyticsPage from './pages/AnalyticsPage'

const PAGES = {
  live: LiveMonitoringPage,
  geofence: GeofenceEditorPage,
  cameras: CamerasPage,
  lifeguards: LifeguardsPage,
  history: HistoryPage,
  analytics: AnalyticsPage,
}

export default function App() {
  const [activePage, setActivePage] = useState('live')
  const ActivePageComponent = PAGES[activePage]
  const showRightRail = activePage === 'live'

  return (
    <div className="shell">
      <aside className="sidebar-slot">
        <NavRail activePage={activePage} onNavigate={setActivePage} />
      </aside>

      <div className="workspace">
        <Topbar />
        <div className={`workspace-body ${showRightRail ? '' : 'no-rail'}`}>
          <main className="main">
            <ActivePageComponent />
          </main>
          {showRightRail && <RightRail />}
        </div>
      </div>
    </div>
  )
}
