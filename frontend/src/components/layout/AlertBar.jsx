import { useState } from 'react'
import './AlertBar.css'

export default function AlertBar() {
  const [acknowledged, setAcknowledged] = useState(false)

  if (acknowledged) return null

  return (
    <div className="alertbar">
      <span className="pulse" />
      <div className="txt">
        <b>Unsupervised intrusion detected</b> — Child class object inside restricted zone, no
        adult within 2.4 m proximity threshold.
      </div>
      <div className="time mono">10:42:11 AM</div>
      <button className="ackbtn" onClick={() => setAcknowledged(true)}>
        Acknowledge
      </button>
    </div>
  )
}
