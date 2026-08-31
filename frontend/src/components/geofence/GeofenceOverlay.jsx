import { getZoneTypeMeta } from '../../data/geofence'

export default function GeofenceOverlay({ zones = [], showLabels = true, dimmed = false }) {
  return (
    <g className="live-geofence-overlay" opacity={dimmed ? 0.85 : 1}>
      {zones.map((zone) => {
        const meta = getZoneTypeMeta(zone.type)
        if (!zone.points?.length) return null

        const pts = zone.points.map((p) => `${p.x},${p.y}`).join(' ')
        const isPolygon = meta.geometry === 'polygon' && zone.points.length >= 3

        return (
          <g key={zone.id}>
            {isPolygon ? (
              <polygon
                points={pts}
                fill={meta.fill}
                stroke={meta.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                opacity="0.95"
              />
            ) : (
              <polyline
                points={pts}
                fill="none"
                stroke={meta.color}
                strokeWidth="3.5"
                strokeDasharray="10 6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.95"
              />
            )}
            {showLabels && zone.points[0] && (
              <text
                x={zone.points[0].x + 6}
                y={zone.points[0].y - 8}
                fill={meta.color}
                fontFamily="Roboto Mono, monospace"
                fontSize="11"
                fontWeight="700"
              >
                {meta.label.toUpperCase()} · {zone.name.toUpperCase()}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
