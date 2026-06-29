import { Icon } from '../components/ui/Icon'
import RuleCard from '../components/rules/RuleCard'
import ContactRow from '../components/rules/ContactRow'
import { rules, contacts } from '../data/rules'
import '../components/rules/Rules.css'

export default function RulesPage() {
  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Alert rules &amp; notifications</h1>
          <div className="sub">Decide what counts as an alert and who gets notified</div>
        </div>
        <div className="pagehead-right">
          <button className="btn-primary">
            <Icon.Plus />
            New rule
          </button>
        </div>
      </div>

      <div className="rule-list">
        {rules.map((rule, i) => (
          <RuleCard key={rule.id} rule={rule} index={i} />
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Lifeguard &amp; staff roster</h3>
          <span className="view-all">Add contact</span>
        </div>
        <div>
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} />
          ))}
        </div>
      </div>
    </div>
  )
}
