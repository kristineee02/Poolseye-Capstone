import { Icon } from '../ui/Icon'
import CameraFeedIllustration from './CameraFeedIllustration'
import { telemetry } from '../../data/site'
import './CameraPanel.css'

export default function CameraPanel({ compact = false }) {
  if (compact) {
    return (
      <div className="camera-panel camera-panel-compact">
        <div className="camera-stage" style={{ maxHeight: 120 }}>
          <CameraFeedIllustration />
        </div>
      </div>
    )
  }

  return (
    <div className="camera-panel">
      <div className="camera-head">
        <div className="live-tag">
          <span className="dot" />
          LIVE
        </div>
        <div className="name">South Patio — Pool Perimeter</div>
        <div className="id">CAM-01 · OV9281</div>
        <div className="camera-head-right">
          <div className="telemetry-inline">
            <div className="t-item">FPS <span>{telemetry.fps}</span></div>
            <div className="t-item">Latency <span>{telemetry.latencyMs}ms</span></div>
            <div className="t-item">Conf <span>{telemetry.confidence}</span></div>
          </div>
        </div>
      </div>

      <div className="camera-stage">
        <CameraFeedIllustration />
      </div>

      <div className="camera-footbar">
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch" style={{ background: '#1B9C6E' }} />Adult — supervised</span>
          <span className="legend-item"><span className="legend-swatch" style={{ background: '#B6790A' }} />Child — tracked</span>
          <span className="legend-item"><span className="legend-swatch" style={{ background: '#0E94A6' }} />Geofence boundary</span>
          <span className="legend-item"><span className="legend-swatch" style={{ background: '#D6364A' }} />Proximity exceeded</span>
        </div>
        <div className="camera-controls">
          <button className="ctrl-btn" title="Zoom"><Icon.Search /></button>
          <button className="ctrl-btn" title="Play"><Icon.Aperture /></button>
          <button className="ctrl-btn" title="Fullscreen"><Icon.Grid /></button>
        </div>
      </div>
    </div>
  )
}
