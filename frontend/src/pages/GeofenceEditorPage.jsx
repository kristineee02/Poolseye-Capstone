import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import Toggle from '../components/ui/Toggle'
import GeofenceStage from '../components/geofence/GeofenceStage'
import { ZONE_TYPES, getZoneTypeMeta } from '../data/geofence'
import { useGeofence } from '../context/GeofenceContext'
import { StatusModal, useStatusModal } from '../components/ui/Modal'
import { STREAM_BASE } from '../config'
import '../components/camera/CameraPanel.css'
import '../components/geofence/GeofenceEditor.css'

function makeZoneId() {
  return `zone-${Date.now()}`
}

const MAX_HISTORY = 50

function clonePoints(points) {
  return points.map((p) => ({ ...p }))
}

function pointsEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
}

const DEFAULT_NAMES = {
  warning: 'Outer safety zone',
  danger: 'Warning boundary',
  transition: 'Deep pool',
}

export default function GeofenceEditorPage() {
  const { zones, setZones, dirty, saving, save, discard, syncError } = useGeofence()
  const { status, showStatus, closeStatus } = useStatusModal()
  const [activeZoneId, setActiveZoneId] = useState(zones[0]?.id ?? null)
  const [mode, setMode] = useState('add')
  const [savedNotice, setSavedNotice] = useState(false)
  const [hiddenZoneIds, setHiddenZoneIds] = useState(() => new Set())
  const [frameSource, setFrameSource] = useState('live')
  const [showGrid, setShowGrid] = useState(true)
  const editorCardRef = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const [historyTick, setHistoryTick] = useState(0)
  const coordEditStartRef = useRef(null)

  const activeZone = zones.find((z) => z.id === activeZoneId)
  const activeMeta = activeZone ? getZoneTypeMeta(activeZone.type) : null
  void historyTick
  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0

  useEffect(() => {
    if (activeZoneId && zones.some((z) => z.id === activeZoneId)) return
    setActiveZoneId(zones[0]?.id ?? null)
  }, [zones, activeZoneId])

  function bumpHistory() {
    setHistoryTick((t) => t + 1)
  }

  function clearHistory() {
    undoStackRef.current = []
    redoStackRef.current = []
    bumpHistory()
  }

  function applyZonePoints(zoneId, points) {
    setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, points: clonePoints(points) } : z)))
  }

  function recordHistory(zoneId, previousPoints) {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(MAX_HISTORY - 1)),
      { zoneId, points: clonePoints(previousPoints) },
    ]
    redoStackRef.current = []
    bumpHistory()
  }

  function commitZonePoints(zoneId, nextPoints, previousPoints) {
    if (pointsEqual(previousPoints, nextPoints)) return
    recordHistory(zoneId, previousPoints)
    applyZonePoints(zoneId, nextPoints)
  }

  function undo() {
    const entry = undoStackRef.current.pop()
    if (!entry) return
    const zone = zones.find((z) => z.id === entry.zoneId)
    if (!zone) {
      bumpHistory()
      return
    }
    redoStackRef.current.push({ zoneId: entry.zoneId, points: clonePoints(zone.points) })
    applyZonePoints(entry.zoneId, entry.points)
    bumpHistory()
  }

  function redo() {
    const entry = redoStackRef.current.pop()
    if (!entry) return
    const zone = zones.find((z) => z.id === entry.zoneId)
    if (!zone) {
      bumpHistory()
      return
    }
    undoStackRef.current.push({ zoneId: entry.zoneId, points: clonePoints(zone.points) })
    applyZonePoints(entry.zoneId, entry.points)
    bumpHistory()
  }

  function updateActiveZone(patch) {
    setZones((prev) => prev.map((z) => (z.id === activeZoneId ? { ...z, ...patch } : z)))
  }

  function updatePointCoord(index, axis, rawValue) {
    if (!activeZone) return
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    const max = axis === 'x' ? 1000 : 512
    const clamped = Math.max(0, Math.min(max, Math.round(value)))
    const next = activeZone.points.map((p, i) => (i === index ? { ...p, [axis]: clamped } : p))
    applyZonePoints(activeZoneId, next)
  }

  function startPointCoordEdit() {
    if (activeZone) {
      coordEditStartRef.current = clonePoints(activeZone.points)
    }
  }

  function commitPointCoordEdit() {
    if (!activeZone || !coordEditStartRef.current) return
    const previous = coordEditStartRef.current
    const current = activeZone.points
    if (!pointsEqual(previous, current)) {
      commitZonePoints(activeZoneId, current, previous)
    }
    coordEditStartRef.current = null
  }

  function removePoint(index) {
    if (!activeZone) return
    commitZonePoints(
      activeZoneId,
      activeZone.points.filter((_, idx) => idx !== index),
      activeZone.points,
    )
  }

  function addZone(type) {
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
  }

  function removeZone(zoneId) {
    const remaining = zones.filter((z) => z.id !== zoneId)
    setZones(remaining)
    if (activeZoneId === zoneId) {
      setActiveZoneId(remaining[0]?.id ?? null)
    }
  }

  function selectZone(zoneId) {
    setActiveZoneId(zoneId)
    setMode('add')
    setHiddenZoneIds((current) => {
      if (!current.has(zoneId)) return current
      const next = new Set(current)
      next.delete(zoneId)
      return next
    })
  }

  function toggleZoneVisibility(zoneId) {
    setHiddenZoneIds((current) => {
      const next = new Set(current)
      if (next.has(zoneId)) next.delete(zoneId)
      else next.add(zoneId)
      return next
    })
  }

  function clearZone(zone) {
    if (!zone.points.length) return
    commitZonePoints(zone.id, [], zone.points)
  }

  function useLiveFrame() {
    setFrameSource('live')
  }

  async function fitEditorToScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await editorCardRef.current?.requestFullscreen?.()
    } catch {
      showStatus({ tone: 'error', title: 'Full screen unavailable', message: 'Your browser could not open the editor in full screen.' })
    }
  }

  function discardChanges() {
    const restored = discard()
    setActiveZoneId(restored[0]?.id ?? null)
    setMode('add')
    clearHistory()
  }

  async function saveZone() {
    try {
      await save(zones)
      setSavedNotice(true)
      showStatus({ tone: 'success', title: 'Geofence saved', message: 'Zone coordinates were saved.' })
      setTimeout(() => setSavedNotice(false), 2200)
    } catch (err) {
      showStatus({ tone: 'error', title: 'Save failed', message: err.message || 'Could not save the geofence.' })
    }
  }

  const visibleZones = zones.filter((zone) => !hiddenZoneIds.has(zone.id))
  const isPreview = frameSource === 'layout'

  return (
    <div className="page geofence-page geofence-workspace">
      <StatusModal status={status} onClose={closeStatus} />
      <div className="geofence-top-actions-card">
        <nav className="geofence-source-bar" aria-label="Editor frame source">
          <button type="button" className={frameSource === 'layout' ? 'active' : ''} onClick={() => setFrameSource('layout')}>
            <Icon.Layout /><strong>Pool Layout / Preview</strong>
          </button>
          <button type="button" className={frameSource === 'live' ? 'active' : ''} onClick={useLiveFrame}>
            <Icon.Camera /><strong>Live View (CCTV)</strong>
          </button>
        </nav>
        <div className="pagehead-right geofence-head-save">
          <button className="geofence-cancel-btn" onClick={discardChanges} disabled={!dirty || saving}>Cancel</button>
          <button className="btn-primary geofence-save-btn" onClick={saveZone} disabled={saving}><Icon.Save /> {saving ? 'Saving…' : savedNotice ? 'Saved' : 'Save changes'}</button>
        </div>
      </div>
      <div className="geofence-layout">
        <main className="geofence-canvas-col">
          <section className="geofence-editor-card" ref={editorCardRef}>
            <header className="geofence-camera-bar">
              <div className="geofence-camera-title">
                <strong>South Patio — Pool Perimeter</strong>
                <span>CAM-01</span>
                <span className="geofence-live-pill"><i /> Live CCTV</span>
              </div>
              <div className="geofence-camera-meta">
                <span>1000 × 512</span>
                <span>{frameSource === 'layout' ? 'Pool Layout' : 'Live CCTV'}</span>
                <span>{dirty ? 'Unsaved changes' : 'Saved geofence'}</span>
                <span className="geofence-info" title="Edits preview live and are stored after you select Save zones"><Icon.Info /></span>
              </div>
            </header>

            <div className="editor-stage-wrap">
              {activeZone ? (
                <GeofenceStage
                  zones={visibleZones}
                  activeZoneId={activeZoneId}
                  mode={mode}
                  backgroundMode={frameSource}
                  backgroundUrl={frameSource === 'live' ? `${STREAM_BASE}/stream` : ''}
                  showGrid={showGrid}
                  layoutZones={zones}
                  readOnly={isPreview}
                  onUpdateZonePoints={applyZonePoints}
                  onCommitZonePoints={commitZonePoints}
                />
              ) : (
                <div className="zone-list-empty">No zone selected. Add a Yellow, Orange, or Red zone to start drawing.</div>
              )}
            </div>

            <footer className="geofence-tool-bar">
              <div className="mode-btn-row">
                <button type="button" className={`mode-btn mode-btn-add ${mode === 'add' && !isPreview ? 'active' : ''}`} onClick={() => setMode('add')} disabled={isPreview}>
                  <Icon.Plus /> Add point
                </button>
                <button type="button" className={`mode-btn mode-btn-move ${mode === 'move' && !isPreview ? 'active' : ''}`} onClick={() => setMode('move')} disabled={isPreview}>
                  <img src="/icons/geofence/hand.svg" alt="" aria-hidden="true" /> Move
                </button>
                <button type="button" className={`mode-btn mode-btn-remove ${mode === 'delete' && !isPreview ? 'active' : ''}`} onClick={() => setMode('delete')} disabled={isPreview}>
                  <Icon.Trash /> Remove point
                </button>
                <span className="geofence-tool-divider" />
                <button type="button" className="mode-btn mode-btn-plain" onClick={undo} disabled={isPreview || !canUndo}><img src="/icons/geofence/undo.svg" alt="" aria-hidden="true" /> Undo</button>
                <button type="button" className="mode-btn mode-btn-plain" onClick={redo} disabled={isPreview || !canRedo}><img src="/icons/geofence/redo.svg" alt="" aria-hidden="true" /> Redo</button>
                <span className="geofence-tool-divider" />
                <button type="button" className={`mode-btn mode-btn-plain ${showGrid ? 'active-secondary' : ''}`} onClick={() => setShowGrid((value) => !value)}><Icon.Grid /> Show grid <span className={`geofence-inline-toggle ${showGrid ? 'on' : ''}`}><i /></span></button>
                <button type="button" className="mode-btn mode-btn-plain" onClick={fitEditorToScreen}><Icon.Maximize /> Fit to screen</button>
              </div>
            </footer>
          </section>
        </main>

        <aside className="geofence-sidebar" aria-label="Zone configuration">
          <div className="geofence-sidebar-scroll">
            <section className="geofence-config-card">
              <div className="geofence-section-head">
                <div><h2>Zone Configuration</h2><Icon.Info title="Configure and select the zone you want to edit" /></div>
                <span className={`geofence-preview-badge ${dirty ? 'is-dirty' : ''}`}><Icon.Play /> Preview on Live</span>
              </div>
              <div className="geofence-zone-stack">
                {zones.length === 0 && <div className="zone-list-empty">No zones yet. Add one below to begin.</div>}
                {zones.map((zone) => {
                  const meta = getZoneTypeMeta(zone.type)
                  const active = zone.id === activeZoneId
                  const hidden = hiddenZoneIds.has(zone.id)
                  return (
                    <article key={zone.id} className={`geofence-zone-card geofence-zone-card--${zone.type} ${active ? 'active' : ''}`}>
                      <button type="button" className="geofence-zone-summary" onClick={() => selectZone(zone.id)}>
                        <span className="geofence-zone-dot" style={{ background: meta.color }} />
                        <span className="geofence-zone-copy"><strong>{meta.label}</strong><small>{zone.name}</small></span>
                        <span className="geofence-point-count">{zone.points.length} pts</span>
                        <Icon.ChevronDown className={active ? 'is-open' : ''} />
                      </button>
                      <div className="geofence-zone-actions">
                        <button type="button" className={hidden ? 'is-muted' : ''} onClick={() => toggleZoneVisibility(zone.id)} title={hidden ? 'Show zone' : 'Hide zone'}>{hidden ? <Icon.EyeOff /> : <Icon.Eye />}</button>
                        <button type="button" onClick={() => clearZone(zone)} disabled={isPreview || !zone.points.length}><Icon.Trash /> Clear</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="geofence-config-card">
              <div className="geofence-section-head compact"><div><h2>Add Zone</h2><Icon.Info title="Add another zone using the existing drawing workflow" /></div></div>
              <div className="zone-type-add-grid geofence-add-grid">
                {Object.values(ZONE_TYPES).map((type) => (
                  <button key={type.id} type="button" className={`zone-type-add-btn zone-type-add-btn--${type.id}`} onClick={() => addZone(type.id)} disabled={isPreview}>
                    <span className="zone-type-add-swatch" style={{ background: type.color }} />
                    <span className="zone-type-add-copy"><strong>{type.label}</strong><span>Polygon • click to draw</span></span>
                    <Icon.Plus />
                  </button>
                ))}
              </div>
            </section>

            {activeZone && activeMeta && (
              <section className="geofence-config-card">
                <div className="geofence-section-head compact">
                  <div><h2>Active Zone Options</h2><span className="geofence-active-zone-name">{activeMeta.label}</span></div>
                  <button type="button" className="geofence-delete-zone" onClick={() => removeZone(activeZone.id)} disabled={isPreview}>Delete zone</button>
                </div>
                <div className="geofence-option-body">
                  <div className={`zone-alert-banner zone-alert-banner--${activeZone.type}`}>
                    <span className="zone-alert-dot" style={{ background: activeMeta.color }} />
                    <div><strong>{activeMeta.alertLabel}</strong><p>{activeMeta.alertDescription}</p></div>
                  </div>
                  <div className="field-row">
                    <label className="field-label">Zone name</label>
                    <input className="field-input" type="text" value={activeZone.name} disabled={isPreview} onChange={(event) => updateActiveZone({ name: event.target.value })} />
                  </div>
                  {activeZone.type === 'transition' && (
                    <div className="field-row">
                      <label className="field-label">Crossing direction</label>
                      <select className="field-input" value={activeZone.direction} disabled={isPreview} onChange={(event) => updateActiveZone({ direction: event.target.value })}>
                        <option value="both">Either direction (shallow ↔ deep)</option>
                        <option value="toward">Toward deep end only</option>
                        <option value="away">Toward shallow end only</option>
                      </select>
                    </div>
                  )}
                  <div className="geofence-toggle-row"><label>Active during standby hours</label><Toggle on={activeZone.activeDuringStandby} disabled={isPreview} onChange={(value) => updateActiveZone({ activeDuringStandby: value })} label="Active during standby hours" /></div>
                </div>
              </section>
            )}

            {activeZone && (
              <details className="geofence-config-card geofence-points-card">
                <summary className="geofence-section-head compact">
                  <div><h2>Boundary Points</h2><span className="geofence-active-zone-name">Precise X/Y editing</span></div>
                  <span className="geofence-point-count">{activeZone.points.length} pts</span>
                </summary>
                <div className="point-editor">
                  {activeZone.points.length === 0 && <div className="zone-list-empty">Click the frame to place the first vertex.</div>}
                  {activeZone.points.map((point, index) => (
                    <div className="point-editor-row" key={`${activeZone.id}-${index}`}>
                      <span className="point-editor-index">{index + 1}</span>
                      <label className="point-editor-xy">X<input type="number" min="0" max="1000" value={point.x} disabled={isPreview} onFocus={startPointCoordEdit} onBlur={commitPointCoordEdit} onChange={(event) => updatePointCoord(index, 'x', event.target.value)} /></label>
                      <label className="point-editor-xy">Y<input type="number" min="0" max="512" value={point.y} disabled={isPreview} onFocus={startPointCoordEdit} onBlur={commitPointCoordEdit} onChange={(event) => updatePointCoord(index, 'y', event.target.value)} /></label>
                      <button type="button" className="point-editor-remove" title="Remove point" disabled={isPreview} onClick={() => removePoint(index)}><Icon.Trash /></button>
                    </div>
                  ))}
                </div>
              </details>
            )}

          </div>
        </aside>
      </div>
    </div>
  )

  return (
    <div className="page geofence-page">
      <StatusModal status={status} onClose={closeStatus} />
      <div className="pagehead geofence-pagehead">
        <div>
          <h1>Geofence editor</h1>
          <div className="sub">
            Manually draw nested zones: Yellow (largest) ⊃ Red (inside yellow) ⊃ Orange (inside red)
            {dirty ? ' · unsaved live preview on CCTV' : ''}
          </div>
        </div>
        <div className="pagehead-right">
          {syncError && <span className="geofence-sync-error">{syncError}</span>}
          <button className="chip-btn" onClick={discardChanges} disabled={!dirty || saving}>
            Discard changes
          </button>
          <button className="btn-primary" onClick={saveZone} disabled={saving}>
            <Icon.Save />
            {saving ? 'Saving…' : savedNotice ? 'Saved' : 'Save zones'}
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
                  type="button"
                  className={`mode-btn mode-btn-move ${mode === 'move' ? 'active' : ''}`}
                  onClick={() => setMode('move')}
                  title="Drag existing points"
                >
                  Move
                </button>
                <button
                  type="button"
                  className={`mode-btn mode-btn-add ${mode === 'add' ? 'active' : ''}`}
                  onClick={() => setMode('add')}
                  title="Click the stage to add a point"
                >
                  <Icon.Plus /> Add point
                </button>
                <button
                  type="button"
                  className={`mode-btn mode-btn-remove ${mode === 'delete' ? 'active' : ''}`}
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
                onUpdateZonePoints={applyZonePoints}
                onCommitZonePoints={commitZonePoints}
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
              <button
                type="button"
                className="ctrl-btn"
                title="Undo"
                onClick={undo}
                disabled={!canUndo}
              >
                <Icon.Undo />
              </button>
              <button
                type="button"
                className="ctrl-btn"
                title="Redo"
                onClick={redo}
                disabled={!canRedo}
              >
                <Icon.Redo />
              </button>
            </div>
          </div>
          </div>
        </div>

        <aside className="geofence-sidebar" aria-label="Geofence features panel">
          <div className="geofence-sidebar-scroll">
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

          {activeZone && (
            <div className="panel">
              <div className="panel-head">
                <h3>Boundary points</h3>
                <span className="zcount mono">{activeZone.points.length} pts</span>
              </div>
              <div className="point-editor">
                {activeZone.points.length === 0 && (
                  <div className="zone-list-empty">Click the stage to place the first vertex.</div>
                )}
                {activeZone.points.map((p, i) => (
                  <div className="point-editor-row" key={`${activeZone.id}-${i}`}>
                    <span className="point-editor-index">{i + 1}</span>
                    <label className="point-editor-xy">
                      X
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        value={p.x}
                        onFocus={startPointCoordEdit}
                        onBlur={commitPointCoordEdit}
                        onChange={(e) => updatePointCoord(i, 'x', e.target.value)}
                      />
                    </label>
                    <label className="point-editor-xy">
                      Y
                      <input
                        type="number"
                        min="0"
                        max="512"
                        value={p.y}
                        onFocus={startPointCoordEdit}
                        onBlur={commitPointCoordEdit}
                        onChange={(e) => updatePointCoord(i, 'y', e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="point-editor-remove"
                      title="Remove point"
                      onClick={() => removePoint(i)}
                    >
                      <Icon.Trash />
                    </button>
                  </div>
                ))}
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
                  Choose a component: <b>Yellow Zone</b> (outer safety, largest),{' '}
                  <b>Red Zone</b> (intrusion, inside yellow), or <b>Orange Zone</b> (deep pool, inside red).
                </li>
                <li>
                  Select <b>Add point</b>, then click the pool stage to place vertices one by one.
                </li>
                <li>
                  Polygons close automatically at <b>3+ points</b>. Keep red fully inside yellow, and orange fully inside red.
                </li>
                <li>
                  Use <b>Move</b> to drag points, type X/Y values, or <b>Remove point</b> to delete a vertex.
                </li>
                <li>
                  Layout changes stream to <b>Live monitoring</b> immediately. <b>Save zones</b> writes coordinates to SQLite.
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
