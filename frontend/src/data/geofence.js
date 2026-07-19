// Pool safety geofence — three manual drawing components
// Coordinate space matches camera SVG viewBox (1000 × 512)

export const ZONE_TYPES = {
  warning: {
    id: 'warning',
    label: 'Yellow Zone',
    shortLabel: 'Warning',
    geometry: 'polygon',
    color: '#E6B800',
    fill: 'rgba(230, 184, 0, 0.22)',
    alertLabel: 'General warning',
    alertDescription: 'Triggers a general warning/alert when a person enters this zone.',
  },
  transition: {
    id: 'transition',
    label: 'Orange Boundary',
    shortLabel: 'Transition',
    geometry: 'polyline',
    color: '#E67E22',
    fill: 'none',
    alertLabel: 'Admin notification',
    alertDescription: 'Crossing this line (shallow ↔ deep) sends an immediate admin notification.',
  },
  danger: {
    id: 'danger',
    label: 'Red Zone',
    shortLabel: 'Danger',
    geometry: 'polygon',
    color: '#D6364A',
    fill: 'rgba(214, 54, 74, 0.24)',
    alertLabel: 'Critical danger alert',
    alertDescription: 'Triggers a critical danger alert when a person enters the deep-pool area.',
  },
}

export function getZoneTypeMeta(type) {
  return ZONE_TYPES[type] || ZONE_TYPES.warning
}

export const initialZones = [
  {
    id: 'zone-warning',
    name: 'Shallow approach',
    type: 'warning',
    direction: 'toward',
    activeDuringStandby: true,
    points: [
      { x: 180, y: 100 },
      { x: 520, y: 100 },
      { x: 520, y: 250 },
      { x: 180, y: 250 },
    ],
  },
  {
    id: 'zone-transition',
    name: 'Shallow–deep line',
    type: 'transition',
    direction: 'both',
    activeDuringStandby: true,
    points: [
      { x: 520, y: 90 },
      { x: 520, y: 420 },
    ],
  },
  {
    id: 'zone-danger',
    name: 'Deep end',
    type: 'danger',
    direction: 'toward',
    activeDuringStandby: true,
    points: [
      { x: 530, y: 110 },
      { x: 820, y: 110 },
      { x: 820, y: 410 },
      { x: 530, y: 410 },
    ],
  },
]
