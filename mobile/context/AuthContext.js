import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  checkLifeguardLogin,
  validateNewPassword,
  buildUser,
  DEMO_LIFEGUARD,
  STORAGE_KEY,
  CREDS_KEY,
} from '../auth/demoAuth';

const AuthContext = createContext(null);

async function readCreds() {
  try {
    const raw = await AsyncStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCreds(creds) {
  await AsyncStorage.setItem(CREDS_KEY, JSON.stringify(creds));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const saved = JSON.parse(raw);
          if (saved?.email) setUser(saved);
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

  const persistUser = async (nextUser) => {
    setUser(nextUser);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
  };

  const signIn = async (email, password) => {
    const storedCreds = await readCreds();
    const account = checkLifeguardLogin(email, password, storedCreds);
    if (!account) return { ok: false, error: 'Invalid email or password' };

    let prev = null;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      prev = raw ? JSON.parse(raw) : null;
    } catch {
      prev = null;
    }

    const sameUser = prev?.email === account.email;
    await persistUser({
      ...account,
      name: sameUser && prev?.name ? prev.name : account.name,
      initials: sameUser && prev?.initials ? prev.initials : account.initials,
      photoUri: sameUser ? prev?.photoUri || null : null,
    });
    return { ok: true, mustChangePassword: account.mustChangePassword };
  };

  const changePassword = async ({ currentPassword, newPassword, skipCurrentCheck = false }) => {
    if (!user?.email) {
      return { ok: false, error: 'You must be signed in to change your password.' };
    }
    if (!newPassword) {
      return { ok: false, error: 'Please enter a new password.' };
    }

    const allowSkip = skipCurrentCheck || user.mustChangePassword;
    if (!allowSkip) {
      const storedCreds = await readCreds();
      const expectedPassword = storedCreds?.password || DEMO_LIFEGUARD.password;
      if (currentPassword !== expectedPassword) {
        return { ok: false, error: 'Current password is incorrect.' };
      }
    }

    const check = validateNewPassword(newPassword, {
      email: user.email,
      tempPassword: DEMO_LIFEGUARD.password,
    });
    if (!check.ok) return check;

    await writeCreds({
      email: user.email,
      password: newPassword,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    });

    const nextUser = {
      ...buildUser(DEMO_LIFEGUARD, { mustChangePassword: false }),
      name: user.name || DEMO_LIFEGUARD.name,
      initials: user.initials || DEMO_LIFEGUARD.initials,
      photoUri: user.photoUri || null,
    };
    await persistUser(nextUser);
    return { ok: true };
  };

  const updateProfile = async ({ name, photoUri } = {}) => {
    if (!user) return { ok: false, error: 'You must be signed in.' };

    const nextName = typeof name === 'string' ? name.trim() : user.name;
    if (!nextName) return { ok: false, error: 'Name is required.' };

    const parts = nextName.split(/\s+/).filter(Boolean);
    const initials =
      parts.length === 0
        ? 'LG'
        : parts.length === 1
          ? parts[0].slice(0, 2).toUpperCase()
          : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();

    const nextUser = {
      ...user,
      name: nextName,
      initials,
      photoUri: photoUri === undefined ? user.photoUri || null : photoUri,
    };
    await persistUser(nextUser);
    return { ok: true };
  };

  const updateAvatar = async (photoUri) => {
    return updateProfile({ photoUri });
  };

  const verifyResetEmail = async (email) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) {
      return { ok: false, error: 'Enter your account email.' };
    }
    if (normalized !== DEMO_LIFEGUARD.email) {
      return { ok: false, error: 'No lifeguard account found for that email.' };
    }
    return { ok: true, email: normalized };
  };

  const resetPassword = async ({ email, newPassword }) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (normalized !== DEMO_LIFEGUARD.email) {
      return { ok: false, error: 'No lifeguard account found for that email.' };
    }
    if (!newPassword) {
      return { ok: false, error: 'Please enter a new password.' };
    }

    const check = validateNewPassword(newPassword, {
      email: normalized,
      tempPassword: DEMO_LIFEGUARD.password,
    });
    if (!check.ok) return check;

    await writeCreds({
      email: normalized,
      password: newPassword,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    });

    // Clear any locked session so they sign in fresh with the new password
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    return { ok: true };
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
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
        tempPasswordHint: DEMO_LIFEGUARD.password,
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
