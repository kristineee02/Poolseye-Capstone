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
      <div className="topbar-left">
        <span className="topbar-item topbar-item--site">
          <span className="status-dot safe" aria-hidden="true" />
          <span className="topbar-item-text">{site.name}</span>
        </span>
      </div>

      <div className="topbar-right">
        <div className="topbar-meta">
          <span className="topbar-item">
            <span className="status-dot safe" aria-hidden="true" />
            <span className="topbar-item-text">Edge node online</span>
          </span>
          <span className="topbar-item">
            <span className="status-dot accent" aria-hidden="true" />
            <span className="topbar-item-text">{site.mode}</span>
          </span>
          <time className="topbar-item topbar-item--clock" dateTime={time.toISOString()}>
            <Icon.Clock aria-hidden="true" />
            <span className="topbar-item-text mono">{time.toLocaleTimeString('en-US')}</span>
          </time>
        </div>

        <div className="topbar-avatar" title="Admin profile">PB</div>
      </div>
    </header>
  )
}
