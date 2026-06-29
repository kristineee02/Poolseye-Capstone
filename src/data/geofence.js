// Geofence zones are stored as a list of points in the same coordinate
// space as the camera SVG viewBox (1000 x 512), so they can be drawn
// directly and dragged without any conversion math beyond mouse position.

export const initialZones = [
  {
    id: 'zone-1',
    name: 'Main approach',
    color: '#0E94A6',
    direction: 'toward', // 'toward' | 'both' | 'away'
    threshold: 1.5, // meters
    activeDuringStandby: true,
    points: [
      { x: 60, y: 148 },
      { x: 380, y: 148 },
      { x: 380, y: 90 },
      { x: 940, y: 90 },
    ],
  },
  {
    id: 'zone-2',
    name: 'Side gate',
    color: '#B6790A',
    direction: 'toward',
    threshold: 1.5,
    activeDuringStandby: true,
    points: [
      { x: 40, y: 400 },
      { x: 220, y: 400 },
      { x: 220, y: 330 },
    ],
  },
]
