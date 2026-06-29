import { Icon } from '../ui/Icon'
import { todaySummary, networkDevices } from '../../data/site'
import './RightRail.css'

export default function RightRail() {
  return (
    <aside className="rightrail">
      <section>
        <div className="rr-title">Active alert</div>
        <div className="alert-detail-card">
          <div className="alert-status-row">
            <div className="alert-status-icon">
              <Icon.AlertTriangle />
            </div>
            <div>
              <div className="stitle">Unsupervised intrusion</div>
              <div className="ssub">Proximity threshold exceeded</div>
            </div>
          </div>
          <div className="det-row"><span className="k">Child detected</span><span className="v v-child">conf 0.93</span></div>
          <div className="det-row"><span className="k">Nearest adult</span><span className="v v-adult">conf 0.97</span></div>
          <div className="det-row"><span className="k">Separation distance</span><span className="v v-dist">2.4 m</span></div>
          <div className="det-row"><span className="k">Allowed threshold</span><span className="v">1.5 m</span></div>
          <div className="det-row"><span className="k">Boundary crossed</span><span className="v">toward pool</span></div>

          <div className="proximity-meter">
            <div className="pm-label"><span>Separation vs. threshold</span><span>2.4 m / 1.5 m</span></div>
            <div className="proximity-track">
              <div className="proximity-fill" style={{ width: '80%' }} />
              <div className="proximity-threshold" style={{ left: '50%' }} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="rr-title">Today's summary</div>
        <div className="mini-stat-grid">
          {todaySummary.map((s) => (
            <div className="mini-stat" key={s.label}>
              <div className="ml">{s.label}</div>
              <div className="mv">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="rr-title">Network</div>
        {networkDevices.map((d) => (
          <div className="device-row" key={d.name}>
            <span className="dname">{d.name}</span>
            {d.status === 'online' ? (
              <span className="online-tag"><span className="dot" />Online</span>
            ) : (
              <span className="dping">{d.ping}</span>
            )}
          </div>
        ))}
      </section>

      <section>
        <div className="rr-title">Quick actions</div>
        <div className="quick-actions">
          <button className="qa-btn danger">
            <Icon.Power />
            Trigger manual alarm
          </button>
          <button className="qa-btn">
            <Icon.Aperture />
            Snapshot current frame
          </button>
          <button className="qa-btn">
            <Icon.Clock />
            Switch to standby mode
          </button>
        </div>
      </section>
    </aside>
  )
}
