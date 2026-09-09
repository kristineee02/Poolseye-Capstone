/**
 * Backend API client for the Expo lifeguard app.
 *
 * Resolution order:
 * 1. EXPO_PUBLIC_API_URL (explicit override — use for Render / custom IP)
 * 2. Metro / Expo Go host IP on LAN → http://<pc-ip>:4000 (physical devices)
 * 3. http://localhost:4000 (web / simulator on same machine)
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

function trimSlash(url) {
  return String(url || '').replace(/\/$/, '');
}

function hostFromExpo() {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.manifest2?.extra?.expoGo?.debuggerHost,
    Constants.manifest?.debuggerHost,
    Constants.linkingUri,
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      // hostUri / debuggerHost: "192.168.8.189:8081"
      // linkingUri: "exp://192.168.8.189:8081"
      const cleaned = String(raw).replace(/^exp:\/\//, '').replace(/^https?:\/\//, '');
      const host = cleaned.split(':')[0]?.split('/')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return host;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function resolveApiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return trimSlash(fromEnv);
  }

  const lanHost = hostFromExpo();
  if (lanHost) {
    return `http://${lanHost}:4000`;
  }

  // Android emulator → host machine loopback
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }

  return 'http://localhost:4000';
}

export const API_BASE = resolveApiBase();

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
      error:
        `Cannot reach backend at ${API_BASE}. ` +
        'Same Wi‑Fi as PC? Is backend running on port 4000? ' +
        'Or set EXPO_PUBLIC_API_URL=http://YOUR_PC_IP:4000',
    };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error || `Request failed (${res.status})` };
  }
  return { ok: true, ...data };
}
