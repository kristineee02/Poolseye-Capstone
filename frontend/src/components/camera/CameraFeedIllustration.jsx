export default function CameraFeedIllustration() {
  const PX = 160, PY = 76, PW = 680, PH = 360

  // Deck figures — bottom-aligned to just above the pool edge (PY - 4)
  // Kept fully within the deck strip (y >= 4)
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
          <stop offset="0%"   stopColor="#29B6D8" />
          <stop offset="100%" stopColor="#0D6E8A" />
        </linearGradient>
        <linearGradient id="cf-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#E8E3D8" />
          <stop offset="100%" stopColor="#D6D0C2" />
        </linearGradient>
        <pattern id="cf-tile" width="50" height="50" patternUnits="userSpaceOnUse">
          <rect width="50" height="50" fill="none" stroke="#C8C2B2" strokeWidth="0.7" opacity="0.45" />
        </pattern>
        <pattern id="cf-ripple" width="80" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 10 Q20 3 40 10 T80 10" stroke="#7DDCE8" strokeWidth="1.2" fill="none" opacity="0.4" />
        </pattern>
        <filter id="cf-shadow">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#0D6E8A" floodOpacity="0.28" />
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

      {/* Lane lines clipped to pool */}
      <g clipPath="url(#cf-pool-clip)">
        <line x1={PX} y1={PY + PH * 0.33} x2={PX + PW} y2={PY + PH * 0.33}
          stroke="#5ECDE0" strokeWidth="1.5" opacity="0.5" />
        <line x1={PX} y1={PY + PH * 0.66} x2={PX + PW} y2={PY + PH * 0.66}
          stroke="#5ECDE0" strokeWidth="1.5" opacity="0.5" />
      </g>

      {/* Pool coping */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="36" ry="36"
        fill="none" stroke="#A8D8E0" strokeWidth="6" />

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
        MAIN POOL — TOP VIEW
      </text>

      {/* Geofence overlay — red, outside pool boundary */}
      <rect x={PX - 22} y={PY - 22} width={PW + 44} height={PH + 44} rx="48" ry="48"
        fill="none" stroke="#D6364A" strokeWidth="2.5" strokeDasharray="12 7" opacity="0.85" />
      <text x={PX - 4} y={PY - 28} fill="#D6364A"
        fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="600">
        VIRTUAL GEOFENCE — POOL PERIMETER
      </text>

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
