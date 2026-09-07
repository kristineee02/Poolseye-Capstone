import { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE } from '../config'

const STORAGE_KEY = 'poolseye-admin-session'
const PROFILE_EXTRA_KEY = 'poolseye-admin-profile-extra'

const AuthContext = createContext(null)

function mergeStoredPhoto(nextUser) {
  if (!nextUser?.email) return nextUser
  try {
    const raw = localStorage.getItem(PROFILE_EXTRA_KEY)
    const all = raw ? JSON.parse(raw) : {}
    const photoUri = all[nextUser.email]?.photoUri || null
    return { ...nextUser, photoUri: nextUser.photoUri || photoUri }
  } catch {
    return nextUser
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      setReady(true)
      return
    }

    let token = null
    try {
      token = JSON.parse(stored)?.token
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      setReady(true)
      return
    }

    if (!token) {
      localStorage.removeItem(STORAGE_KEY)
      setReady(true)
      return
    }

    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Session expired')
        return res.json()
      })
      .then((data) => {
        setUser(mergeStoredPhoto(data.user))
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY)
        setUser(null)
      })
      .finally(() => {
        setReady(true)
      })
  }, [])

  const signIn = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: data.error || 'Invalid email or password' }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token }))
      setUser(mergeStoredPhoto(data.user))
      return { ok: true }
    } catch {
      return { ok: false, error: 'Cannot reach backend server' }
    }
  }

  const signOut = () => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const updateProfile = ({ name, photoUri } = {}) => {
    if (!user) return { ok: false, error: 'You must be signed in.' }
    const nextName = typeof name === 'string' ? name.trim() : user.name
    if (!nextName) return { ok: false, error: 'Name is required.' }

    const parts = nextName.split(/\s+/).filter(Boolean)
    const initials =
      parts.length === 0
        ? 'AD'
        : parts.length === 1
          ? parts[0].slice(0, 2).toUpperCase()
          : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()

    setUser({
      ...user,
      name: nextName,
      initials,
      photoUri: photoUri === undefined ? user.photoUri || null : photoUri,
    })
    return { ok: true }
  }

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
