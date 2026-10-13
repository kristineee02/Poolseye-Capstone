import React, { createContext, useContext, useEffect, useState } from 'react';
import { validateNewPassword } from '../auth/passwordRules';
import {
  changePassword as requestPasswordChange,
  fetchCurrentUser,
  login,
  requestPasswordReset,
  resetPassword as requestPasswordResetCompletion,
  updateNotificationPreferences,
  updateProfile as requestProfileUpdate,
} from '../api/auth';
import { unregisterFromNotifications } from '../notifications';
import {
  clearSession,
  readSessionToken,
  saveSession,
  saveSessionUser,
} from '../storage/session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedToken = await readSessionToken();
        if (!storedToken) return;

        const result = await fetchCurrentUser(storedToken);
        if (!cancelled && result.ok && result.user) {
          setToken(storedToken);
          setUser(result.user);
          await saveSessionUser(result.user);
        } else if (!cancelled) {
          await clearSession();
        }
      } catch {
        // A malformed or unavailable local session should fall back to login.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = async (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    await saveSession(nextToken, nextUser);
  };

  const signIn = async (email, password) => {
    const result = await login(email, password);
    if (!result.ok) return { ok: false, error: result.error };

    await persistSession(result.token, result.user);
    return {
      ok: true,
      mustChangePassword: Boolean(result.user?.mustChangePassword),
    };
  };

  const changePassword = async ({ currentPassword, newPassword, skipCurrentCheck = false }) => {
    if (!user?.email || !token) {
      return { ok: false, error: 'You must be signed in to change your password.' };
    }
    if (!newPassword) {
      return { ok: false, error: 'Please enter a new password.' };
    }

    const check = validateNewPassword(newPassword, { email: user.email });
    if (!check.ok) return check;

    const result = await requestPasswordChange(token, {
      currentPassword,
      newPassword,
      skipCurrentCheck: skipCurrentCheck || user.mustChangePassword,
    });
    if (!result.ok) return { ok: false, error: result.error };

    await persistSession(token, result.user);
    return { ok: true };
  };

  const updateProfile = async ({ name, photoUri } = {}) => {
    if (!user || !token) return { ok: false, error: 'You must be signed in.' };

    const nextName = typeof name === 'string' ? name.trim() : user.name;
    if (!nextName) return { ok: false, error: 'Name is required.' };

    const result = await requestProfileUpdate(token, {
      name: nextName,
      photoUri: photoUri === undefined ? user.photoUri || null : photoUri,
    });
    if (!result.ok) return { ok: false, error: result.error };

    await persistSession(token, result.user);
    return { ok: true };
  };

  const updateNotificationPrefs = async (changes) => {
    if (!user || !token) return { ok: false, error: 'You must be signed in.' };
    const result = await updateNotificationPreferences(token, changes);
    if (!result.ok) return { ok: false, error: result.error };

    await persistSession(token, result.user);
    return { ok: true };
  };

  const verifyResetEmail = async (email) => {
    const result = await requestPasswordReset(email);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, email: result.email };
  };

  const resetPassword = async ({ email, newPassword, code }) => {
    const check = validateNewPassword(newPassword, { email });
    if (!check.ok) return check;

    const result = await requestPasswordResetCompletion({ email, newPassword, code });
    if (!result.ok) return { ok: false, error: result.error };

    setUser(null);
    setToken(null);
    await clearSession();
    return { ok: true };
  };

  const signOut = async () => {
    // Remove the remote push destination before discarding local credentials.
    await unregisterFromNotifications(token).catch(() => {});
    setUser(null);
    setToken(null);
    await clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        ready,
        signIn,
        signOut,
        changePassword,
        updateProfile,
        updateNotificationPrefs,
        verifyResetEmail,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
