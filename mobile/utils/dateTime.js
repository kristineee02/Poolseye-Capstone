export function localMidnightTimestamp() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime() / 1000;
}

export function formatEventTime(time) {
  if (!time) return '';

  const value = String(time);
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (twelveHour) {
    return `${Number(twelveHour[1])}:${twelveHour[2]} ${twelveHour[3].toUpperCase()}`;
  }

  const parsed = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
