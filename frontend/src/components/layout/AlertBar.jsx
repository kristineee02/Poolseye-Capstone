import { useState } from 'react'
import './AlertBar.css'

export default function AlertBar() {
  const [acknowledged, setAcknowledged] = useState(false)

  if (acknowledged) return null

  return (
    <div className="alertbar">
      <span className="pulse" />
      <div className="txt">
        <b>Unsupervised intrusion detected</b> — Person inside restricted zone with no one else
        within the 0.7 m proximity threshold.
      </div>
      <div className="time mono">10:42:11 AM</div>
      <button className="ackbtn" onClick={() => setAcknowledged(true)}>
        Acknowledge
      </button>
    </div>
  )
}
