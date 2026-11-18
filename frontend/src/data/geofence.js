// Pool safety geofence — three manual drawing components
// Coordinate space matches camera SVG viewBox (1000 × 512)

export const ZONE_TYPES = {
  warning: {
    id: 'warning',
    label: 'Yellow Zone',
    shortLabel: 'Monitor',
    geometry: 'polygon',
    color: '#E6B800',
    fill: 'rgba(230, 184, 0, 0.22)',
    alertLabel: 'Position monitoring',
    alertDescription: 'Outer pool boundary. Red and orange may cover separate monitored areas inside it.',
  },
  danger: {
    id: 'danger',
    label: 'Red Zone',
    shortLabel: 'Intrusion',
    geometry: 'polygon',
    color: '#D6364A',
    fill: 'rgba(214, 54, 74, 0.24)',
    alertLabel: 'Intrusion alert',
    alertDescription: 'Must sit fully inside yellow. Crossing into red triggers the intrusion / warning alert.',
  },
  transition: {
    id: 'transition',
    label: 'Orange Zone',
    shortLabel: 'Deep pool',
    geometry: 'polygon',
    color: '#E67E22',
    fill: 'rgba(230, 126, 34, 0.24)',
    alertLabel: 'Deep-pool alert',
    alertDescription: 'Must sit fully inside yellow, but may be separate from red. Entering orange triggers a deep-pool alert.',
  },
}

export function getZoneTypeMeta(type) {
  return ZONE_TYPES[type] || ZONE_TYPES.warning
}

// Zones are drawn manually in the Geofence Editor; nothing is pre-seeded.
export const initialZones = []
