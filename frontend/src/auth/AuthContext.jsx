import { createContext, useContext, useEffect, useState } from 'react'
import { checkAdminLogin, STORAGE_KEY } from './demoAuth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setUser(JSON.parse(saved))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    setReady(true)
  }, [])

  const signIn = (email, password) => {
    const account = checkAdminLogin(email, password)
    if (!account) return { ok: false, error: 'Invalid email or password' }
    setUser(account)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
    return { ok: true }
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
