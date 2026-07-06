import { useState } from 'react'
import Logo from '../components/ui/Logo'
import { Icon } from '../components/ui/Icon'
import { DEMO_ADMIN } from '../auth/demoAuth'
import { useAuth } from '../auth/AuthContext'
import './LoginPage.css'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState(DEMO_ADMIN.email)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = signIn(email, password)
    setLoading(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <Logo size={56} />
          <h1>PoolsEye</h1>
          <p>Admin sign in</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <div className="login-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="admin123"
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <Icon.EyeOff /> : <Icon.Eye />}
              </button>
            </div>
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-hint">
          Demo: <code>{DEMO_ADMIN.email}</code> / <code>{DEMO_ADMIN.password}</code>
        </p>
      </div>
    </div>
  )
}
