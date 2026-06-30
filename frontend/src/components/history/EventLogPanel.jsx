import { events } from '../../data/events'
import EventRow from '../history/EventRow'

export default function EventLogPanel() {
  const recent = events.slice(0, 5)

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Event log</h3>
        <span className="view-all">View all</span>
      </div>
      <div>
        {recent.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}
