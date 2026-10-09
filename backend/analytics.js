const { all } = require('./db')

const RANGES = {
  '1d': { days: 1, label: 'Today' },
  '7d': { days: 7, label: 'Last 7 days' },
  '30d': { days: 30, label: 'Last 30 days' },
}

const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW']
// Test alerts (camera = 'TEST') and admin broadcasts are not detections, so they stay out of the stats.
const REAL_EVENTS_SQL = "COALESCE(e.camera, '') <> 'TEST' AND COALESCE(e.category, '') <> 'broadcast'"

function severityOf(row) {
  const sev = String(row.severity || '').toUpperCase()
  if (SEVERITIES.includes(sev)) return sev
  if (row.type === 'alarm') return 'HIGH'
  if (row.type === 'warn') return 'MEDIUM'
  return 'LOW'
}

function isAlert(row) {
  return Boolean(row.is_alert) || row.type === 'alarm'
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function responseSeconds(row) {
  if (row.acknowledged_at == null) return null
  const diff = Number(row.acknowledged_at) - Number(row.ts)
  return Number.isFinite(diff) && diff >= 0 ? diff : null
}

function buildTimeline(rows, rangeKey, since) {
  const emptyCounts = () => ({ HIGH: 0, MEDIUM: 0, LOW: 0, total: 0, alerts: 0, responded: 0 })
  const count = (bucket, row) => {
    bucket[severityOf(row)] += 1
    bucket.total += 1
    if (isAlert(row)) {
      bucket.alerts += 1
      if (row.status !== 'pending') bucket.responded += 1
    }
  }

  if (rangeKey === '1d') {
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      ...emptyCounts(),
    }))
    for (const row of rows) {
      count(buckets[new Date(row.ts * 1000).getHours()], row)
    }
    return buckets
  }

  const buckets = []
  const index = new Map()
  const days = RANGES[rangeKey].days
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    const key = dayKey(d)
    const label = days <= 7
      ? d.toLocaleDateString('en', { weekday: 'short' })
      : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
    const bucket = { key, label, ...emptyCounts() }
    index.set(key, bucket)
    buckets.push(bucket)
  }
  for (const row of rows) {
    const bucket = index.get(dayKey(row.ts * 1000))
    if (bucket) count(bucket, row)
  }
  return buckets
}

async function buildAnalytics(db, rangeKey) {
  const range = RANGES[rangeKey]
  const since = startOfDay(Date.now())
  since.setDate(since.getDate() - (range.days - 1))
  const sinceTs = since.getTime() / 1000

  const rows = await all(
    db,
    `SELECT e.*, u.name AS acknowledged_by_name, u.role AS acknowledged_by_role
     FROM events e
     LEFT JOIN users u ON u.id = e.acknowledged_by
     WHERE e.ts >= ? AND ${REAL_EVENTS_SQL}
     ORDER BY e.ts ASC`,
    [sinceTs]
  )

  const prevSinceTs = sinceTs - range.days * 86400
  const prevRows = await all(
    db,
    `SELECT type, severity, is_alert, status, ts, acknowledged_at FROM events e
     WHERE e.ts >= ? AND e.ts < ? AND ${REAL_EVENTS_SQL}`,
    [prevSinceTs, sinceTs]
  )
  const prevAlerts = prevRows.filter(isAlert)
  const prevReviewed = prevAlerts.filter((r) => r.status !== 'pending').length
  const previous = {
    totalDetections: prevRows.length,
    acknowledged: prevAlerts.filter((r) => r.status === 'resolved').length,
    totalAlerts: prevAlerts.length,
    highSeverity: prevAlerts.filter((r) => severityOf(r) === 'HIGH').length,
    acknowledgedRate: prevAlerts.length ? prevReviewed / prevAlerts.length : null,
    averageResponse: average(prevAlerts.map(responseSeconds).filter((v) => v != null)),
  }

  const alerts = rows.filter(isAlert)
  const acknowledged = alerts.filter((r) => r.status === 'resolved')
  const dismissed = alerts.filter((r) => r.status === 'dismissed')
  const pending = alerts.filter((r) => r.status === 'pending')
  const reviewed = acknowledged.length + dismissed.length
  const responses = alerts.map(responseSeconds).filter((v) => v != null)

  const byType = new Map()
  for (const row of rows) {
    const key = row.title || 'Other'
    const entry = byType.get(key) || { title: key, severity: severityOf(row), count: 0, alerts: 0 }
    entry.count += 1
    if (isAlert(row)) entry.alerts += 1
    byType.set(key, entry)
  }

  const byHour = Array.from({ length: 24 }, () => 0)
  for (const row of alerts) {
    byHour[new Date(row.ts * 1000).getHours()] += 1
  }

  const byResponder = new Map()
  for (const row of alerts) {
    if (row.status === 'pending' || row.acknowledged_by == null) continue
    const key = String(row.acknowledged_by)
    const entry = byResponder.get(key) || {
      id: row.acknowledged_by,
      name: row.acknowledged_by_name || 'Unknown user',
      role: row.acknowledged_by_role || null,
      acknowledged: 0,
      dismissed: 0,
      responses: [],
    }
    if (row.status === 'dismissed') entry.dismissed += 1
    else entry.acknowledged += 1
    const secs = responseSeconds(row)
    if (secs != null) entry.responses.push(secs)
    byResponder.set(key, entry)
  }

  return {
    range: rangeKey,
    rangeLabel: range.label,
    since: sinceTs,
    generatedAt: Date.now() / 1000,
    summary: {
      totalDetections: rows.length,
      totalAlerts: alerts.length,
      highSeverity: alerts.filter((r) => severityOf(r) === 'HIGH').length,
      acknowledged: acknowledged.length,
      dismissed: dismissed.length,
      pending: pending.length,
      acknowledgedRate: alerts.length ? reviewed / alerts.length : null,
      falseAlarmRate: reviewed ? dismissed.length / reviewed : null,
    },
    previous,
    responseTimes: {
      samples: responses.length,
      average: average(responses),
      median: median(responses),
      fastest: responses.length ? Math.min(...responses) : null,
      slowest: responses.length ? Math.max(...responses) : null,
    },
    timeline: buildTimeline(rows, rangeKey, since),
    byType: [...byType.values()].sort((a, b) => b.count - a.count),
    byHour,
    byResponder: [...byResponder.values()]
      .map(({ responses: list, ...rest }) => ({
        ...rest,
        averageResponse: average(list),
        fastestResponse: list.length ? Math.min(...list) : null,
      }))
      .sort((a, b) => (b.acknowledged + b.dismissed) - (a.acknowledged + a.dismissed)),
  }
}

function registerAnalyticsRoutes(app, db, adminRequired) {
  app.get('/api/analytics', adminRequired, async (req, res) => {
    try {
      const rangeKey = RANGES[req.query.range] ? String(req.query.range) : '7d'
      res.json(await buildAnalytics(db, rangeKey))
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load analytics' })
    }
  })
}

module.exports = { registerAnalyticsRoutes }
