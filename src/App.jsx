import { useState } from 'react'
import Topbar from './components/layout/Topbar'
import NavRail from './components/layout/NavRail'
import RightRail from './components/layout/RightRail'
import LiveMonitoringPage from './pages/LiveMonitoringPage'
import GeofenceEditorPage from './pages/GeofenceEditorPage'
import DevicesPage from './pages/DevicesPage'
import RulesPage from './pages/RulesPage'
import HistoryPage from './pages/HistoryPage'
import AnalyticsPage from './pages/AnalyticsPage'

const PAGES = {
  live: LiveMonitoringPage,
  geofence: GeofenceEditorPage,
  devices: DevicesPage,
  rules: RulesPage,
  history: HistoryPage,
  analytics: AnalyticsPage,
}

export default function App() {
  const [activePage, setActivePage] = useState('live')
  const ActivePageComponent = PAGES[activePage]
  const showRightRail = activePage === 'live'

  return (
    <div className={`shell ${showRightRail ? '' : 'no-rail'}`}>
      <Topbar />
      <NavRail activePage={activePage} onNavigate={setActivePage} />
      <main className="main">
        <ActivePageComponent />
      </main>
      {showRightRail && <RightRail />}
    </div>
  )
}
