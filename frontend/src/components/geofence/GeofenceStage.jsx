import { useRef, useState } from 'react'

const STAGE_W = 1000
const STAGE_H = 512

// Converts a mouse/pointer event into stage coordinates (0-1000, 0-512),
// regardless of how large the SVG is actually rendered on screen.
function getStagePoint(svgEl, clientX, clientY) {
  const rect = svgEl.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * STAGE_W
  const y = ((clientY - rect.top) / rect.height) * STAGE_H
  return {
    x: Math.max(0, Math.min(STAGE_W, Math.round(x))),
    y: Math.max(0, Math.min(STAGE_H, Math.round(y))),
  }
}

export default function GeofenceStage({ zones, activeZoneId, mode, onUpdateZonePoints }) {
  const svgRef = useRef(null)
  const [draggingIndex, setDraggingIndex] = useState(null)

  const activeZone = zones.find((z) => z.id === activeZoneId)

  function handleStageClick(e) {
    if (mode !== 'add' || !activeZone) return
    // Ignore clicks that originated on a point handle (those have their
    // own handler and call stopPropagation).
    const point = getStagePoint(svgRef.current, e.clientX, e.clientY)
    onUpdateZonePoints(activeZoneId, [...activeZone.points, point])
  }

  function handlePointPointerDown(index, e) {
    e.stopPropagation()
    if (mode === 'delete') {
      if (!activeZone) return
      const next = activeZone.points.filter((_, i) => i !== index)
      onUpdateZonePoints(activeZoneId, next)
      return
    }
    setDraggingIndex(index)
  }

  function handlePointerMove(e) {
    if (draggingIndex === null || !activeZone) return
    const point = getStagePoint(svgRef.current, e.clientX, e.clientY)
    const next = activeZone.points.map((p, i) => (i === draggingIndex ? point : p))
    onUpdateZonePoints(activeZoneId, next)
  }

  function handlePointerUp() {
    setDraggingIndex(null)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      preserveAspectRatio="xMidYMid slice"
      onClick={handleStageClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ cursor: mode === 'add' ? 'crosshair' : 'default' }}
    >
      <defs>
        <linearGradient id="water-edit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2DA9B8" />
          <stop offset="100%" stopColor="#15707C" />
        </linearGradient>
        <linearGradient id="deck-edit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E7E2D6" />
          <stop offset="100%" stopColor="#D8D2C3" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="#F3F1EC" />
      <rect x="0" y="0" width={STAGE_W} height="230" fill="url(#deck-edit)" />
      <rect x="0" y="230" width={STAGE_W} height="282" fill="url(#water-edit)" />
      <rect x="0" y="225" width={STAGE_W} height="10" fill="#C7C0AE" />

      {/* Inactive zones are drawn dimmed and non-interactive */}
      {zones
        .filter((z) => z.id !== activeZoneId)
        .map((zone) => (
          <g key={zone.id} opacity={0.45}>
            <polyline
              points={zone.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={zone.color}
              strokeWidth="2.5"
              strokeDasharray="9 6"
            />
            {zone.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="5" fill="#fff" stroke={zone.color} strokeWidth="2" />
            ))}
          </g>
        ))}

      {/* Active zone: fully interactive */}
      {activeZone && (
        <g>
          <polyline
            points={activeZone.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={activeZone.color}
            strokeWidth="3"
            strokeDasharray="9 6"
          />
          {activeZone.threshold && activeZone.points[0] && (
            <circle
              cx={activeZone.points[0].x}
              cy={activeZone.points[0].y}
              r={activeZone.threshold * 60}
              fill="none"
              stroke="#D6364A"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.45"
            />
          )}
          {activeZone.points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="9"
                fill={activeZone.color}
                opacity="0.18"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r="6.5"
                fill="#fff"
                stroke={activeZone.color}
                strokeWidth="2.5"
                onPointerDown={(e) => handlePointPointerDown(i, e)}
                style={{ cursor: mode === 'delete' ? 'pointer' : 'grab' }}
              />
            </g>
          ))}
          <text x={16} y={STAGE_H - 16} fill={activeZone.color} fontFamily="Roboto Mono, monospace" fontSize="12" fontWeight="700">
            {activeZone.name.toUpperCase()} — {activeZone.points.length} POINTS
          </text>
        </g>
      )}

      <rect x={STAGE_W - 230} y="16" width="214" height="40" rx="8" fill="#FFFFFF" opacity="0.95" stroke="#E7E9EE" />
      <text x={STAGE_W - 218} y="32" fill="#6B7385" fontFamily="Roboto Mono, monospace" fontSize="10">
        {mode === 'add' ? 'CLICK STAGE TO ADD POINT' : mode === 'delete' ? 'CLICK POINT TO REMOVE' : 'DRAG POINTS TO ADJUST'}
      </text>
      <text x={STAGE_W - 218} y="46" fill="#1A2233" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="600">
        Edit mode: {mode}
      </text>
    </svg>
  )
}
