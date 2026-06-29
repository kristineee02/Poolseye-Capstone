import { Icon } from '../ui/Icon'
import { devices } from '../../data/devices'
import './SensorList.css'

const ICONS = {
  camera: Icon.Camera,
  pir: Icon.Motion,
  illuminator: Icon.Bulb,
  alarm: Icon.Chip,
}

const STATE_LABEL = {
  online: { dot: 'dot-safe', text: 'Active' },
  standby: { dot: 'dot-idle', text: 'Standby' },
}

export default function SensorListPanel() {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Connected hardware</h3>
        <span className="view-all">Manage</span>
      </div>
      <div>
        {devices.map((d) => {
          const DevIcon = ICONS[d.kind] || Icon.Chip
          const stateDot = d.statusLabel === 'Triggered' ? 'dot-warn'
            : (STATE_LABEL[d.status]?.dot || 'dot-idle')
          return (
            <div className="sensor-row" key={d.id}>
              <div className="sensor-icon">
                <DevIcon />
              </div>
              <div className="sensor-body">
                <div className="name">{d.name}</div>
                <div className="detail">{d.sub}</div>
              </div>
              <div className="sensor-state">
                <span className={`dot ${stateDot}`} />
                {d.statusLabel}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
