const { get, run } = require('./db')

const DEFAULT_SITE = 'default'
const DEFAULT_TIMEZONE = process.env.SITE_TIMEZONE || 'Asia/Manila'
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const WEEKDAY_TO_KEY = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' }

function defaultSchedule() {
  return Object.fromEntries(DAYS.map((d) => [d, { open: '06:00', close: '21:00', closed: false }]))
}

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function validateSchedule(input) {
  if (!input || typeof input !== 'object') return { error: 'Schedule is required.' }
  const schedule = {}
  for (const day of DAYS) {
    const entry = input[day]
    if (!entry || typeof entry !== 'object') return { error: `Missing hours for ${day}.` }
    const closed = Boolean(entry.closed)
    const open = String(entry.open || '')
    const close = String(entry.close || '')
    if (!closed) {
      if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
        return { error: `Enter open and close times as HH:MM for ${day}.` }
      }
      if (open === close) {
        return { error: `Open and close times can't be the same for ${day}. Mark the day closed instead.` }
      }
    }
    schedule[day] = {
      open: TIME_RE.test(open) ? open : '06:00',
      close: TIME_RE.test(close) ? close : '21:00',
      closed,
    }
  }
  return { schedule }
}

function siteClock(timezone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  )
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return {
    day: WEEKDAY_TO_KEY[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    localTime: `${parts.hour}:${parts.minute}`,
    utcOffsetMinutes: Math.round((asUtc - now.getTime()) / 60000),
  }
}

// Overnight hours (close <= open) spill into the next day.
function isOpenAt(schedule, day, minutes) {
  const today = schedule[day]
  if (today && !today.closed) {
    const open = toMinutes(today.open)
    const close = toMinutes(today.close)
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true
  }
  const prevDay = DAYS[(DAYS.indexOf(day) + 6) % 7]
  const prev = schedule[prevDay]
  if (prev && !prev.closed) {
    const open = toMinutes(prev.open)
    const close = toMinutes(prev.close)
    if (close <= open && minutes < close) return true
  }
  return false
}

function parseSchedule(raw) {
  try {
    const parsed = JSON.parse(raw)
    return validateSchedule(parsed).schedule || defaultSchedule()
  } catch {
    return defaultSchedule()
  }
}

function toPayload(row) {
  const schedule = parseSchedule(row.schedule)
  const enabled = Boolean(row.enabled)
  const clock = siteClock(row.timezone)
  const open = isOpenAt(schedule, clock.day, clock.minutes)
  return {
    enabled,
    timezone: row.timezone,
    schedule,
    revision: Number(row.revision),
    updatedAt: row.updated_at,
    utcOffsetMinutes: clock.utcOffsetMinutes,
    status: {
      localDay: clock.day,
      localTime: clock.localTime,
      open,
      afterHours: enabled && !open,
    },
  }
}

async function readHours(db) {
  return get(db, 'SELECT * FROM operating_hours WHERE site_id = ?', [DEFAULT_SITE])
}

async function seedOperatingHours(db) {
  if (await readHours(db)) return
  await run(
    db,
    `INSERT INTO operating_hours (site_id, enabled, timezone, schedule, revision, updated_at)
     VALUES (?, 0, ?, ?, 1, ?)`,
    [DEFAULT_SITE, DEFAULT_TIMEZONE, JSON.stringify(defaultSchedule()), new Date().toISOString()]
  )
  console.log('Default operating hours seeded (after-hours rule disabled)')
}

function registerOperatingHoursRoutes(app, db, adminRequired) {
  // Public read: the stream server polls this to decide when after-hours detection applies.
  app.get('/api/operating-hours', async (_req, res) => {
    try {
      const row = await readHours(db)
      if (!row) return res.status(404).json({ error: 'Operating hours not found' })
      res.json(toPayload(row))
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to load operating hours' })
    }
  })

  app.put('/api/operating-hours', adminRequired, async (req, res) => {
    const timezone = String(req.body?.timezone || '').trim()
    if (!timezone || !isValidTimezone(timezone)) {
      return res.status(400).json({ error: 'Choose a valid time zone.' })
    }
    const { schedule, error } = validateSchedule(req.body?.schedule)
    if (error) return res.status(400).json({ error })
    const enabled = req.body?.enabled ? 1 : 0

    try {
      await run(
        db,
        `INSERT INTO operating_hours (site_id, enabled, timezone, schedule, revision, updated_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           enabled = excluded.enabled,
           timezone = excluded.timezone,
           schedule = excluded.schedule,
           revision = operating_hours.revision + 1,
           updated_at = excluded.updated_at`,
        [DEFAULT_SITE, enabled, timezone, JSON.stringify(schedule), new Date().toISOString()]
      )
      res.json(toPayload(await readHours(db)))
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Failed to save operating hours' })
    }
  })
}

module.exports = { registerOperatingHoursRoutes, seedOperatingHours, isOpenAt, siteClock }
