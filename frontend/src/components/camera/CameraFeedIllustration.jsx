import { initialZones, getZoneTypeMeta } from '../../data/geofence'

function GeofenceOverlay({ zones }) {
  return (
    <g className="live-geofence-overlay">
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
            {/* Zone label at first point */}
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
          </g>
        )
      })}
    </g>
  )
}

export default function CameraFeedIllustration({ zones = initialZones }) {
  const PX = 160, PY = 76, PW = 680, PH = 360

  // Deck figures — bottom-aligned to just above the pool edge (PY - 4)
  const adult = { x: PX + 360, y: 4,  w: 72, h: PY - 26 }
  const child  = { x: PX + 180, y: 10, w: 54, h: PY - 32 }
  const adultCx = adult.x + adult.w / 2
  const adultCy = adult.y + adult.h
  const childCx = child.x + child.w / 2
  const childCy = child.y + child.h

  return (
    <svg viewBox="0 0 1000 512" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cf-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#4DB8FF" />
          <stop offset="100%" stopColor="#1E6FFF" />
        </linearGradient>
        <linearGradient id="cf-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#F0F8FF" />
          <stop offset="100%" stopColor="#E8F3FC" />
        </linearGradient>
        <pattern id="cf-tile" width="50" height="50" patternUnits="userSpaceOnUse">
          <rect width="50" height="50" fill="none" stroke="#C5D9E8" strokeWidth="0.7" opacity="0.45" />
        </pattern>
        <pattern id="cf-ripple" width="80" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 10 Q20 3 40 10 T80 10" stroke="#A7ECFF" strokeWidth="1.2" fill="none" opacity="0.4" />
        </pattern>
        <filter id="cf-shadow">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#1E6FFF" floodOpacity="0.28" />
        </filter>
        <clipPath id="cf-pool-clip">
          <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36" />
        </clipPath>
      </defs>

      {/* Deck */}
      <rect x="0" y="0" width="1000" height="512" fill="url(#cf-deck)" />
      <rect x="0" y="0" width="1000" height="512" fill="url(#cf-tile)" />

      {/* Pool water */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="url(#cf-water)" filter="url(#cf-shadow)" />
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="url(#cf-ripple)" opacity="0.55" />

      {/* Shallow / deep hint */}
      <line
        x1={PX + PW * 0.52} y1={PY + 8}
        x2={PX + PW * 0.52} y2={PY + PH - 8}
        stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="6 8" opacity="0.22"
      />
      <text x={PX + 28} y={PY + PH - 18} fill="#fff" fontFamily="Roboto Mono, monospace"
        fontSize="11" opacity="0.5">SHALLOW</text>
      <text x={PX + PW - 28} y={PY + PH - 18} fill="#fff" fontFamily="Roboto Mono, monospace"
        fontSize="11" opacity="0.5" textAnchor="end">DEEP</text>

      {/* Lane lines clipped to pool */}
      <g clipPath="url(#cf-pool-clip)">
        <line x1={PX} y1={PY + PH * 0.33} x2={PX + PW} y2={PY + PH * 0.33}
          stroke="#4DB8FF" strokeWidth="1.5" opacity="0.5" />
        <line x1={PX} y1={PY + PH * 0.66} x2={PX + PW} y2={PY + PH * 0.66}
          stroke="#4DB8FF" strokeWidth="1.5" opacity="0.5" />
      </g>

      {/* Pool coping */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="none" stroke="#A7ECFF" strokeWidth="6" />

      {/* Lane rope anchors */}
      {[PY + PH * 0.33, PY + PH * 0.66].map((y, i) => (
        <g key={i}>
          <circle cx={PX + 10}       cy={y} r="5" fill="#E8C84A" opacity="0.85" />
          <circle cx={PX + PW - 10}  cy={y} r="5" fill="#E8C84A" opacity="0.85" />
        </g>
      ))}

      {/* Depth markers */}
      <text x={PX + 18} y={PY + 40}  fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.65">1.0m</text>
      <text x={PX + 18} y={PY + 130} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.65">1.5m</text>
      <text x={PX + 18} y={PY + 220} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.65">2.0m</text>
      <text x={PX + 18} y={PY + 320} fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" opacity="0.65">2.5m</text>

      {/* Pool label */}
      <text x={PX + PW / 2} y={PY + 28} fill="#fff" fontFamily="Roboto Mono, monospace"
        fontSize="12" fontWeight="700" textAnchor="middle" opacity="0.55" letterSpacing="2">
        MAIN POOL — LIVE CCTV
      </text>

      {/* Safety geofence zones from Geofence editor (Yellow / Orange / Red) */}
      <GeofenceOverlay zones={zones} />

      {/* ── Adult bounding box — deck, before pool ── */}
      <rect x={adult.x} y={adult.y} width={adult.w} height={adult.h} rx="4"
        fill="#1B9C6E" fillOpacity="0.18" stroke="#1B9C6E" strokeWidth="3" />
      <rect x={adult.x} y={adult.y} width={adult.w} height={20} rx="4" fill="#1B9C6E" />
      <text x={adult.x + adult.w / 2} y={adult.y + 14} fill="#fff"
        fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="700" textAnchor="middle">ADULT</text>
      <text x={adult.x + adult.w / 2} y={adultCy - 6} fill="#1B9C6E"
        fontFamily="Roboto Mono, monospace" fontSize="13" fontWeight="700" textAnchor="middle">0.97</text>

      {/* ── Child bounding box — deck, before pool ── */}
      <rect x={child.x} y={child.y} width={child.w} height={child.h} rx="4"
        fill="#B6790A" fillOpacity="0.18" stroke="#B6790A" strokeWidth="3" />
      <rect x={child.x} y={child.y} width={child.w} height={20} rx="4" fill="#B6790A" />
      <text x={child.x + child.w / 2} y={child.y + 14} fill="#fff"
        fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="700" textAnchor="middle">CHILD</text>
      <text x={child.x + child.w / 2} y={childCy - 6} fill="#B6790A"
        fontFamily="Roboto Mono, monospace" fontSize="13" fontWeight="700" textAnchor="middle">0.93</text>

      {/* ── Distance line ── */}
      <line x1={childCx} y1={childCy} x2={adultCx} y2={adultCy}
        stroke="#D6364A" strokeWidth="2" strokeDasharray="5 4" />
      <rect x={(childCx + adultCx) / 2 - 44} y={(childCy + adultCy) / 2 - 11}
        width={88} height={22} rx="4" fill="#D6364A" />
      <text x={(childCx + adultCx) / 2} y={(childCy + adultCy) / 2 + 4}
        fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="700" textAnchor="middle">
        2.4m · OVER
      </text>

      {/* Timestamp */}
      <rect x="856" y="20" width="124" height="34" rx="8"
        fill="#FFFFFF" opacity="0.92" stroke="#E7E9EE" strokeWidth="1" />
      <text x="868" y="33" fill="#9AA1B0" fontFamily="Roboto Mono, monospace" fontSize="9.5">2026-06-22</text>
      <text x="868" y="47" fill="#1A2233" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="600">10:42:11 AM</text>
    </svg>
  )
}
