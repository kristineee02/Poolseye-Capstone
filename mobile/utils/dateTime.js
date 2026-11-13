export const SITE_TIME_ZONE = process.env.EXPO_PUBLIC_SITE_TIMEZONE || 'Asia/Manila';

function siteDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function localMidnightTimestamp() {
  const now = new Date();
  const site = siteDateParts(now);
  const utcGuess = Date.UTC(Number(site.year), Number(site.month) - 1, Number(site.day));
  const guessAtSite = siteDateParts(new Date(utcGuess));
  const siteOffsetMs = Date.UTC(
    Number(guessAtSite.year),
    Number(guessAtSite.month) - 1,
    Number(guessAtSite.day),
    Number(guessAtSite.hour),
    Number(guessAtSite.minute),
    Number(guessAtSite.second)
  ) - utcGuess;
  return (utcGuess - siteOffsetMs) / 1000;
}

export function formatEventTime(time) {
  if (time == null || time === '') return '';

  const numeric = Number(time);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric * 1000).toLocaleTimeString('en-US', {
      timeZone: SITE_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  const value = String(time);
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (twelveHour) {
    return `${Number(twelveHour[1])}:${twelveHour[2]} ${twelveHour[3].toUpperCase()}`;
  }

  const parsed = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleTimeString('en-US', {
    timeZone: SITE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
