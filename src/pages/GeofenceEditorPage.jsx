import { useState } from 'react'
import { Icon } from '../components/ui/Icon'
import Toggle from '../components/ui/Toggle'
import GeofenceStage from '../components/geofence/GeofenceStage'
import { initialZones } from '../data/geofence'
import '../components/geofence/GeofenceEditor.css'

const ZONE_COLORS = ['#0E94A6', '#B6790A', '#1B9C6E', '#7A5CC9', '#D6364A']

function makeZoneId() {
  return `zone-${Date.now()}`
}

export default function GeofenceEditorPage() {
  const [zones, setZones] = useState(initialZones)
  const [activeZoneId, setActiveZoneId] = useState(initialZones[0].id)
  const [mode, setMode] = useState('move') // 'move' | 'add' | 'delete'
  const [savedNotice, setSavedNotice] = useState(false)

  const activeZone = zones.find((z) => z.id === activeZoneId)

  function updateZonePoints(zoneId, points) {
    setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, points } : z)))
  }

  function updateActiveZone(patch) {
    setZones((prev) => prev.map((z) => (z.id === activeZoneId ? { ...z, ...patch } : z)))
  }

  function addZone() {
    const color = ZONE_COLORS[zones.length % ZONE_COLORS.length]
    const newZone = {
      id: makeZoneId(),
      name: `Zone ${zones.length + 1}`,
      color,
      direction: 'toward',
      threshold: 1.5,
      activeDuringStandby: true,
      points: [],
    }
    setZones((prev) => [...prev, newZone])
    setActiveZoneId(newZone.id)
    setMode('add')
  }

  function removeZone(zoneId) {
    const remaining = zones.filter((z) => z.id !== zoneId)
    setZones(remaining)
    if (activeZoneId === zoneId && remaining.length > 0) {
      setActiveZoneId(remaining[0].id)
    }
  }

  function clearActiveZonePoints() {
    if (!activeZone) return
    updateZonePoints(activeZoneId, [])
  }

  function undoLastPoint() {
    if (!activeZone || activeZone.points.length === 0) return
    updateZonePoints(activeZoneId, activeZone.points.slice(0, -1))
  }

  function discardChanges() {
    setZones(initialZones)
    setActiveZoneId(initialZones[0].id)
    setMode('move')
  }

  function saveZone() {
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2200)
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Geofence editor</h1>
          <div className="sub">Draw and adjust the virtual boundary for each pool access point</div>
        </div>
        <div className="pagehead-right">
          <button className="chip-btn" onClick={discardChanges}>
            Discard changes
          </button>
          <button className="btn-primary" onClick={saveZone}>
            <Icon.Save />
            {savedNotice ? 'Saved' : 'Save zone'}
          </button>
        </div>
      </div>

      <div className="twocol">
        <div className="camera-panel">
          <div className="camera-head">
            <div className="name">South Patio — Pool Perimeter</div>
            <div className="id">CAM-01 · {activeZone ? `editing "${activeZone.name}"` : 'select a zone'}</div>
            <div className="camera-head-right">
              <div className="mode-btn-row">
                <button
                  className={`mode-btn ${mode === 'move' ? 'active' : ''}`}
                  onClick={() => setMode('move')}
                  title="Drag existing points"
                >
                  Move
                </button>
                <button
                  className={`mode-btn ${mode === 'add' ? 'active' : ''}`}
                  onClick={() => setMode('add')}
                  title="Click the stage to add a point"
                >
                  <Icon.Plus /> Add point
                </button>
                <button
                  className={`mode-btn ${mode === 'delete' ? 'active' : ''}`}
                  onClick={() => setMode('delete')}
                  title="Click a point to remove it"
                >
                  <Icon.Trash /> Remove point
                </button>
              </div>
            </div>
          </div>

          <div className="editor-stage-wrap">
            {activeZone ? (
              <GeofenceStage
                zones={zones}
                activeZoneId={activeZoneId}
                mode={mode}
                onUpdateZonePoints={updateZonePoints}
              />
            ) : (
              <div className="zone-list-empty">No zone selected. Add a zone to start drawing.</div>
            )}
          </div>

          <div className="camera-footbar">
            <div className="legend">
              {zones.map((z) => (
                <span className="legend-item" key={z.id}>
                  <span className="legend-swatch" style={{ background: z.color }} />
                  {z.name}
                </span>
              ))}
            </div>
            <div className="camera-controls">
              <button className="ctrl-btn" title="Undo last point" onClick={undoLastPoint}>
                <Icon.Undo />
              </button>
              <button className="ctrl-btn" title="Clear zone" onClick={clearActiveZonePoints}>
                <Icon.Trash />
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Zones for this camera</h3>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {zones.map((z) => (
                <button
                  key={z.id}
                  className={`zone-tab ${z.id === activeZoneId ? 'active' : ''}`}
                  onClick={() => setActiveZoneId(z.id)}
                >
                  <span className="zdot" style={{ background: z.color }} />
                  {z.name}
                  <span className="zcount mono">{z.points.length} pts</span>
                </button>
              ))}
              <button className="chip-btn" style={{ justifyContent: 'center', marginTop: 4 }} onClick={addZone}>
                <Icon.Plus />
                Add new zone
              </button>
            </div>
          </div>

          {activeZone && (
            <div className="panel">
              <div className="panel-head">
                <h3>{activeZone.name} settings</h3>
                <span className="view-all" onClick={() => removeZone(activeZone.id)} style={{ color: 'var(--alarm)' }}>
                  Delete zone
                </span>
              </div>
              <div style={{ padding: 16 }}>
                <div className="field-row">
                  <label className="field-label">Zone name</label>
                  <input
                    className="field-input"
                    type="text"
                    value={activeZone.name}
                    onChange={(e) => updateActiveZone({ name: e.target.value })}
                  />
                </div>
                <div className="field-row">
                  <label className="field-label">Trigger direction</label>
                  <select
                    className="field-input"
                    value={activeZone.direction}
                    onChange={(e) => updateActiveZone({ direction: e.target.value })}
                  >
                    <option value="toward">Toward pool only</option>
                    <option value="both">Both directions</option>
                    <option value="away">Away from pool only</option>
                  </select>
                </div>
                <div className="field-row">
                  <label className="field-label">
                    Proximity threshold — minimum adult distance
                  </label>
                  <div className="threshold-slider-row">
                    <input
                      type="range"
                      min="0.5"
                      max="4"
                      step="0.1"
                      value={activeZone.threshold}
                      onChange={(e) => updateActiveZone({ threshold: parseFloat(e.target.value) })}
                    />
                    <span className="threshold-readout">{activeZone.threshold.toFixed(1)} m</span>
                  </div>
                </div>
                <div className="field-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
                  <label className="field-label" style={{ margin: 0 }}>
                    Active during standby hours
                  </label>
                  <Toggle
                    on={activeZone.activeDuringStandby}
                    onChange={(v) => updateActiveZone({ activeDuringStandby: v })}
                    label="Active during standby hours"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h3>How this works</h3>
            </div>
            <p className="editor-helptext">
              Use <b>Add point</b> and click the stage to trace the boundary nearest the water,
              <b> Move</b> to drag a point into place, and <b>Remove point</b> to delete one. The
              system uses centroid tracking to flag a crossing only when movement matches the
              trigger direction. The proximity threshold sets how close an adult must stay to a
              detected child before the zone is considered supervised.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
