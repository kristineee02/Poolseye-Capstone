import { apiFetch } from './client';

export function fetchCurrentUser(token) {
  return apiFetch('/api/mobile/auth/me', { token });
}

export function login(email, password) {
  return apiFetch('/api/mobile/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function changePassword(token, payload) {
  return apiFetch('/api/mobile/auth/change-password', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function updateProfile(token, payload) {
  return apiFetch('/api/mobile/auth/profile', {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export function updateNotificationPreferences(token, changes) {
  return apiFetch('/api/mobile/notifications', {
    method: 'PATCH',
    token,
    body: changes,
  });
}

export function requestPasswordReset(email) {
  return apiFetch('/api/mobile/auth/forgot-password/verify-email', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(payload) {
  return apiFetch('/api/mobile/auth/forgot-password/reset', {
    method: 'POST',
    body: payload,
  });
}
