import { useRef, useState } from 'react'

const STAGE_W = 1000
const STAGE_H = 512

// Pool bounds — same as CameraFeedIllustration
const PX = 160, PY = 76, PW = 680, PH = 360

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
        <linearGradient id="ge-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#29B6D8" />
          <stop offset="100%" stopColor="#0D6E8A" />
        </linearGradient>
        <linearGradient id="ge-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#E8E3D8" />
          <stop offset="100%" stopColor="#D6D0C2" />
        </linearGradient>
        <pattern id="ge-tile" width="50" height="50" patternUnits="userSpaceOnUse">
          <rect width="50" height="50" fill="none" stroke="#C8C2B2" strokeWidth="0.7" opacity="0.4" />
        </pattern>
        <pattern id="ge-ripple" width="80" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 10 Q20 3 40 10 T80 10" stroke="#7DDCE8" strokeWidth="1.2" fill="none" opacity="0.35" />
        </pattern>
        <filter id="ge-shadow">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#0D6E8A" floodOpacity="0.25" />
        </filter>
        <clipPath id="ge-pool-clip">
          <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36" />
        </clipPath>
      </defs>

      {/* Deck */}
      <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="url(#ge-deck)" />
      <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="url(#ge-tile)" />

      {/* Pool water */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="url(#ge-water)" filter="url(#ge-shadow)" />
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="url(#ge-ripple)" opacity="0.5" />

      {/* Lane lines */}
      <g clipPath="url(#ge-pool-clip)">
        <line x1={PX} y1={PY + PH * 0.33} x2={PX + PW} y2={PY + PH * 0.33}
          stroke="#5ECDE0" strokeWidth="1.5" opacity="0.45" />
        <line x1={PX} y1={PY + PH * 0.66} x2={PX + PW} y2={PY + PH * 0.66}
          stroke="#5ECDE0" strokeWidth="1.5" opacity="0.45" />
      </g>

      {/* Pool coping */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="none" stroke="#A8D8E0" strokeWidth="6" />

      {/* Lane rope anchors */}
      {[PY + PH * 0.33, PY + PH * 0.66].map((y, i) => (
        <g key={i}>
          <circle cx={PX + 10}      cy={y} r="5" fill="#E8C84A" opacity="0.8" />
          <circle cx={PX + PW - 10} cy={y} r="5" fill="#E8C84A" opacity="0.8" />
        </g>
      ))}

      {/* Depth labels */}
      <text x={PX + 18} y={PY + 40}  fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.6">1.0m</text>
      <text x={PX + 18} y={PY + 130} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.6">1.5m</text>
      <text x={PX + 18} y={PY + 220} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.6">2.0m</text>
      <text x={PX + 18} y={PY + 320} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.6">2.5m</text>

      {/* Pool label */}
      <text x={PX + PW / 2} y={PY + 28} fill="#fff" fontFamily="Roboto Mono, monospace"
        fontSize="12" fontWeight="700" textAnchor="middle" opacity="0.5" letterSpacing="2">
        MAIN POOL — GEOFENCE EDITOR
      </text>

      {/* ── Inactive zones ── */}
      {zones
        .filter((z) => z.id !== activeZoneId)
        .map((zone) => (
          <g key={zone.id} opacity={0.45}>
            <polyline
              points={zone.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={zone.color} strokeWidth="2.5" strokeDasharray="9 6"
            />
            {zone.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="5" fill="#fff" stroke={zone.color} strokeWidth="2" />
            ))}
          </g>
        ))}

      {/* ── Active zone ── */}
      {activeZone && (
        <g>
          <polyline
            points={activeZone.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke={activeZone.color} strokeWidth="3" strokeDasharray="9 6"
          />
          {activeZone.threshold && activeZone.points[0] && (
            <circle
              cx={activeZone.points[0].x} cy={activeZone.points[0].y}
              r={activeZone.threshold * 60}
              fill="none" stroke="#D6364A" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.45"
            />
          )}
          {activeZone.points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="9" fill={activeZone.color} opacity="0.18" />
              <circle
                cx={p.x} cy={p.y} r="6.5"
                fill="#fff" stroke={activeZone.color} strokeWidth="2.5"
                onPointerDown={(e) => handlePointPointerDown(i, e)}
                style={{ cursor: mode === 'delete' ? 'pointer' : 'grab' }}
              />
            </g>
          ))}
          <text x={16} y={STAGE_H - 16} fill={activeZone.color}
            fontFamily="Roboto Mono, monospace" fontSize="12" fontWeight="700">
            {activeZone.name.toUpperCase()} — {activeZone.points.length} POINTS
          </text>
        </g>
      )}

      {/* Mode hint */}
      <rect x={STAGE_W - 240} y="16" width="224" height="40" rx="8"
        fill="#FFFFFF" opacity="0.92" stroke="#E7E9EE" />
      <text x={STAGE_W - 228} y="32" fill="#6B7385" fontFamily="Roboto Mono, monospace" fontSize="10">
        {mode === 'add' ? 'CLICK POOL TO ADD POINT' : mode === 'delete' ? 'CLICK POINT TO REMOVE' : 'DRAG POINTS TO ADJUST'}
      </text>
      <text x={STAGE_W - 228} y="46" fill="#1A2233" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="600">
        Edit mode: {mode}
      </text>
    </svg>
  )
}
