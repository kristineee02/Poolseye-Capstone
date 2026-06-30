const STROKE = {
  alarm: '#D6364A',
  safe: '#1B9C6E',
  warn: '#9AA1B0',
  info: '#9AA1B0',
}

export default function SnapshotThumb({ type }) {
  return (
    <div className="thumb">
      <svg viewBox="0 0 24 24" fill="none" stroke={STROKE[type] || '#9AA1B0'} strokeWidth="2">
        <rect x="1" y="5" width="15" height="14" rx="2" />
        <path d="M23 7 16 12l7 5V7Z" />
      </svg>
    </div>
  )
}
