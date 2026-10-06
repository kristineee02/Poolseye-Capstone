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
    alertDescription: 'Largest outer safety zone. A person here is monitored; no intrusion or deep-pool alert until they enter red.',
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
    alertDescription: 'Must sit fully inside red. Crossing from red into orange is a deep-pool entry.',
  },
}

export function getZoneTypeMeta(type) {
  return ZONE_TYPES[type] || ZONE_TYPES.warning
}

// Zones are drawn manually in the Geofence Editor; nothing is pre-seeded.
export const initialZones = []
