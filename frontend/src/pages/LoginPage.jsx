import { useEffect, useRef, useState } from 'react'
import Logo from '../components/ui/Logo'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../auth/AuthContext'
import { getPasswordRuleChecks, validatePassword } from '../utils/password'
import { StatusModal, useStatusModal } from '../components/ui/Modal'
import './LoginPage.css'

const CODE_TTL_SEC = 10 * 60

function CodeBoxes({ value, onChange }) {
  const refs = useRef([])
  const chars = Array.from({ length: 6 }, (_, i) => value[i] || '')

  const focusAt = (index) => {
    refs.current[index]?.focus()
  }

  return (
    <div className="code-boxes">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el }}
          className="code-box"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          value={char}
          aria-label={`Digit ${index + 1}`}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '')
            if (!raw) {
              const next = chars.slice()
              next[index] = ''
              onChange(next.join(''))
              return
            }
            if (raw.length > 1) {
              const pasted = raw.slice(0, 6)
              onChange(pasted)
              focusAt(Math.min(pasted.length, 5))
              return
            }
            const next = chars.slice()
            next[index] = raw
            onChange(next.join(''))
            if (index < 5) focusAt(index + 1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !chars[index] && index > 0) {
              focusAt(index - 1)
            }
          }}
        />
      ))}
    </div>
  )
}

