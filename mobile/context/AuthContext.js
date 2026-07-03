import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkLifeguardLogin, STORAGE_KEY } from '../auth/demoAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) setUser(JSON.parse(saved));
      })
      .catch(() => AsyncStorage.removeItem(STORAGE_KEY))
      .finally(() => setReady(true));
  }, []);

  const signIn = async (email, password) => {
    const account = checkLifeguardLogin(email, password);
    if (!account) return { ok: false, error: 'Invalid email or password' };
    setUser(account);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    return { ok: true };
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
