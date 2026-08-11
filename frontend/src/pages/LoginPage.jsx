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
      <div className="login-panel">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <Logo size={180} />
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span className="login-field-icon" aria-hidden="true">
              <Icon.User />
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="Email"
              required
            />
          </label>

          <label className="login-field">
            <span className="login-field-icon" aria-hidden="true">
              <Icon.Lock />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Password"
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
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-hint">
          Demo: <span className="login-hint-link">{DEMO_ADMIN.email}</span>
          {' / '}
          {DEMO_ADMIN.password}
        </p>
      </div>
    </div>
  )
}
