import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { ConfirmModal, StatusModal, useStatusModal } from '../components/ui/Modal'
import { useAuth } from '../auth/AuthContext'
import './SettingsPage.css'

const PROFILE_EXTRA_KEY = 'poolseye-admin-profile-extra'
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

function readProfileExtra(email) {
  try {
    const raw = localStorage.getItem(PROFILE_EXTRA_KEY)
    const all = raw ? JSON.parse(raw) : {}
    return all[email] || {}
  } catch {
    return {}
  }
}

function writeProfileExtra(email, extra) {
  try {
    const raw = localStorage.getItem(PROFILE_EXTRA_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[email] = { ...all[email], ...extra }
    localStorage.setItem(PROFILE_EXTRA_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

function formatJoined(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggle,
  autoComplete,
  disabled,
  error,
}) {
  return (
    <label className={`settings-field${error ? ' is-invalid' : ''}`}>
      <span className="field-label">{label}</span>
      <div className="settings-password-wrap">
        <input
          className="field-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <button
          type="button"
          className="settings-eye-btn"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          disabled={disabled}
        >
          {visible ? <Icon.EyeOff /> : <Icon.Eye />}
        </button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}

export default function SettingsPage() {
  const { user, updateProfile, finishPasswordChange } = useAuth()
  const { status, showStatus, closeStatus } = useStatusModal()
  const [photoError, setPhotoError] = useState('')
  const [nameError, setNameError] = useState('')
  const [passwordErrors, setPasswordErrors] = useState({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const fileInputRef = useRef(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('admin')
  const [dateJoined, setDateJoined] = useState('')
  const [photoUri, setPhotoUri] = useState(null)
  const [editing, setEditing] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [confirmSave, setConfirmSave] = useState(false)
  const [confirmPasswordUpdate, setConfirmPasswordUpdate] = useState(false)

  useEffect(() => {
    if (!user) return
    const extra = readProfileExtra(user.email)
    setName(user.name || '')
    setPhone(extra.phone || '')
    setPosition(extra.position || user.role || 'admin')
    setDateJoined(extra.dateJoined || user.createdAt || new Date().toISOString())
    setPhotoUri(user.photoUri || extra.photoUri || null)
  }, [user])

  const initials =
    user?.initials ||
    (name || 'A')
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()

  const roleLabel =
    position === 'admin' || position === 'Site admin' ? 'Site admin' : position

  const passwordChecks = useMemo(() => {
    const hasLength = newPassword.length >= 8
    const hasLower = /[a-z]/.test(newPassword)
    const hasUpper = /[A-Z]/.test(newPassword)
    const hasNumber = /[0-9]/.test(newPassword)
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword)

    return [
      { key: 'length', label: 'At least 8 characters', met: hasLength },
      { key: 'case', label: 'Contains uppercase and lowercase letters', met: hasLower && hasUpper },
      { key: 'number', label: 'Contains at least one number', met: hasNumber },
      { key: 'special', label: 'Contains a special character', met: hasSpecial },
    ]
  }, [newPassword])

  const passwordStrength = useMemo(() => {
    if (!newPassword) return { level: 'empty', label: '', fill: 0 }
    const hasLength = newPassword.length >= 8
    const hasLower = /[a-z]/.test(newPassword)
    const hasUpper = /[A-Z]/.test(newPassword)
    const hasNumber = /[0-9]/.test(newPassword)
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword)

    if (hasLength && hasLower && hasUpper && hasNumber && hasSpecial) {
      return { level: 'strong', label: 'Strong', fill: 100 }
    }
    if (hasLength && ((hasLower || hasUpper) && hasNumber)) {
      return { level: 'medium', label: 'Medium', fill: 66 }
    }
    return { level: 'weak', label: 'Weak', fill: 33 }
  }, [newPassword])

  const pickPhoto = () => {
    if (!editing) return
    fileInputRef.current?.click()
  }

  const onPhotoSelected = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Image must be 2MB or smaller.')
      return
    }

    setPhotoError('')
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoUri(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => setPhotoError('Could not read that image.')
    reader.readAsDataURL(file)
  }

  const saveProfile = () => {
    if (!name.trim()) {
      setNameError('Name is required.')
      return
    }
    setNameError('')
    setSavingProfile(true)
    const result = updateProfile?.({ name: name.trim(), photoUri })
    writeProfileExtra(user.email, {
      phone: phone.trim(),
      position,
      dateJoined,
      photoUri,
    })
    setSavingProfile(false)
    if (result?.ok === false) {
      showStatus({ tone: 'error', title: 'Profile not saved', message: result.error || 'Could not save profile.' })
      return
    }
    setEditing(false)
    showStatus({ tone: 'success', title: 'Profile saved', message: 'Your profile changes were saved.' })
  }

  const resetPasswordFields = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowCurrent(false)
    setShowNew(false)
    setShowConfirm(false)
  }

  const requestPasswordUpdate = () => {
    const next = {}
    if (!currentPassword) next.current = 'Enter your current password.'
    if (!newPassword) next.next = 'Enter a new password.'
    else if (passwordChecks.some((r) => !r.met)) next.next = 'Password does not meet the requirements.'
    if (!confirmPassword) next.confirm = 'Confirm your new password.'
    else if (newPassword && newPassword !== confirmPassword) next.confirm = 'New password and confirmation do not match.'
    setPasswordErrors(next)
    if (Object.keys(next).length) return
    setConfirmPasswordUpdate(true)
  }

  const updatePassword = async () => {
    setSavingPassword(true)
    const result = await finishPasswordChange({ currentPassword, newPassword })
    setSavingPassword(false)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Password not updated', message: result.error || 'Could not update password.' })
      return
    }
    resetPasswordFields()
    setPasswordErrors({})
    showStatus({ tone: 'success', title: 'Password updated', message: 'Your password was changed successfully.' })
  }

  return (
    <div className="page settings-page">
      <div className="pagehead settings-pagehead">
        <div>
          <h1>Settings</h1>
          <p className="sub">Manage your account</p>
        </div>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        <button type="button" className="settings-tab active" role="tab" aria-selected="true">
          <Icon.User />
          Personal Information
        </button>
      </div>

      <section className="settings-card settings-profile-card">
        <div className="settings-profile-layout">
          <aside className="settings-identity">
            <div className="settings-avatar-wrap">
              <button
                type="button"
                className={`settings-avatar ${editing ? 'editable' : ''}`}
                onClick={pickPhoto}
                disabled={!editing}
                aria-label={editing ? 'Change profile picture' : 'Profile picture'}
              >
                {photoUri ? (
                  <img src={photoUri} alt="" className="settings-avatar-img" />
                ) : (
                  <span aria-hidden="true">{initials.slice(0, 1)}</span>
                )}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="settings-camera-badge"
                  onClick={pickPhoto}
                  aria-label="Upload profile picture"
                >
                  <img src="/icons/camera.png" alt="" className="settings-camera-icon" />
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="settings-file-input"
                onChange={onPhotoSelected}
              />
            </div>
            {photoError ? <p className="field-error">{photoError}</p> : null}
            <h2 className="settings-name">{name || user?.name || 'Admin'}</h2>
            <p className="settings-role">{roleLabel}</p>
          </aside>

          <div className="settings-profile-form">
            <div className="settings-card-head">
              <div className="settings-card-title">
                <Icon.User />
                <h3>Profile Information</h3>
              </div>
              <button
                type="button"
                className={`settings-icon-btn ${editing ? 'active' : ''}`}
                onClick={() => setEditing(true)}
                aria-label="Edit profile"
                title="Edit profile"
                disabled={editing}
              >
                <Icon.Edit />
              </button>
            </div>

            <div className="settings-fields">
              <label className={`settings-field${nameError ? ' is-invalid' : ''}`}>
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError('') }}
                  disabled={!editing}
                  autoComplete="name"
                />
                {nameError ? <span className="field-error">{nameError}</span> : null}
              </label>

              <label className="settings-field">
                <span className="field-label">Contact number</span>
                <input
                  className="field-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  disabled={!editing}
                  autoComplete="tel"
                />
              </label>

              <label className="settings-field">
                <span className="field-label">Email</span>
                <input className="field-input settings-input-readonly" value={user?.email || ''} readOnly />
              </label>

              <label className="settings-field">
                <span className="field-label">Date joined</span>
                <input
                  className="field-input settings-input-readonly"
                  value={formatJoined(dateJoined)}
                  readOnly
                />
              </label>

              <label className="settings-field">
                <span className="field-label">Position</span>
                <select
                  className="field-input"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  disabled={!editing}
                >
                  <option value="admin">Site admin</option>
                  <option value="Owner">Owner</option>
                  <option value="Supervisor">Supervisor</option>
                </select>
              </label>
            </div>

            {editing ? (
              <div className="settings-card-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={savingProfile}
                  onClick={() => {
                    if (!name.trim()) {
                      setNameError('Name is required.')
                      return
                    }
                    setNameError('')
                    setConfirmSave(true)
                  }}
                >
                  {savingProfile ? <span className="btn-spinner" aria-hidden="true" /> : null}
                  {savingProfile ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : null}
            </div>
        </div>
      </section>

      <section className="settings-card settings-password-card">
        <div className="settings-card-head">
          <div className="settings-card-title">
            <Icon.Key />
            <h3>Change Password</h3>
          </div>
        </div>

        <div className="settings-password-layout">
          <div className="settings-password-form">
            <div className="settings-password-row">
              <PasswordField
                label="Current password"
                value={currentPassword}
                onChange={(value) => { setCurrentPassword(value); setPasswordErrors((e) => ({ ...e, current: '' })) }}
                placeholder="Enter current password"
                visible={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
                autoComplete="current-password"
                error={passwordErrors.current}
              />

              <PasswordField
                label="New password"
                value={newPassword}
                onChange={(value) => { setNewPassword(value); setPasswordErrors((e) => ({ ...e, next: '' })) }}
                placeholder="Enter new password"
                visible={showNew}
                onToggle={() => setShowNew((v) => !v)}
                autoComplete="new-password"
                error={passwordErrors.next}
              />
              {newPassword ? (
                <div
                  className={`settings-strength settings-strength-${passwordStrength.level}`}
                  aria-live="polite"
                >
                  <div className="settings-strength-meta">
                    <span>Password strength:</span>
                    <strong>{passwordStrength.label}</strong>
                  </div>
                  <div className="settings-strength-track" aria-hidden="true">
                    <div
                      className="settings-strength-fill"
                      style={{ width: `${passwordStrength.fill}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <PasswordField
                label="Confirm password"
                value={confirmPassword}
                onChange={(value) => { setConfirmPassword(value); setPasswordErrors((e) => ({ ...e, confirm: '' })) }}
                placeholder="Confirm new password"
                visible={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                autoComplete="new-password"
                error={passwordErrors.confirm}
              />
            </div>

            <div className="settings-card-actions settings-password-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={savingPassword}
                onClick={requestPasswordUpdate}
              >
                {savingPassword ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {savingPassword ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>

          <aside className="settings-security-panel">
            <div className="settings-security-head">
              <Icon.Lock />
              <h4>Password Security</h4>
            </div>
            <p className="settings-security-copy">
              Keep your account secure with a strong password.
            </p>
            <ul className="settings-security-list">
              {passwordChecks.map((item) => (
                <li key={item.key} className={item.met ? 'met' : ''}>
                  <span className="settings-rule-check" aria-hidden="true">
                    {item.met ? <Icon.Check /> : null}
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <ConfirmModal
        isOpen={confirmSave}
        onClose={() => setConfirmSave(false)}
        title="Save profile?"
        message="Are you sure you want to save these profile changes?"
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={saveProfile}
      />

      <ConfirmModal
        isOpen={confirmPasswordUpdate}
        onClose={() => setConfirmPasswordUpdate(false)}
        title="Update password?"
        message="Are you sure you want to update your password?"
        confirmText="Update"
        cancelText="Cancel"
        onConfirm={updatePassword}
      />

      <StatusModal status={status} onClose={closeStatus} />
    </div>
  )
}
