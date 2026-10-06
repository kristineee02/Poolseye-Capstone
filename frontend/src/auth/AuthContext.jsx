import { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE } from '../config'

const STORAGE_KEY = 'poolseye-admin-session'
// Profile details used to live only in this browser key; it is uploaded once, then removed.
const LEGACY_PROFILE_KEY = 'poolseye-admin-profile-extra'

const AuthContext = createContext(null)

function takeLegacyProfile(email) {
  try {
    const raw = localStorage.getItem(LEGACY_PROFILE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw)
    const extra = all?.[email]
    delete all[email]
    if (Object.keys(all).length) localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(all))
    else localStorage.removeItem(LEGACY_PROFILE_KEY)
    return extra || null
  } catch {
    localStorage.removeItem(LEGACY_PROFILE_KEY)
    return null
  }
}

function initialsFor(name) {
  const parts = String(name || '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'AD'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function withInitials(nextUser) {
  return nextUser ? { ...nextUser, initials: initialsFor(nextUser.name) } : nextUser
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
        setUser(withInitials(data.user))
        migrateLegacyProfile(token, data.user)
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY)
        setUser(null)
      })
      .finally(() => {
        setReady(true)
      })
  }, [])

  const storeSession = (token, nextUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }))
    setUser(withInitials(nextUser))
    migrateLegacyProfile(token, nextUser)
  }

  async function migrateLegacyProfile(token, serverUser) {
    if (!serverUser?.email) return
    const legacy = takeLegacyProfile(serverUser.email)
    if (!legacy) return
    const body = {}
    if (legacy.phone && !serverUser.phone) body.phone = legacy.phone
    if (legacy.position && (!serverUser.position || serverUser.position === 'admin')) body.position = legacy.position
    if (legacy.photoUri && !serverUser.photoUri) body.photoUri = legacy.photoUri
    if (!Object.keys(body).length) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.user) setUser(withInitials(data.user))
    } catch {
      /* best effort; the admin can re-enter details in Settings */
    }
  }

  const authFetch = async (path, { method = 'POST', body } = {}) => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const token = stored ? JSON.parse(stored)?.token : null
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || 'Request failed' }
    return { ok: true, ...data }
  }

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

      if (data.step) {
        return {
          ok: true,
          step: data.step,
          challengeToken: data.challengeToken,
          demoCode: data.demoCode,
        }
      }

      storeSession(data.token, data.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Cannot reach backend server' }
    }
  }

  const finishPasswordChange = async ({ challengeToken, currentPassword, newPassword }) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const token = stored ? JSON.parse(stored)?.token : null
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && !challengeToken ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ challengeToken, currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error || 'Could not update password' }
      storeSession(data.token, data.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Cannot reach backend server' }
    }
  }

  const sendResetCode = async (email) => {
    try {
      return await authFetch('/api/auth/forgot-password/send', { body: { email } })
    } catch {
      return { ok: false, error: 'Cannot reach backend server' }
    }
  }

  const resetPassword = async ({ email, code, newPassword }) => {
    try {
      const result = await authFetch('/api/auth/forgot-password/reset', {
        body: { email, code, newPassword },
      })
      return result.ok ? { ok: true } : result
    } catch {
      return { ok: false, error: 'Cannot reach backend server' }
    }
  }

  const signOut = () => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const updateProfile = async ({ name, phone, position, photoUri } = {}) => {
    if (!user) return { ok: false, error: 'You must be signed in.' }
    const nextName = typeof name === 'string' ? name.trim() : user.name
    if (!nextName) return { ok: false, error: 'Name is required.' }

    try {
      const result = await authFetch('/api/auth/profile', {
        method: 'PATCH',
        body: { name: nextName, phone, position, photoUri },
      })
      if (!result.ok) return result
      setUser(withInitials(result.user))
      return { ok: true }
    } catch {
      return { ok: false, error: 'Cannot reach backend server' }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        signIn,
        signOut,
        updateProfile,
        finishPasswordChange,
        sendResetCode,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
