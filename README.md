# PoolsEye — Admin Console (React)

A React + Vite rebuild of the PoolsEye admin dashboard: light theme,
componentized pages, and a fully interactive geofence editor.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build to /dist
npm run preview  # serve the production build locally
```

## Folder structure

```
src/
  main.jsx                 entry point, mounts <App /> and imports global CSS
  App.jsx                  top-level shell: holds the active page in state,
                            renders Topbar / NavRail / RightRail + the page

  styles/
    tokens.css              all design tokens (colors, radii, fonts) as CSS variables
    global.css              reset + app shell grid layout

  data/                      mock data, separated from components on purpose —
                             swap these for real API calls without touching any UI
    site.js                  site info, telemetry, KPIs, today's summary
    events.js                event log entries used by Live + History pages
    devices.js                hardware (camera, PIR, illuminator, ESP32) records
    rules.js                  alert rules + lifeguard/staff contact roster
    geofence.js                initial zone definitions (points, threshold, etc.)
    analytics.js               chart data: weekly detections, FP trend, heatmap

  pages/                     one file per nav destination, each composes
                             components + data into a full page
    LiveMonitoringPage.jsx
    GeofenceEditorPage.jsx     <- the editable geofence editor
    DevicesPage.jsx
    RulesPage.jsx
    HistoryPage.jsx
    AnalyticsPage.jsx

  components/
    layout/                  shell pieces shared by every page
      Topbar.jsx / .css
      NavRail.jsx / .css       6 nav icons, each maps to a page id
      RightRail.jsx / .css     alert detail + quick actions (Live page only)
      AlertBar.jsx / .css      dismissible top banner

    ui/                      generic, page-agnostic building blocks
      Icon.jsx                 every SVG icon used in the app, one place
      Toggle.jsx                on/off switch used by rules, devices, geofence
      KpiCard.jsx               the 4 stat cards on the Live page
      primitives.css            buttons, panels, form fields, KPI/tag styles
                                 shared by every page

    camera/
      CameraPanel.jsx / .css    the camera frame chrome (header/footer/legend)
      CameraFeedIllustration.jsx  the illustrated pool + bounding boxes SVG

    geofence/
      GeofenceStage.jsx         the actual editable SVG: click-to-add,
                                 drag-to-move, click-to-delete points
      GeofenceEditor.css

    devices/
      DeviceCard.jsx / DeviceGrid.css   one card per hardware item
      SensorListPanel.jsx / SensorList.css  compact list used on Live page

    rules/
      RuleCard.jsx              one if/this/then rule with its own toggle
      ContactRow.jsx            one lifeguard/staff roster row
      Rules.css

    history/
      EventRow.jsx / EventRow.css   shared row used by Live's event log
      EventLogPanel.jsx              Live page's "recent 5" event list
      SnapshotThumb.jsx               small camera-shaped thumbnail icon
      SnapshotModal.jsx                "Review" popup with full snapshot
      HistoryTable.css

    analytics/
      WeeklyBarChart.jsx
      FalsePositiveLineChart.jsx
      PeakRiskHeatmap.jsx
      Analytics.css
```

## How the geofence editor works

Zone points are stored as `{ x, y }` pairs in the same 1000×512 coordinate
space as the camera SVG's `viewBox`, so they draw directly with no
conversion math (see `src/data/geofence.js`).

`GeofenceStage.jsx` is the only place that touches mouse/pointer events:

- **Move mode** — pointer-down on a point handle starts a drag; pointer-move
  recalculates that point's stage coordinates from the cursor position.
- **Add mode** — clicking empty stage space appends a new point to the
  active zone.
- **Delete mode** — clicking a point handle removes it from the array.

All of this updates React state in `GeofenceEditorPage.jsx`
(`zones`, lifted so Save/Discard can act on the whole set), so the polyline,
point count, and proximity-threshold circle all re-render live as you edit.

## Theme

Light surfaces (`#FFFFFF` / `#F6F7F9`), ink text, and a single calm teal
accent (`#0E94A6`) replace the previous dark console look. All tokens live
in `src/styles/tokens.css` — change a value there and it propagates
everywhere, since every component reads colors through CSS variables
rather than hardcoded hex values.
