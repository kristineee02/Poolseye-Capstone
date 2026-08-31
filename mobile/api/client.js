/**
 * Backend API client for the Expo lifeguard app.
 *
 * On a physical device, set EXPO_PUBLIC_API_URL to your PC's LAN IP:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.3:4000
 */

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export const TOKEN_KEY = 'poolseye-lifeguard-token';
export const USER_KEY = 'poolseye-lifeguard-session';

export async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return {
      ok: false,
      error: `Cannot reach backend at ${API_BASE}. Check Wi-Fi and EXPO_PUBLIC_API_URL.`,
    };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error || `Request failed (${res.status})` };
  }
  return { ok: true, ...data };
}
