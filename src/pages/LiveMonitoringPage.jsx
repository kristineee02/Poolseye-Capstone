import AlertBar from '../components/layout/AlertBar'
import CameraPanel from '../components/camera/CameraPanel'
import KpiCard from '../components/ui/KpiCard'
import EventLogPanel from '../components/history/EventLogPanel'
import SensorListPanel from '../components/devices/SensorListPanel'
import { kpis } from '../data/site'

export default function LiveMonitoringPage() {
  return (
    <div className="page">
      <AlertBar />

      <div className="pagehead">
        <div>
          <h1>Live monitoring</h1>
          <div className="sub">Camera 01 · South Patio Pool · YOLOv8-Nano @ ONNX Runtime</div>
        </div>
        <div className="pagehead-right">
          <button className="chip-btn">Refresh</button>
          <button className="chip-btn">Export log</button>
        </div>
      </div>

      <CameraPanel />

      <div className="kpi-row">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="lower-grid">
        <EventLogPanel />
        <SensorListPanel />
      </div>
    </div>
  )
}
