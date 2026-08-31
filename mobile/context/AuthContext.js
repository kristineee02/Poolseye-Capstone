import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
<<<<<<< HEAD
import {
  checkLifeguardLogin,
  validateNewPassword,
  buildUser,
  DEMO_LIFEGUARD,
  STORAGE_KEY,
  CREDS_KEY,
  REGISTRY_KEY,
  mergeRegistrySeed,
  getTempPasswordForEmail,
  findRegistryEmail,
  normalizeEmail,
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

async function readRegistry() {
  try {
    const raw = await AsyncStorage.getItem(REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

async function writeRegistry(registry) {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

/** Seed demo registry entries on first launch (dev/demo until backend). */
async function ensureRegistrySeeded() {
  const current = await readRegistry();
  const merged = mergeRegistrySeed(current);
  if (JSON.stringify(current) !== JSON.stringify(merged)) {
    await writeRegistry(merged);
  }
  return merged;
}

function resolveAccountForUser(user, registry) {
  const email = normalizeEmail(user?.email);
  const entry = registry[email];
  if (entry) {
    return {
      email,
      name: user?.name || entry.name,
      initials: user?.initials || entry.initials,
      role: user?.role || entry.role || 'Lifeguard',
      shiftStart: entry.shiftStart || null,
      shiftEnd: entry.shiftEnd || null,
    };
  }
  if (email === DEMO_LIFEGUARD.email) {
    return {
      email,
      name: user?.name || DEMO_LIFEGUARD.name,
      initials: user?.initials || DEMO_LIFEGUARD.initials,
      role: user?.role || DEMO_LIFEGUARD.role,
      shiftStart: DEMO_LIFEGUARD.shiftStart,
      shiftEnd: DEMO_LIFEGUARD.shiftEnd,
    };
  }
  return null;
}

=======
import { validateNewPassword } from '../auth/demoAuth';
import { apiFetch, TOKEN_KEY, USER_KEY } from '../api/client';

const AuthContext = createContext(null);

>>>>>>> 5acf0b12d5d490e517b3bd15184a5f84a2bbb31a
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
<<<<<<< HEAD
        await ensureRegistrySeeded();
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const saved = JSON.parse(raw);
          if (saved?.email) setUser(saved);
=======
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (!storedToken) return;

        const result = await apiFetch('/api/mobile/auth/me', { token: storedToken });
        if (!cancelled && result.ok && result.user) {
          setToken(storedToken);
          setUser(result.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
        } else if (!cancelled) {
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
>>>>>>> 5acf0b12d5d490e517b3bd15184a5f84a2bbb31a
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
<<<<<<< HEAD
    const [storedCreds, registry] = await Promise.all([readCreds(), readRegistry()]);
    const account = checkLifeguardLogin(email, password, { storedCreds, registry });
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
      photoUri: sameUser && prev?.photoUri ? prev.photoUri : account.photoUri || null,
=======
    const result = await apiFetch('/api/mobile/auth/login', {
      method: 'POST',
      body: { email, password },
>>>>>>> 5acf0b12d5d490e517b3bd15184a5f84a2bbb31a
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

<<<<<<< HEAD
    const registry = await readRegistry();
    const email = normalizeEmail(user.email);
    const tempPassword = getTempPasswordForEmail(email, registry);

    const allowSkip = skipCurrentCheck || user.mustChangePassword;
    if (!allowSkip) {
      const storedCreds = await readCreds();
      const expectedPassword = storedCreds?.email === email
        ? storedCreds.password
        : tempPassword;
      if (currentPassword !== expectedPassword) {
        return { ok: false, error: 'Current password is incorrect.' };
      }
    }

    const check = validateNewPassword(newPassword, {
      email: user.email,
      tempPassword,
    });
=======
    const check = validateNewPassword(newPassword, { email: user.email });
>>>>>>> 5acf0b12d5d490e517b3bd15184a5f84a2bbb31a
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

<<<<<<< HEAD
    const account = resolveAccountForUser(user, registry);
    const nextUser = {
      ...buildUser(account || DEMO_LIFEGUARD, { mustChangePassword: false }),
      name: user.name || account?.name,
      initials: user.initials || account?.initials,
      photoUri: user.photoUri || null,
    };
    await persistUser(nextUser);
=======
    await persistSession(token, result.user);
>>>>>>> 5acf0b12d5d490e517b3bd15184a5f84a2bbb31a
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
<<<<<<< HEAD
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return { ok: false, error: 'Enter your account email.' };
    }
    const registry = await readRegistry();
    if (!findRegistryEmail(normalized, registry)) {
      return { ok: false, error: 'No lifeguard account found for that email.' };
    }
    return { ok: true, email: normalized };
  };

  const resetPassword = async ({ email, newPassword }) => {
    const normalized = normalizeEmail(email);
    const registry = await readRegistry();
    if (!findRegistryEmail(normalized, registry)) {
      return { ok: false, error: 'No lifeguard account found for that email.' };
    }
    if (!newPassword) {
      return { ok: false, error: 'Please enter a new password.' };
    }

    const tempPassword = getTempPasswordForEmail(normalized, registry);
    const check = validateNewPassword(newPassword, {
      email: normalized,
      tempPassword,
    });
=======
    const result = await apiFetch('/api/mobile/auth/forgot-password/verify-email', {
      method: 'POST',
      body: { email },
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, email: result.email, demoCode: result.demoCode };
  };

  const resetPassword = async ({ email, newPassword, code }) => {
    const check = validateNewPassword(newPassword, { email });
>>>>>>> 5acf0b12d5d490e517b3bd15184a5f84a2bbb31a
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
