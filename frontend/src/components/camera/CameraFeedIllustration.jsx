// Illustrated simulation of the live camera feed: pool deck, water,
// the active geofence line, and tracked Adult/Child bounding boxes.
// This is a static illustration (not the live video feed) used to
// demonstrate what the admin sees once a detection is in progress.
export default function CameraFeedIllustration() {
  return (
    <svg viewBox="0 0 1000 512" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4FC3F7" />
          <stop offset="100%" stopColor="#1565C0" />
        </linearGradient>
        <linearGradient id="deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E7E2D6" />
          <stop offset="100%" stopColor="#D8D2C3" />
        </linearGradient>
        <pattern id="ripple" width="60" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 7 Q15 0 30 7 T60 7" stroke="#9FD8DE" strokeWidth="1.4" fill="none" opacity="0.6" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="1000" height="512" fill="#F3F1EC" />
      <rect x="0" y="0" width="1000" height="230" fill="url(#deck)" />
      <rect x="0" y="230" width="1000" height="282" fill="url(#water)" />
      <rect x="0" y="230" width="1000" height="282" fill="url(#ripple)" />
      <rect x="0" y="225" width="1000" height="10" fill="#C7C0AE" />

      <g opacity="0.25" stroke="#7A7464" strokeWidth="1">
        <line x1="0" y1="60" x2="1000" y2="60" />
        <line x1="0" y1="130" x2="1000" y2="130" />
        <line x1="200" y1="0" x2="80" y2="230" />
        <line x1="500" y1="0" x2="500" y2="230" />
        <line x1="800" y1="0" x2="920" y2="230" />
      </g>

      <line x1="60" y1="148" x2="940" y2="148" stroke="#007BFF" strokeWidth="2.5" strokeDasharray="10 7" />
      <text x="68" y="138" fill="#1565C0" fontFamily="Roboto Mono, monospace" fontSize="13" fontWeight="600">
        VIRTUAL GEOFENCE — POOL APPROACH
      </text>
      <path d="M500 148 L490 138 M500 148 L510 138" stroke="#1565C0" strokeWidth="2" fill="none" />
      <text x="514" y="143" fill="#1565C0" fontFamily="Roboto Mono, monospace" fontSize="10.5">
        TRIGGER DIRECTION
      </text>

      <g>
        <rect x="640" y="56" width="86" height="150" rx="3" fill="none" stroke="#1B9C6E" strokeWidth="2.5" />
        <rect x="640" y="36" width="70" height="20" rx="3" fill="#1B9C6E" />
        <text x="647" y="50" fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="700">
          ADULT 0.97
        </text>
        <circle cx="683" cy="131" r="3" fill="#1B9C6E" />
      </g>

      <g>
        <rect x="392" y="92" width="48" height="86" rx="3" fill="none" stroke="#B6790A" strokeWidth="2.5" />
        <rect x="392" y="72" width="68" height="20" rx="3" fill="#B6790A" />
        <text x="398" y="86" fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="700">
          CHILD 0.93
        </text>
        <circle cx="416" cy="135" r="3" fill="#B6790A" />
      </g>

      <line x1="416" y1="135" x2="683" y2="131" stroke="#D6364A" strokeWidth="1.8" strokeDasharray="5 4" />
      <rect x="500" y="100" width="86" height="22" rx="4" fill="#D6364A" />
      <text x="512" y="115" fill="#fff" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="700">
        2.4m · OVER
      </text>

      <rect x="392" y="178" width="48" height="20" rx="10" fill="none" stroke="#B6790A" strokeWidth="1.5" opacity="0.6" />
      <line x1="416" y1="178" x2="416" y2="148" stroke="#B6790A" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />

      <rect x="30" y="430" width="220" height="58" rx="8" fill="#FFFFFF" opacity="0.92" stroke="#E7E9EE" strokeWidth="1" />
      <text x="44" y="450" fill="#6B7385" fontFamily="Roboto Mono, monospace" fontSize="10.5">
        PIR SENSOR
      </text>
      <text x="44" y="468" fill="#1B9C6E" fontFamily="Roboto Mono, monospace" fontSize="13" fontWeight="700">
        TRIGGERED — MOTION
      </text>

      <rect x="850" y="20" width="120" height="34" rx="8" fill="#FFFFFF" opacity="0.92" stroke="#E7E9EE" strokeWidth="1" />
      <text x="862" y="33" fill="#9AA1B0" fontFamily="Roboto Mono, monospace" fontSize="9.5">
        2026-06-22
      </text>
      <text x="862" y="47" fill="#1A2233" fontFamily="Roboto Mono, monospace" fontSize="11" fontWeight="600">
        10:42:11 AM
      </text>
    </svg>
  )
}
