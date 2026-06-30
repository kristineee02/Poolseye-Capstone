import { Icon } from '../ui/Icon'

export default function ContactRow({ contact }) {
  return (
    <div className="contact-row">
      <div className="contact-avatar">{contact.initials}</div>
      <div>
        <div className="contact-name">{contact.name}</div>
        <div className="contact-role">{contact.role}</div>
      </div>
      <div className="contact-channels">
        {contact.channels.map((c) => (
          <span className={`channel-chip ${c.primary ? 'app' : ''}`} key={c.label}>
            {c.primary && <Icon.Phone />}
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
