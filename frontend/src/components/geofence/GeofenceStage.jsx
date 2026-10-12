import { useEffect, useRef, useState } from 'react'
import { getZoneTypeMeta } from '../../data/geofence'

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

function insetPolygon(points, ratio = 0.13) {
  if (!points || points.length < 3) return []
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 },
  )
  return points.map((point) => ({
    x: Math.round(point.x + (center.x - point.x) * ratio),
    y: Math.round(point.y + (center.y - point.y) * ratio),
  }))
}

function polygonBounds(points) {
  if (!points.length) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  }
}

function ZoneShape({ zone, active }) {
  const meta = getZoneTypeMeta(zone.type)
  const pts = zone.points.map((p) => `${p.x},${p.y}`).join(' ')
  if (!pts) return null

  const isPolygon = meta.geometry === 'polygon'
  const closedEnough = zone.points.length >= 3
  const strokeW = active ? (meta.geometry === 'polyline' ? 4 : 3) : 2.5
  const dash = meta.geometry === 'polyline' ? '10 6' : undefined

  if (isPolygon && closedEnough) {
    return (
      <polygon
        points={pts}
        fill={meta.fill}
        stroke={meta.color}
        strokeWidth={strokeW}
        strokeLinejoin="round"
      />
    )
  }

  // Polyline boundary, or polygon still being drawn (< 3 points)
  return (
    <polyline
      points={pts}
      fill="none"
      stroke={meta.color}
      strokeWidth={strokeW}
      strokeDasharray={dash}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

export default function GeofenceStage({
  zones,
  activeZoneId,
  mode,
  backgroundMode = 'layout',
  backgroundUrl = '',
  showGrid = true,
  layoutZones = zones,
  readOnly = false,
  onUpdateZonePoints,
  onCommitZonePoints,
}) {
  const svgRef = useRef(null)
  const [draggingIndex, setDraggingIndex] = useState(null)
  const draggedRef = useRef(false)
  const dragStartPointsRef = useRef(null)
  const livePointsRef = useRef([])

  const activeZone = zones.find((z) => z.id === activeZoneId)
  const activeMeta = activeZone ? getZoneTypeMeta(activeZone.type) : null
  const outerLayoutZone = layoutZones.find((zone) => zone.type === 'warning' && zone.points.length >= 3)
  const adaptivePoolPoints = insetPolygon(outerLayoutZone?.points)
  const adaptivePoolShape = adaptivePoolPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const adaptiveBounds = polygonBounds(adaptivePoolPoints)

  useEffect(() => {
    if (activeZone) livePointsRef.current = activeZone.points
  }, [activeZone?.points])

  function handleStageClick(e) {
    if (readOnly) return
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    if (mode !== 'add' || !activeZone) return
    const point = getStagePoint(svgRef.current, e.clientX, e.clientY)
    const previous = activeZone.points
    onCommitZonePoints(activeZoneId, [...previous, point], previous)
  }

  function handlePointPointerDown(index, e) {
    if (readOnly) return
    e.stopPropagation()
    if (mode === 'delete') {
      if (!activeZone) return
      const next = activeZone.points.filter((_, i) => i !== index)
      onCommitZonePoints(activeZoneId, next, activeZone.points)
      return
    }
    draggedRef.current = false
    dragStartPointsRef.current = activeZone.points.map((p) => ({ ...p }))
    setDraggingIndex(index)
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e) {
    if (readOnly) return
    if (draggingIndex === null || !activeZone) return
    draggedRef.current = true
    const point = getStagePoint(svgRef.current, e.clientX, e.clientY)
    const next = activeZone.points.map((p, i) => (i === draggingIndex ? point : p))
    livePointsRef.current = next
    onUpdateZonePoints(activeZoneId, next)
  }

  function handlePointerUp(e) {
    if (readOnly) {
      dragStartPointsRef.current = null
      setDraggingIndex(null)
      return
    }
    const pointerId = e?.pointerId
    if (pointerId != null && svgRef.current?.hasPointerCapture?.(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId)
    }
    if (dragStartPointsRef.current && draggedRef.current) {
      onCommitZonePoints(activeZoneId, livePointsRef.current, dragStartPointsRef.current)
    }
    dragStartPointsRef.current = null
    setDraggingIndex(null)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      preserveAspectRatio="none"
      onClick={handleStageClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ cursor: readOnly ? 'default' : mode === 'add' ? 'crosshair' : 'default' }}
    >
      <defs>
        <linearGradient id="ge-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#4DB8FF" />
          <stop offset="100%" stopColor="#1E6FFF" />
        </linearGradient>
        <linearGradient id="ge-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#F0F8FF" />
          <stop offset="100%" stopColor="#E8F3FC" />
        </linearGradient>
        <pattern id="ge-ripple" width="80" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 10 Q20 3 40 10 T80 10" stroke="#A7ECFF" strokeWidth="1.2" fill="none" opacity="0.35" />
        </pattern>
        <pattern id="ge-editor-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#8DB6D4" strokeWidth="1" opacity="0.24" />
        </pattern>
        <filter id="ge-shadow">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#1E6FFF" floodOpacity="0.25" />
        </filter>
        <clipPath id="ge-pool-clip">
          <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36" />
        </clipPath>
        <clipPath id="ge-adaptive-pool-clip">
          {adaptivePoolShape && <polygon points={adaptivePoolShape} />}
        </clipPath>
      </defs>

      {/* Deck */}
      <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="url(#ge-deck)" />

      {/* Pool water */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="url(#ge-water)" filter="url(#ge-shadow)" />
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="url(#ge-ripple)" opacity="0.5" />

      {/* Shallow / deep visual split hint */}
      <line
        x1={PX + PW * 0.52} y1={PY + 8}
        x2={PX + PW * 0.52} y2={PY + PH - 8}
        stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="6 8" opacity="0.28"
      />
      <text x={PX + 28} y={PY + PH - 18} fill="#fff" fontFamily="Roboto Mono, monospace"
        fontSize="11" opacity="0.55">SHALLOW</text>
      <text x={PX + PW - 28} y={PY + PH - 18} fill="#fff" fontFamily="Roboto Mono, monospace"
        fontSize="11" opacity="0.55" textAnchor="end">DEEP</text>

      {/* Lane lines */}
      <g clipPath="url(#ge-pool-clip)">
        <line x1={PX} y1={PY + PH * 0.33} x2={PX + PW} y2={PY + PH * 0.33}
          stroke="#4DB8FF" strokeWidth="1.5" opacity="0.45" />
        <line x1={PX} y1={PY + PH * 0.66} x2={PX + PW} y2={PY + PH * 0.66}
          stroke="#4DB8FF" strokeWidth="1.5" opacity="0.45" />
      </g>

      {/* Pool coping */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="none" stroke="#A7ECFF" strokeWidth="6" />

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
        MAIN POOL — SAFETY GEOFENCE
      </text>

      {/* The preview pool follows the saved outer-zone geometry instead of staying rectangular. */}
      {backgroundMode === 'layout' && adaptiveBounds && (
        <g className="adaptive-pool-layout">
          <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="url(#ge-deck)" />
          <polygon
            points={adaptivePoolShape}
            transform="translate(0 11)"
            fill="#0d73bb"
            opacity="0.34"
          />
          <polygon
            points={adaptivePoolShape}
            fill="url(#ge-water)"
            stroke="#8de8ff"
            strokeWidth="7"
            strokeLinejoin="round"
            filter="url(#ge-shadow)"
          />
          <g clipPath="url(#ge-adaptive-pool-clip)">
            <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="url(#ge-ripple)" opacity="0.58" />
            <line
              x1={(adaptiveBounds.left + adaptiveBounds.right) / 2}
              y1={adaptiveBounds.top}
              x2={(adaptiveBounds.left + adaptiveBounds.right) / 2}
              y2={adaptiveBounds.bottom}
              stroke="#fff"
              strokeWidth="1.5"
              strokeDasharray="7 8"
              opacity="0.35"
            />
          </g>
          <text
            x={(adaptiveBounds.left + adaptiveBounds.right) / 2}
            y={adaptiveBounds.top + 27}
            fill="#fff"
            fontFamily="Roboto Mono, monospace"
            fontSize="12"
            fontWeight="700"
            textAnchor="middle"
            opacity="0.68"
            letterSpacing="2"
          >
            MAIN POOL · ADAPTIVE PREVIEW
          </text>
          <text x={adaptiveBounds.left + 24} y={adaptiveBounds.bottom - 17} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="10" opacity="0.7">SHALLOW</text>
          <text x={adaptiveBounds.right - 24} y={adaptiveBounds.bottom - 17} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="10" textAnchor="end" opacity="0.7">DEEP</text>
        </g>
      )}

      {backgroundMode !== 'layout' && (
        <g>
          <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="#10243a" />
          {backgroundUrl && (
            <image href={backgroundUrl} x="0" y="0" width={STAGE_W} height={STAGE_H} preserveAspectRatio="none" />
          )}
        </g>
      )}

      {showGrid && <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="url(#ge-editor-grid)" pointerEvents="none" />}

      {/* ── Inactive zones (draw first) ── */}
      {zones
        .filter((z) => z.id !== activeZoneId)
        .map((zone) => {
          const meta = getZoneTypeMeta(zone.type)
          return (
            <g key={zone.id} opacity={0.4}>
              <ZoneShape zone={zone} active={false} />
              {zone.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4.5" fill="#fff" stroke={meta.color} strokeWidth="2" />
              ))}
            </g>
          )
        })}

      {/* ── Active zone ── */}
      {activeZone && activeMeta && (
        <g>
          <ZoneShape zone={activeZone} active />
          {activeZone.points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="10" fill={activeMeta.color} opacity="0.2" />
              <circle
                cx={p.x} cy={p.y} r="6.5"
                fill="#fff" stroke={activeMeta.color} strokeWidth="2.5"
                onPointerDown={(e) => handlePointPointerDown(i, e)}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: readOnly ? 'default' : mode === 'delete' ? 'pointer' : 'grab' }}
              />
              <text
                x={p.x} y={p.y - 12}
                fill={activeMeta.color}
                fontFamily="Roboto Mono, monospace"
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
              >
                {i + 1}
              </text>
            </g>
          ))}
          <text x={16} y={STAGE_H - 16} fill={activeMeta.color}
            fontFamily="Roboto Mono, monospace" fontSize="12" fontWeight="700">
            {activeMeta.label.toUpperCase()} · {activeZone.name.toUpperCase()} — {activeZone.points.length} POINTS
            {activeMeta.geometry === 'polygon' && activeZone.points.length < 3 ? ' (need 3+ to close)' : ''}
          </text>
        </g>
      )}

      {!readOnly && (
        <g>
          <rect x={STAGE_W - 250} y="16" width="234" height="40" rx="8" fill="#FFFFFF" opacity="0.92" stroke="#E7E9EE" />
          <text x={STAGE_W - 238} y="32" fill="#6B7385" fontFamily="Roboto Mono, monospace" fontSize="10">
            {mode === 'add' ? 'CLICK STAGE TO ADD POINT' : mode === 'delete' ? 'CLICK POINT TO REMOVE' : 'DRAG POINTS TO ADJUST'}
          </text>
          <text x={STAGE_W - 238} y="46" fill="#1A2233" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="600">
            {activeMeta ? `${activeMeta.shortLabel} · ${activeMeta.geometry}` : `Edit mode: ${mode}`}
          </text>
        </g>
      )}
    </svg>
  )
}
