const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getLiveState,
  setLiveState,
  storedZonesToDetection,
  validateDetectionLayout,
  zonesToDetection,
} = require('./geofence')

function zone(type, points, activeDuringStandby = true) {
  return { id: type, name: type, type, points, activeDuringStandby }
}

const yellow = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const red = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }]
const orange = [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }]

test('red and orange may occupy separate areas inside the yellow pool boundary', () => {
  const separateOrange = [
    { x: 5, y: 60 }, { x: 15, y: 60 }, { x: 15, y: 80 }, { x: 5, y: 80 },
  ]
  const detection = zonesToDetection([
    zone('warning', yellow),
    zone('danger', red),
    zone('transition', separateOrange),
  ])
  assert.equal(detection.yellow.enabled, true)
  assert.equal(detection.red.enabled, true)
  assert.equal(detection.orange.enabled, true)
  assert.deepEqual(detection.orange.points[0], [5, 60])
})

test('inactive duplicate cannot replace the active detector polygon', () => {
  const detection = zonesToDetection([
    zone('warning', yellow),
    zone('warning', [...yellow, { x: 50, y: 50 }], false),
  ])
  assert.equal(detection.yellow.enabled, true)
  assert.equal(detection.yellow.points.length, 4)
})

test('invalid nesting is rejected instead of silently producing inaccurate zones', () => {
  const outside = [{ x: 120, y: 120 }, { x: 150, y: 120 }, { x: 150, y: 150 }]
  assert.throws(
    () => validateDetectionLayout([zone('warning', yellow), zone('danger', outside)]),
    /fully inside Yellow Zone/,
  )
})

test('orange must stay inside yellow but does not need an active red zone', () => {
  assert.doesNotThrow(() => validateDetectionLayout([
    zone('warning', yellow),
    zone('transition', orange),
  ]))

  const outside = [{ x: 120, y: 120 }, { x: 150, y: 120 }, { x: 150, y: 150 }]
  assert.throws(
    () => validateDetectionLayout([zone('warning', yellow), zone('transition', outside)]),
    /Orange Zone must be fully inside Yellow Zone/,
  )
})

test('invalid legacy layout is preserved while detector polygons fail safe', () => {
  const incompleteRed = [{ x: 20, y: 20 }, { x: 80, y: 20 }]
  const result = storedZonesToDetection([
    zone('warning', yellow),
    zone('danger', incompleteRed),
  ])

  assert.match(result.validationError, /at least three points/)
  assert.equal(result.detection.yellow.enabled, false)
  assert.equal(result.detection.red.enabled, false)
  assert.equal(result.detection.orange.enabled, false)
})

test('live CCTV and uploaded video retain independent geofence state', () => {
  setLiveState({ cameraId: 'CAM-01', revision: 4, zones: [zone('warning', yellow)] })
  setLiveState({ cameraId: 'UPLOAD', revision: 2, zones: [zone('transition', orange)] })

  assert.equal(getLiveState('CAM-01').revision, 4)
  assert.equal(getLiveState('UPLOAD').revision, 2)
  assert.notDeepEqual(getLiveState('CAM-01').zones, getLiveState('UPLOAD').zones)
})
