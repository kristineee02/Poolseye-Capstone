import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { validateNewPassword } from '../auth/demoAuth';
import { apiFetch, TOKEN_KEY, USER_KEY } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (!storedToken) return;

        const result = await apiFetch('/api/mobile/auth/me', { token: storedToken });
        if (!cancelled && result.ok && result.user) {
          setToken(storedToken);
          setUser(result.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
        } else if (!cancelled) {
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
        }
      } catch {
        // ignore corrupt session
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
    await AsyncStorage.setItem(TOKEN_KEY, nextToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  };

  const signIn = async (email, password) => {
    const result = await apiFetch('/api/mobile/auth/login', {
      method: 'POST',
      body: { email, password },
    });
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

    const result = await apiFetch('/api/mobile/auth/change-password', {
      method: 'POST',
      token,
      body: {
        currentPassword,
        newPassword,
        skipCurrentCheck: skipCurrentCheck || user.mustChangePassword,
      },
    });
    if (!result.ok) return { ok: false, error: result.error };

    await persistSession(token, result.user);
    return { ok: true };
  };

  const updateProfile = async ({ name, photoUri } = {}) => {
    if (!user || !token) return { ok: false, error: 'You must be signed in.' };

    const nextName = typeof name === 'string' ? name.trim() : user.name;
    if (!nextName) return { ok: false, error: 'Name is required.' };

    const result = await apiFetch('/api/mobile/auth/profile', {
      method: 'PATCH',
      token,
      body: {
        name: nextName,
        photoUri: photoUri === undefined ? user.photoUri || null : photoUri,
      },
    });
    if (!result.ok) return { ok: false, error: result.error };

    await persistSession(token, result.user);
    return { ok: true };
  };

  const updateAvatar = async (photoUri) => updateProfile({ photoUri });

  const verifyResetEmail = async (email) => {
    const result = await apiFetch('/api/mobile/auth/forgot-password/verify-email', {
      method: 'POST',
      body: { email },
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, email: result.email, demoCode: result.demoCode };
  };

  const resetPassword = async ({ email, newPassword, code }) => {
    const check = validateNewPassword(newPassword, { email });
    if (!check.ok) return check;

    const result = await apiFetch('/api/mobile/auth/forgot-password/reset', {
      method: 'POST',
      body: { email, newPassword, code },
    });
    if (!result.ok) return { ok: false, error: result.error };

    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    return { ok: true };
  };

  const signOut = async () => {
    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        signIn,
        signOut,
        changePassword,
        updateProfile,
        updateAvatar,
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
