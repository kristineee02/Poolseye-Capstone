import { useState } from 'react'
import { Icon } from '../components/ui/Icon'
import Toggle from '../components/ui/Toggle'
import GeofenceStage from '../components/geofence/GeofenceStage'
import { initialZones, ZONE_TYPES, getZoneTypeMeta } from '../data/geofence'
import '../components/geofence/GeofenceEditor.css'

function makeZoneId() {
  return `zone-${Date.now()}`
}

const DEFAULT_NAMES = {
  warning: 'Warning zone',
  transition: 'Transition boundary',
  danger: 'Danger zone',
}

export default function GeofenceEditorPage() {
  const [zones, setZones] = useState(initialZones)
  const [activeZoneId, setActiveZoneId] = useState(initialZones[0].id)
  const [mode, setMode] = useState('add') // default to Add Point for drawing
  const [savedNotice, setSavedNotice] = useState(false)

  const activeZone = zones.find((z) => z.id === activeZoneId)
  const activeMeta = activeZone ? getZoneTypeMeta(activeZone.type) : null

  function updateZonePoints(zoneId, points) {
    setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, points } : z)))
  }

  function updateActiveZone(patch) {
    setZones((prev) => prev.map((z) => (z.id === activeZoneId ? { ...z, ...patch } : z)))
  }

  function addZone(type) {
    const meta = getZoneTypeMeta(type)
    const countOfType = zones.filter((z) => z.type === type).length
    const newZone = {
      id: makeZoneId(),
      name: countOfType === 0 ? DEFAULT_NAMES[type] : `${DEFAULT_NAMES[type]} ${countOfType + 1}`,
      type,
      direction: type === 'transition' ? 'both' : 'toward',
      activeDuringStandby: true,
      points: [],
    }
    setZones((prev) => [...prev, newZone])
    setActiveZoneId(newZone.id)
    setMode('add')
    return meta
  }

  function removeZone(zoneId) {
    const remaining = zones.filter((z) => z.id !== zoneId)
    setZones(remaining)
    if (activeZoneId === zoneId) {
      setActiveZoneId(remaining[0]?.id ?? null)
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
    setMode('add')
  }

  function saveZone() {
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2200)
  }

  return (
    <div className="page geofence-page">
      <div className="pagehead geofence-pagehead">
        <div>
          <h1>Geofence editor</h1>
          <div className="sub">
            Manually draw Yellow warning zones, Orange transition boundaries, and Red danger zones
          </div>
        </div>
        <div className="pagehead-right">
          <button className="chip-btn" onClick={discardChanges}>
            Discard changes
          </button>
          <button className="btn-primary" onClick={saveZone}>
            <Icon.Save />
            {savedNotice ? 'Saved' : 'Save zones'}
          </button>
        </div>
      </div>

      <div className="geofence-layout">
        <div className="geofence-canvas-col">
          <div className="camera-panel">
          <div className="camera-head">
            <div className="name">South Patio — Pool Perimeter</div>
            <div className="id">
              CAM-01 ·{' '}
              {activeZone
                ? `drawing "${activeZone.name}" (${activeMeta?.label})`
                : 'select or add a zone'}
            </div>
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
              <div className="zone-list-empty">
                No zone selected. Add a Yellow, Orange, or Red component to start drawing.
              </div>
            )}
          </div>

          <div className="camera-footbar">
            <div className="legend">
              {Object.values(ZONE_TYPES).map((t) => (
                <span className="legend-item" key={t.id}>
                  <span
                    className={`legend-swatch ${t.geometry === 'polyline' ? 'legend-swatch-line' : ''}`}
                    style={{ background: t.color }}
                  />
                  {t.label}
                </span>
              ))}
            </div>
            <div className="camera-controls">
              <button className="ctrl-btn" title="Undo last point" onClick={undoLastPoint}>
                <Icon.Undo />
              </button>
              <button className="ctrl-btn" title="Clear points" onClick={clearActiveZonePoints}>
                <Icon.Trash />
              </button>
            </div>
          </div>
          </div>
        </div>

        <aside className="geofence-sidebar" aria-label="Geofence features panel">
          <div className="geofence-sidebar-scroll">
          {/* Add drawing components */}
          <div className="panel">
            <div className="panel-head">
              <h3>Add drawing component</h3>
            </div>
            <div className="zone-type-add-grid">
              {Object.values(ZONE_TYPES).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`zone-type-add-btn zone-type-add-btn--${t.id}`}
                  onClick={() => addZone(t.id)}
                >
                  <span className="zone-type-add-swatch" style={{ background: t.color }} />
                  <span className="zone-type-add-copy">
                    <strong>{t.label}</strong>
                    <span>{t.geometry === 'polygon' ? 'Polygon · click to draw' : 'Polyline · click to draw'}</span>
                  </span>
                  <Icon.Plus />
                </button>
              ))}
            </div>
          </div>

          {/* Zone list */}
          <div className="panel">
            <div className="panel-head">
              <h3>Zones on this camera</h3>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {zones.length === 0 && (
                <div className="zone-list-empty">No zones yet. Add one above to begin.</div>
              )}
              {zones.map((z) => {
                const meta = getZoneTypeMeta(z.type)
                return (
                  <button
                    key={z.id}
                    className={`zone-tab zone-tab--${z.type} ${z.id === activeZoneId ? 'active' : ''}`}
                    onClick={() => {
                      setActiveZoneId(z.id)
                      setMode('add')
                    }}
                  >
                    <span className="zdot" style={{ background: meta.color }} />
                    <span className="zone-tab-copy">
                      <span className="zone-tab-name">{z.name}</span>
                      <span className="zone-tab-type">{meta.label}</span>
                    </span>
                    <span className="zcount mono">{z.points.length} pts</span>
                  </button>
                )
              })}
            </div>
          </div>

          {activeZone && activeMeta && (
            <div className="panel">
              <div className="panel-head">
                <h3>{activeZone.name}</h3>
                <span
                  className="view-all"
                  onClick={() => removeZone(activeZone.id)}
                  style={{ color: 'var(--alarm)' }}
                >
                  Delete
                </span>
              </div>
              <div style={{ padding: 16 }}>
                <div className={`zone-alert-banner zone-alert-banner--${activeZone.type}`}>
                  <span className="zone-alert-dot" style={{ background: activeMeta.color }} />
                  <div>
                    <strong>{activeMeta.alertLabel}</strong>
                    <p>{activeMeta.alertDescription}</p>
                  </div>
                </div>

                <div className="field-row">
                  <label className="field-label">Component type</label>
                  <div className="zone-type-readonly">
                    <span className="zdot" style={{ background: activeMeta.color }} />
                    {activeMeta.label}
                    <span className="zone-type-geo">{activeMeta.geometry}</span>
                  </div>
                </div>

                <div className="field-row">
                  <label className="field-label">Name</label>
                  <input
                    className="field-input"
                    type="text"
                    value={activeZone.name}
                    onChange={(e) => updateActiveZone({ name: e.target.value })}
                  />
                </div>

                {activeZone.type === 'transition' && (
                  <div className="field-row">
                    <label className="field-label">Crossing direction</label>
                    <select
                      className="field-input"
                      value={activeZone.direction}
                      onChange={(e) => updateActiveZone({ direction: e.target.value })}
                    >
                      <option value="both">Either direction (shallow ↔ deep)</option>
                      <option value="toward">Toward deep end only</option>
                      <option value="away">Toward shallow end only</option>
                    </select>
                  </div>
                )}

                <div
                  className="field-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 0,
                  }}
                >
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
              <h3>How to draw</h3>
            </div>
            <div className="editor-helptext">
              <ol className="editor-help-list">
                <li>
                  Choose a component: <b>Yellow Zone</b> (warning polygon),{' '}
                  <b>Orange Boundary</b> (transition polyline), or <b>Red Zone</b> (danger polygon).
                </li>
                <li>
                  Select <b>Add point</b>, then click the pool stage to place vertices one by one.
                </li>
                <li>
                  Polygons close automatically at <b>3+ points</b>. The orange boundary stays an open line.
                </li>
                <li>
                  Use <b>Move</b> to drag points, or <b>Remove point</b> to delete a vertex.
                </li>
              </ol>
            </div>
          </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
