export function getInitials(name, fallback = 'LG') {
  if (typeof name !== 'string' || !name.trim()) return fallback;

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
}
