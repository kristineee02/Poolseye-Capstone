import { Icon } from '../components/ui/Icon'
import DeviceCard from '../components/devices/DeviceCard'
import { devices } from '../data/devices'
import '../components/devices/DeviceGrid.css'

export default function DevicesPage() {
  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Cameras &amp; sensors</h1>
          <div className="sub">Hardware connected to this site's edge node</div>
        </div>
        <div className="pagehead-right">
          <button className="btn-primary">
            <Icon.Plus />
            Pair new device
          </button>
        </div>
      </div>

      <div className="device-grid">
        {devices.map((d) => (
          <DeviceCard key={d.id} device={d} />
        ))}

        <button className="add-device-card">
          <Icon.Plus />
          Add camera, sensor, or alarm node
        </button>
      </div>
    </div>
  )
}
