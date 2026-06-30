import { useState } from 'react'
import Toggle from '../ui/Toggle'

export default function RuleCard({ rule, index }) {
  const [enabled, setEnabled] = useState(rule.enabled)

  return (
    <div className="rule-card">
      <div className="rule-num mono">{String(index + 1).padStart(2, '0')}</div>
      <div style={{ flex: 1 }}>
        <div className="rule-flow">
          {rule.flow.map((step, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className="rule-arrow">{step.isResult ? '→' : '+'}</span>}
              <span className={`rule-pill tone-${step.tone}`}>{step.text}</span>
            </span>
          ))}
        </div>
        <div className="rule-desc">{rule.description}</div>
      </div>
      <div className="rule-toggle-col">
        <Toggle on={enabled} onChange={setEnabled} label={`Toggle rule ${index + 1}`} />
      </div>
    </div>
  )
}