export default function LoginPage() {
  const { signIn, finishPasswordChange, sendResetCode, resetPassword } = useAuth()
  const [step, setStep] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const [fields, setFields] = useState({})
  const [loading, setLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_SEC)
  const { status, showStatus, closeStatus } = useStatusModal()

  const clearFields = () => setFields({})
  const setField = (key, message) => setFields((current) => ({ ...current, [key]: message }))

  const handleSignIn = async (e) => {
    e.preventDefault()
    const next = {}
    if (!email.trim()) next.email = 'Enter your email.'
    if (!password) next.password = 'Enter your password.'
    setFields(next)
    if (Object.keys(next).length) return
    setLoading(true)
    const result = await signIn(email, password)
    setLoading(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Sign in failed', message: result.error || 'Could not sign in.' })
      return
    }
    if (result.step === 'change_password') {
      setChallengeToken(result.challengeToken)
      setNewPassword('')
      setConfirmPassword('')
      setStep('change_password')
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    const next = {}
    const check = validatePassword(newPassword)
    if (!check.ok) next.newPassword = 'Password does not meet the requirements.'
    if (newPassword !== confirmPassword) next.confirmPassword = 'New password and confirmation do not match.'
    setFields(next)
    if (Object.keys(next).length) return
    setLoading(true)
    const result = await finishPasswordChange({ challengeToken, newPassword })
    setLoading(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Password not updated', message: result.error || 'Could not update password.' })
    }
  }

  useEffect(() => {
    if (step !== 'reset_code') return undefined
    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [step])

  const sendCode = async () => {
    if (!email.trim()) {
      setField('email', 'Enter your admin email.')
      return
    }
    clearFields()
    setLoading(true)
    const result = await sendResetCode(email)
    setLoading(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Code not sent', message: result.error || 'Could not send a reset code.' })
      return
    }
    setDemoCode(result.demoCode || '')
    setCode('')
    setSecondsLeft(CODE_TTL_SEC)
    setStep('reset_code')
    showStatus({
      tone: 'success',
      title: 'Code sent',
      message: result.demoCode
        ? `A reset code was sent. Demo code: ${result.demoCode}`
        : 'A 6-digit reset code was sent to your email.',
    })
  }

  const handleSendReset = async (e) => {
    e.preventDefault()
    await sendCode()
  }

  const handleReset = async (e) => {
    e.preventDefault()
    const next = {}
    if (code.replace(/\s/g, '').length !== 6) next.code = 'Enter the 6-digit code from your email.'
    const check = validatePassword(newPassword)
    if (!check.ok) next.newPassword = 'Password does not meet the requirements.'
    if (newPassword !== confirmPassword) next.confirmPassword = 'New password and confirmation do not match.'
    setFields(next)
    if (Object.keys(next).length) return
    setLoading(true)
    const result = await resetPassword({ email, code, newPassword })
    setLoading(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Reset failed', message: result.error || 'Could not reset password.' })
      return
    }
    setPassword('')
    setStep('login')
    clearFields()
    showStatus({ tone: 'success', title: 'Password updated', message: 'Your password was reset. Sign in with the new password.' })
  }

  const title = {
    login: null,
    change_password: 'Choose a new password before continuing',
    forgot: 'Reset your admin password',
    reset_code: 'Enter the reset code and a new password',
  }[step]

  return (
    <div className="login-page">
      {step === 'reset_code' ? (
        <button
          type="button"
          className="login-back"
          onClick={() => { clearFields(); setStep('forgot') }}
          aria-label="Go back"
        >
          <Icon.ChevronLeft />
        </button>
      ) : null}
      <div className="login-panel">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <Logo size={step === 'login' ? 180 : 120} />
          </div>
        </div>

        {title ? <p className="login-step-title">{title}</p> : null}
        {demoCode ? <p className="login-demo">Demo code: {demoCode}</p> : null}

        {step === 'login' ? (
          <form className="login-form" onSubmit={handleSignIn}>
            <label className={`login-field${fields.email ? ' is-invalid' : ''}`}>
              <span className="login-field-icon" aria-hidden="true"><Icon.User /></span>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setField('email', '') }}
                autoComplete="username"
                placeholder="Email"
              />
            </label>
            {fields.email ? <p className="field-error">{fields.email}</p> : null}
            <label className={`login-field${fields.password ? ' is-invalid' : ''}`}>
              <span className="login-field-icon" aria-hidden="true"><Icon.Lock /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setField('password', '') }}
                autoComplete="current-password"
                placeholder="Password"
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
            {fields.password ? <p className="field-error">{fields.password}</p> : null}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {loading ? 'Logging in…' : 'Login'}
            </button>
            <button type="button" className="login-text-btn" onClick={() => { clearFields(); setStep('forgot') }}>
              Forgot password?
            </button>
          </form>
        ) : null}

        {step === 'change_password' ? (
          <form className="login-form" onSubmit={handlePasswordChange}>
            <PasswordInput
              value={newPassword}
              onChange={(value) => { setNewPassword(value); setField('newPassword', '') }}
              placeholder="New password"
              visible={showNewPassword}
              onToggle={() => setShowNewPassword((v) => !v)}
              invalid={Boolean(fields.newPassword)}
              autoComplete="new-password"
            />
            {fields.newPassword ? <p className="field-error">{fields.newPassword}</p> : null}
            <PasswordInput
              value={confirmPassword}
              onChange={(value) => { setConfirmPassword(value); setField('confirmPassword', '') }}
              placeholder="Confirm new password"
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
              invalid={Boolean(fields.confirmPassword)}
              autoComplete="new-password"
            />
            {fields.confirmPassword ? <p className="field-error">{fields.confirmPassword}</p> : null}
            <PasswordRules password={newPassword} invalid={Boolean(fields.newPassword)} />
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {loading ? 'Saving…' : 'Continue'}
            </button>
          </form>
        ) : null}

        {step === 'forgot' ? (
          <form className="login-form" onSubmit={handleSendReset}>
            <label className={`login-field${fields.email ? ' is-invalid' : ''}`}>
              <span className="login-field-icon" aria-hidden="true"><Icon.User /></span>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setField('email', '') }}
                placeholder="Admin email"
              />
            </label>
            {fields.email ? <p className="field-error">{fields.email}</p> : null}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {loading ? 'Sending…' : 'Send code'}
            </button>
            <button type="button" className="login-text-btn" onClick={() => setStep('login')}>Back</button>
          </form>
        ) : null}

        {step === 'reset_code' ? (
          <form className="login-form" onSubmit={handleReset}>
            <CodeBoxes value={code} onChange={(value) => { setCode(value); setField('code', '') }} />
            {fields.code ? <p className="field-error">{fields.code}</p> : null}
            <PasswordInput
              value={newPassword}
              onChange={(value) => { setNewPassword(value); setField('newPassword', '') }}
              placeholder="New password"
              visible={showNewPassword}
              onToggle={() => setShowNewPassword((v) => !v)}
              invalid={Boolean(fields.newPassword)}
              autoComplete="new-password"
            />
            {fields.newPassword ? <p className="field-error">{fields.newPassword}</p> : null}
            <PasswordInput
              value={confirmPassword}
              onChange={(value) => { setConfirmPassword(value); setField('confirmPassword', '') }}
              placeholder="Confirm new password"
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
              invalid={Boolean(fields.confirmPassword)}
              autoComplete="new-password"
            />
            {fields.confirmPassword ? <p className="field-error">{fields.confirmPassword}</p> : null}
            <PasswordRules password={newPassword} invalid={Boolean(fields.newPassword)} />
            <button type="submit" className="login-btn" disabled={loading || secondsLeft <= 0}>
              {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {loading ? 'Saving…' : 'Reset password'}
            </button>
            <div className="login-code-meta">
              <p className="login-expire">
                {secondsLeft > 0
                  ? 'This code will expire in 10 minutes.'
                  : 'This code has expired.'}
              </p>
              <button
                type="button"
                className="login-text-btn"
                onClick={sendCode}
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
      <StatusModal status={status} onClose={closeStatus} />
    </div>
  )
}

function PasswordInput({ value, onChange, placeholder, visible, onToggle, invalid, autoComplete }) {
  return (
    <label className={`login-field${invalid ? ' is-invalid' : ''}`}>
      <span className="login-field-icon" aria-hidden="true"><Icon.Lock /></span>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="login-password-toggle"
        onClick={onToggle}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <Icon.EyeOff /> : <Icon.Eye />}
      </button>
    </label>
  )
}

function PasswordRules({ password, invalid }) {
  const rules = getPasswordRuleChecks(password)
  return (
    <ul className="login-rules" aria-live="polite">
      {rules.map((rule) => (
        <li key={rule.id} className={rule.met ? 'met' : invalid ? 'miss' : ''}>
          {rule.met ? '✓' : '•'} {rule.label}
        </li>
      ))}
    </ul>
  )
}
