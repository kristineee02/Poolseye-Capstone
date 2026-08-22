import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'poolseye-admin-session'
const API_BASE = 'http://localhost:4000'

const AuthContext = createContext(null)

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
        setUser(data.user)
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
      setUser(data.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Cannot reach backend server on port 4000' }
    }
  }

  const signOut = () => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
