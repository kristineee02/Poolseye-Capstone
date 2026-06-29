import { useState } from 'react'
import { Icon } from '../ui/Icon'
import Toggle from '../ui/Toggle'

const ICONS = {
  camera: Icon.Camera,
  pir: Icon.Motion,
  illuminator: Icon.Bulb,
  alarm: Icon.Chip,
}

export default function DeviceCard({ device }) {
  const DevIcon = ICONS[device.kind] || Icon.Chip
  const [sensitivity, setSensitivity] = useState(device.sensitivity ?? 50)
  const [autoSchedule, setAutoSchedule] = useState(device.autoSchedule ?? false)

  return (
    <div className="device-card">
      <div className="device-card-head">
        <div className="device-card-icon">
          <DevIcon />
        </div>
        <div>
          <div className="device-card-title">{device.name}</div>
          <div className="device-card-sub">{device.sub}</div>
        </div>
        <span className={`device-status-pill ${device.status}`}>{device.statusLabel}</span>
      </div>

      <div className="device-card-meta">
        {device.meta.map((m) => (
          <div className="device-meta-row" key={m.k}>
            <span className="k">{m.k}</span>
            <span className="v">{m.v}</span>
          </div>
        ))}
      </div>

      {device.kind === 'pir' && (
        <div className="field-row" style={{ margin: '0 0 14px' }}>
          <label className="field-label">Sensitivity — {sensitivity}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
          />
        </div>
      )}

      {device.kind === 'illuminator' && (
        <div
          className="field-row"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 14px' }}
        >
          <label className="field-label" style={{ margin: 0 }}>
            Auto schedule
          </label>
          <Toggle on={autoSchedule} onChange={setAutoSchedule} label="Auto schedule" />
        </div>
      )}

      <div className="device-card-actions">
        {device.actions.map((a) => (
          <div className={`device-action ${a === 'Remove' ? 'danger' : ''}`} key={a}>
            {a}
          </div>
        ))}
      </div>
    </div>
  )
}
