import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { site } from '../../data/site'
import './Topbar.css'

function useClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

export default function Topbar() {
  const time = useClock()

  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">
          <Icon.Logo />
        </span>
        PoolsEye
      </div>

      <div className="sitepicker">
        <span className="dot" />
        {site.name}
      </div>

      <div className="topbar-right">
        <div className="sys-pill">
          <span className="dot" style={{ background: 'var(--safe)' }} />
          Edge node online
        </div>
        <div className="sys-pill">
          <span className="dot" style={{ background: 'var(--accent)' }} />
          {site.mode} mode
        </div>
        <div className="clock mono">{time.toLocaleTimeString('en-US')}</div>
        <div className="avatar">PB</div>
      </div>
    </header>
  )
}
