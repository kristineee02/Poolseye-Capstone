import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { FormModal, ConfirmModal, StatusModal, useStatusModal } from '../components/ui/Modal'
import { SelectDropdown } from '../components/ui/Dropdown'
import { StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import {
  fetchLifeguards,
  createLifeguard,
  updateLifeguard,
  archiveLifeguard,
  restoreLifeguard,
  sendVerificationCode,
  confirmVerificationCode,
  sendWelcomeEmail,
  isValidEmail,
} from '../api/lifeguards'
import { getPasswordRuleChecks, validatePassword } from '../utils/password'
import './LifeguardsPage.css'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]
const ALERT_PRIORITY_OPTIONS = [
  { value: 'high', label: 'High — Drowning / Immediate danger' },
  { value: 'medium', label: 'Medium — Unsupervised child' },
  { value: 'low', label: 'Low — Informational' },
]
const DEFAULT_ROLE = 'Lifeguard'
const DEFAULT_ASSIGNED_ZONES = ['Main Pool']
const PAGE_SIZE = 4
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

const emptyAddForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  role: DEFAULT_ROLE,
  assignedZones: [...DEFAULT_ASSIGNED_ZONES],
  status: 'active',
}

function buildFullName({ firstName, middleName, lastName } = {}) {
  return [firstName, middleName, lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
}

function splitFullName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { firstName: '', middleName: '', lastName: '' }
  }
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: '', lastName: '' }
  }
  if (parts.length === 2) {
    return { firstName: parts[0], middleName: '', lastName: parts[1] }
  }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

function ReadonlyAssignmentFields() {
  return (
    <div className="form-row-2">
      <div className="form-field">
        <label>Role</label>
        <div className="lg-readonly-field" aria-readonly="true">
          {DEFAULT_ROLE}
        </div>
      </div>
      <div className="form-field">
        <label>Assigned zone</label>
        <div className="lg-readonly-field" aria-readonly="true">
          {DEFAULT_ASSIGNED_ZONES[0]}
        </div>
      </div>
    </div>
  )
}

function FormAvatarPicker({ name, photoUri, onPick, inputRef, onPhotoSelected, error }) {
  const initials = useMemo(() => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return 'LG'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }, [name])

  return (
    <div className="lg-form-photo">
      <div className="lg-form-avatar-wrap">
        <button type="button" className="lg-form-avatar" onClick={onPick} aria-label="Upload profile picture">
          {photoUri ? (
            <img src={photoUri} alt="" className="lg-form-avatar-img" />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
        </button>
        <button
          type="button"
          className="lg-form-camera-badge"
          onClick={onPick}
          aria-label="Upload profile picture"
        >
          <img src="/icons/camera.png" alt="" className="lg-form-camera-icon" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="lg-file-input"
          onChange={onPhotoSelected}
        />
      </div>
      <p className="lg-form-photo-hint">Profile picture (optional)</p>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  )
}

function PasswordInput({ label, value, onChange, placeholder, visible, onToggle, error }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <div className="lg-password-wrap">
        <input
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
        />
        <button
          type="button"
          className="lg-password-toggle"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <Icon.EyeOff /> : <Icon.Eye />}
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  )
}

function PasswordRequirements({ rules }) {
  return (
    <div className="lg-password-rules">
      <h4 className="lg-password-rules-title">Password requirements</h4>
      <ul className="lg-password-rules-list">
        {rules.map((rule, index) => (
          <li
            key={rule.id}
            className={`lg-password-rule${rule.met ? ' met' : ''}${index < rules.length - 1 ? ' bordered' : ''}`}
          >
            <span className="lg-password-rule-check" aria-hidden="true">
              {rule.met ? <Icon.Check /> : null}
            </span>
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function LifeguardsPage() {
  const [guards, setGuards] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [formData, setFormData] = useState(emptyAddForm)
  const [tempPassword, setTempPassword] = useState('')
  const [confirmTempPassword, setConfirmTempPassword] = useState('')
  const [showTempPassword, setShowTempPassword] = useState(false)
  const [showConfirmTempPassword, setShowConfirmTempPassword] = useState(false)
  const [addPhotoUri, setAddPhotoUri] = useState(null)
  const [editPhotoUri, setEditPhotoUri] = useState(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const addPhotoInputRef = useRef(null)
  const editPhotoInputRef = useRef(null)
  const [alertMsg, setAlertMsg] = useState('')
  const [alertPriority, setAlertPriority] = useState('high')
  const [search, setSearch] = useState('')
  const [rosterView, setRosterView] = useState('active')
  const [page, setPage] = useState(1)
  const { status, showStatus, closeStatus } = useStatusModal()
  const [fieldErrors, setFieldErrors] = useState({})
  const [photoError, setPhotoError] = useState('')
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetchLifeguards().then(setGuards)
  }, [])

  const emailVerified = useMemo(() => {
    const email = formData.email.trim().toLowerCase()
    return Boolean(email && verifiedEmail === email)
  }, [formData.email, verifiedEmail])

  const canSendCode = isValidEmail(formData.email) && !sendingCode && !emailVerified

  const tempPasswordRules = useMemo(
    () => getPasswordRuleChecks(tempPassword),
    [tempPassword]
  )

  const passwordsMatch =
    !confirmTempPassword || tempPassword === confirmTempPassword

  const rosterGuards = useMemo(() => {
    if (rosterView === 'archived') {
      return guards.filter((g) => g.status === 'archived')
    }
    return guards.filter((g) => g.status !== 'archived')
  }, [guards, rosterView])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rosterGuards
    return rosterGuards.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.role.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.assignedZones.join(' ').toLowerCase().includes(q)
    )
  }, [rosterGuards, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const activeCount = guards.filter((g) => g.status === 'active').length
  const archivedCount = guards.filter((g) => g.status === 'archived').length

  const resetAddForm = () => {
    setFormData(emptyAddForm)
    setTempPassword('')
    setConfirmTempPassword('')
    setShowTempPassword(false)
    setShowConfirmTempPassword(false)
    setAddPhotoUri(null)
    setVerificationCode('')
    setVerifiedEmail('')
    setCodeSent(false)
    setSendingCode(false)
    setVerifyingCode(false)
  }

  const onAddEmailChange = (value) => {
    const nextEmail = value.trim().toLowerCase()
    const currentVerified = verifiedEmail.trim().toLowerCase()
    if (currentVerified && nextEmail !== currentVerified) {
      setVerifiedEmail('')
      setCodeSent(false)
      setVerificationCode('')
    }
    setFormData((f) => ({ ...f, email: value }))
  }

  const handleSendVerificationCode = async () => {
    if (!canSendCode) return
    setSendingCode(true)
    try {
      const result = await sendVerificationCode(formData.email)
      if (!result.ok) {
        showStatus({ tone: 'error', title: 'Code not sent', message: result.error || 'Could not send a verification code.' })
        return
      }
      setCodeSent(true)
      setVerificationCode('')
      showStatus({
        tone: 'success',
        title: 'Code sent',
        message: result.demoCode
          ? `A verification code was sent. Demo code: ${result.demoCode}`
          : (result.message || 'A verification code was sent to this email.'),
      })
    } finally {
      setSendingCode(false)
    }
  }

  const handleVerifyEmail = async () => {
    if (emailVerified || verifyingCode) return
    setVerifyingCode(true)
    try {
      const result = await confirmVerificationCode(formData.email, verificationCode)
      if (!result.ok) {
        showStatus({ tone: 'error', title: 'Verification failed', message: result.error || 'That code is not valid.' })
        return
      }
      const normalized = formData.email.trim().toLowerCase()
      setVerifiedEmail(normalized)
      showStatus({ tone: 'success', title: 'Email verified', message: result.message || 'This email is verified. You can create the account.' })
    } finally {
      setVerifyingCode(false)
    }
  }

  const pickAddPhoto = () => addPhotoInputRef.current?.click()
  const pickEditPhoto = () => editPhotoInputRef.current?.click()

  const onAddPhotoSelected = (e) => {
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
      setAddPhotoUri(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => setPhotoError('Could not read that image.')
    reader.readAsDataURL(file)
  }

  const onEditPhotoSelected = (e) => {
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
      setEditPhotoUri(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => setPhotoError('Could not read that image.')
    reader.readAsDataURL(file)
  }

  const openAddModal = () => {
    resetAddForm()
    setShowAddModal(true)
  }

  const openEdit = (guard) => {
    setSelected(guard)
    setFormData({
      ...splitFullName(guard.name),
      email: guard.email,
      phone: guard.phone,
      role: DEFAULT_ROLE,
      assignedZones: [...DEFAULT_ASSIGNED_ZONES],
      status: guard.status === 'archived' ? 'inactive' : guard.status,
    })
    setEditPhotoUri(guard.photoUri || null)
    setShowEditModal(true)
  }

  const handleAdd = async () => {
    const next = {}
    if (!formData.firstName.trim()) next.firstName = 'First name is required.'
    if (!formData.lastName.trim()) next.lastName = 'Last name is required.'
    if (!emailVerified) next.email = 'Verify this email before creating the account.'
    if (tempPassword !== confirmTempPassword) next.confirmPassword = 'Temporary passwords do not match.'
    const passwordCheck = validatePassword(tempPassword)
    if (!passwordCheck.ok) next.password = 'Password does not meet the requirements.'
    setFieldErrors(next)
    if (Object.keys(next).length) return

    const name = buildFullName(formData)

    setCreating(true)
    const result = await createLifeguard({
      name,
      email: formData.email,
      phone: formData.phone,
      role: DEFAULT_ROLE,
      assignedZones: [...DEFAULT_ASSIGNED_ZONES],
      tempPassword,
      photoUri: addPhotoUri,
    })

    if (!result.ok) {
      setCreating(false)
      showStatus({ tone: 'error', title: 'Account not created', message: result.error || 'Could not create this account.' })
      return
    }

    const welcome = await sendWelcomeEmail({
      email: result.guard.email,
      name: result.guard.name,
      tempPassword,
    })

    setCreating(false)
    setGuards(await fetchLifeguards())
    setShowAddModal(false)
    resetAddForm()
    showStatus({
      tone: 'success',
      title: 'Account created',
      message: `Account for ${result.guard.name} was created.${welcome.ok ? ' A welcome email was sent with the login details.' : ''}`,
    })
  }

  const handleUpdate = async () => {
    const next = {}
    if (!formData.firstName.trim()) next.firstName = 'First name is required.'
    if (!formData.lastName.trim()) next.lastName = 'Last name is required.'
    setFieldErrors(next)
    if (Object.keys(next).length) return
    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()

    const name = buildFullName(formData)

    setUpdating(true)
    const result = await updateLifeguard(selected.id, {
      name,
      email: formData.email,
      phone: formData.phone,
      role: DEFAULT_ROLE,
      assignedZones: [...DEFAULT_ASSIGNED_ZONES],
      status: formData.status,
      photoUri: editPhotoUri,
    })

    if (!result.ok) {
      setUpdating(false)
      showStatus({ tone: 'error', title: 'Account not updated', message: result.error || 'Could not update this account.' })
      return
    }

    setUpdating(false)
    setGuards(await fetchLifeguards())
    setShowEditModal(false)
    showStatus({ tone: 'success', title: 'Account updated', message: `${name}'s account was updated.` })
  }

  const handleDeactivate = async () => {
    const result = await archiveLifeguard(selected.id)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Could not deactivate', message: result.error || 'Could not archive this account.' })
      return
    }
    setGuards(await fetchLifeguards())
    showStatus({ tone: 'success', title: 'Account archived', message: `${selected.name} was deactivated and moved to Archived.` })
  }

  const handleRestore = async (guard) => {
    const result = await restoreLifeguard(guard.id)
    if (!result.ok) {
      showStatus({ tone: 'error', title: 'Could not activate', message: result.error || 'Could not restore this account.' })
      return
    }
    setGuards(await fetchLifeguards())
    showStatus({ tone: 'success', title: 'Account activated', message: `${guard.name} is active again.` })
  }

  const handleSendAlert = () => {
    if (!alertMsg.trim()) {
      setFieldErrors((current) => ({ ...current, alert: 'Enter an alert message.' }))
      return
    }
    const recipients = guards.filter((g) => g.status === 'active').length
    setShowAlertModal(false)
    setAlertMsg('')
    showStatus({
      tone: 'success',
      title: 'Alert sent',
      message: `Alert dispatched to ${recipients} lifeguard${recipients !== 1 ? 's' : ''}.`,
    })
  }

  return (
    <div className="page lg-page">
      <StatusModal status={status} onClose={closeStatus} />

      <div className="pagehead">
        <div>
          <h1>Lifeguard accounts</h1>
          <div className="sub">Managing accounts</div>
        </div>
        <div className="pagehead-right">
          <button type="button" className="btn-warning" onClick={() => setShowAlertModal(true)}>
            <Icon.Send />
            Broadcast alert
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={openAddModal}
          >
            <Icon.Plus />
            Add lifeguard
          </button>
        </div>
      </div>

      <div className="lg-toolbar">
        <div className="lg-search-bar">
          <Icon.Search />
          <input
            type="text"
            placeholder="Search by name, role, email, or location…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <button
          type="button"
          className={`lg-view-icon ${rosterView === 'archived' ? 'active' : ''}`}
          onClick={() => {
            setRosterView((v) => (v === 'archived' ? 'active' : 'archived'))
            setPage(1)
          }}
          title={rosterView === 'archived' ? 'Show active roster' : `Archived${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
          aria-label={rosterView === 'archived' ? 'Show active roster' : 'Show archived accounts'}
          aria-pressed={rosterView === 'archived'}
        >
          <Icon.Archive />
        </button>
      </div>

      <div className="panel lg-roster-panel">
        {filtered.length === 0 ? (
          <div className="lg-empty-panel">
            <EmptyState
              icon={Icon.Users}
              title={
                search
                  ? 'No lifeguards match your search'
                  : rosterView === 'archived'
                    ? 'No archived accounts'
                    : 'No lifeguard accounts yet'
              }
              description={
                search
                  ? 'Try a different search term.'
                  : rosterView === 'archived'
                    ? 'Archived lifeguards will appear here.'
                    : 'Create your first lifeguard account.'
              }
              action={
                !search && rosterView !== 'archived' ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={openAddModal}
                  >
                    <Icon.Plus /> Add lifeguard
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="lg-card-list">
            {pageItems.map((guard) => (
              <article
                key={guard.id}
                className={`lg-card ${guard.status === 'inactive' ? 'is-inactive' : ''}`}
              >
                <div className="lg-avatar">
                  {guard.photoUri ? (
                    <img src={guard.photoUri} alt="" className="lg-avatar-img" />
                  ) : (
                    guard.initials
                  )}
                </div>

                <div className="lg-info">
                  <div className="lg-name-row">
                    <span className="lg-name-text">{guard.name}</span>
                    <StatusBadge status={guard.status === 'archived' ? 'inactive' : guard.status} />
                    {guard.mobileAppStatus === 'connected' && guard.status !== 'archived' ? (
                      <span className="app-connected-pill">
                        <Icon.Phone /> App
                      </span>
                    ) : null}
                  </div>
                  <div className="lg-role">{guard.role}</div>
                  <div className="lg-meta">
                    <span><Icon.Mail /> {guard.email}</span>
                    <span><Icon.Phone /> {guard.phone}</span>
                    {guard.assignedZones.length > 0 ? (
                      <span><Icon.Fence /> {guard.assignedZones.join(', ')}</span>
                    ) : null}
                  </div>
                </div>

                <div className="lg-stats">
                  <div className="lg-stat">
                    <span className="lg-stat-val">{guard.acknowledgedAlerts}</span>
                    <span className="lg-stat-lbl">Acknowledged</span>
                  </div>
                  <div className="lg-stat">
                    <span className={`lg-stat-val ${guard.missedAlerts > 0 ? 'alarm' : ''}`}>
                      {guard.missedAlerts}
                    </span>
                    <span className="lg-stat-lbl">Missed</span>
                  </div>
                </div>

                <div className="lg-actions">
                  {rosterView === 'archived' ? (
                    <button
                      type="button"
                      className="btn-icon-secondary"
                      title="Activate account"
                      onClick={() => handleRestore(guard)}
                    >
                      <Icon.Power />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-icon-secondary"
                        title="Edit account"
                        onClick={() => openEdit(guard)}
                      >
                        <Icon.Edit />
                      </button>
                      <button
                        type="button"
                        className="btn-icon-secondary"
                        title="Deactivate"
                        onClick={() => {
                          setSelected(guard)
                          setShowArchiveModal(true)
                        }}
                      >
                        <Icon.Power />
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {filtered.length > 0 ? (
          <Pagination
            className="ui-pagination--inset"
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            summary={`Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          />
        ) : null}
      </div>

      <FormModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false)
          resetAddForm()
        }}
        title="Add Lifeguard Account"
        onSubmit={handleAdd}
        submitText="Create account"
        submitting={creating}
      >
        <FormAvatarPicker
          name={buildFullName(formData)}
          photoUri={addPhotoUri}
          onPick={pickAddPhoto}
          inputRef={addPhotoInputRef}
          onPhotoSelected={onAddPhotoSelected}
          error={photoError}
        />
        <div className="form-row-3 lg-name-fields">
          <div className="form-field">
            <label>First name *</label>
            <input
              type="text"
              className={fieldErrors.firstName ? 'is-invalid' : ''}
              placeholder="e.g., Jonas"
              value={formData.firstName}
              onChange={(e) => {
                setFormData({ ...formData, firstName: e.target.value })
                setFieldErrors((current) => ({ ...current, firstName: '' }))
              }}
            />
            {fieldErrors.firstName ? <p className="field-error">{fieldErrors.firstName}</p> : null}
          </div>
          <div className="form-field">
            <label>Middle name</label>
            <input
              type="text"
              placeholder="Optional"
              value={formData.middleName}
              onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Last name *</label>
            <input
              type="text"
              className={fieldErrors.lastName ? 'is-invalid' : ''}
              placeholder="e.g., Ramos"
              value={formData.lastName}
              onChange={(e) => {
                setFormData({ ...formData, lastName: e.target.value })
                setFieldErrors((current) => ({ ...current, lastName: '' }))
              }}
            />
            {fieldErrors.lastName ? <p className="field-error">{fieldErrors.lastName}</p> : null}
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-field">
            <label>Email Address *</label>
            <div className="lg-email-verify-row">
              <input
                type="email"
                placeholder="lifeguard@example.com"
                value={formData.email}
                onChange={(e) => onAddEmailChange(e.target.value)}
                disabled={emailVerified}
                autoComplete="email"
              />
              {!emailVerified ? (
                <button
                  type="button"
                  className="btn-primary lg-email-verify-send"
                  onClick={handleSendVerificationCode}
                  disabled={!canSendCode}
                >
                  {sendingCode ? 'Sending…' : codeSent ? 'Resend' : 'Send code'}
                </button>
              ) : (
                <span className="lg-email-verified-badge">
                  <Icon.Check /> Verified
                </span>
              )}
            </div>
            {codeSent && !emailVerified ? (
              <div className="lg-email-code-row">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  className="btn-primary lg-email-verify-confirm"
                  onClick={handleVerifyEmail}
                  disabled={verificationCode.length !== 6 || verifyingCode}
                >
                  {verifyingCode ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            ) : null}
            {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : null}
            {!emailVerified ? (
              <p className="lg-form-hint">Send a code to verify this email before creating the account.</p>
            ) : null}
          </div>
          <div className="form-field">
            <label>Phone</label>
            <input
              type="tel"
              placeholder="Optional contact number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
        </div>
        <ReadonlyAssignmentFields />
        <PasswordInput
          label="Temporary password *"
          value={tempPassword}
          onChange={(value) => {
            setTempPassword(value)
            setFieldErrors((current) => ({ ...current, password: '' }))
          }}
          error={fieldErrors.password}
          placeholder="Admin-issued first-login password"
          visible={showTempPassword}
          onToggle={() => setShowTempPassword((v) => !v)}
        />
        <PasswordInput
          label="Confirm temporary password *"
          value={confirmTempPassword}
          onChange={(value) => {
            setConfirmTempPassword(value)
            setFieldErrors((current) => ({ ...current, confirmPassword: '' }))
          }}
          error={fieldErrors.confirmPassword}
          placeholder="Re-enter temporary password"
          visible={showConfirmTempPassword}
          onToggle={() => setShowConfirmTempPassword((v) => !v)}
        />
        {!passwordsMatch ? (
          <p className="lg-form-hint lg-password-mismatch">Passwords do not match.</p>
        ) : null}
        <PasswordRequirements rules={tempPasswordRules} />
        <p className="lg-form-hint">
          Share this with the lifeguard for first mobile login. They will be asked to change it.
        </p>
      </FormModal>

      <FormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Edit: ${selected?.name}`}
        onSubmit={handleUpdate}
        submitText="Save changes"
        submitting={updating}
      >
        <FormAvatarPicker
          name={buildFullName(formData)}
          photoUri={editPhotoUri}
          error={photoError}
          onPick={pickEditPhoto}
          inputRef={editPhotoInputRef}
          onPhotoSelected={onEditPhotoSelected}
        />
        <div className="form-row-3 lg-name-fields">
          <div className="form-field">
            <label>First name *</label>
            <input
              type="text"
              className={fieldErrors.firstName ? 'is-invalid' : ''}
              value={formData.firstName}
              onChange={(e) => {
                setFormData({ ...formData, firstName: e.target.value })
                setFieldErrors((current) => ({ ...current, firstName: '' }))
              }}
            />
            {fieldErrors.firstName ? <p className="field-error">{fieldErrors.firstName}</p> : null}
          </div>
          <div className="form-field">
            <label>Middle name</label>
            <input
              type="text"
              placeholder="Optional"
              value={formData.middleName}
              onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Last name *</label>
            <input
              type="text"
              className={fieldErrors.lastName ? 'is-invalid' : ''}
              value={formData.lastName}
              onChange={(e) => {
                setFormData({ ...formData, lastName: e.target.value })
                setFieldErrors((current) => ({ ...current, lastName: '' }))
              }}
            />
            {fieldErrors.lastName ? <p className="field-error">{fieldErrors.lastName}</p> : null}
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-field">
            <label>Email Address *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
        </div>
        <ReadonlyAssignmentFields />
        <div className="form-field">
          <label>Status</label>
          <SelectDropdown
            value={formData.status}
            onChange={(status) => setFormData({ ...formData, status })}
            options={STATUS_OPTIONS}
            ariaLabel="Account status"
          />
        </div>
      </FormModal>

      <FormModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title="Broadcast Emergency Alert"
        onSubmit={handleSendAlert}
        submitText="Send to all active lifeguards"
      >
        <div className="alert-broadcast-info">
          <Icon.Bell />
          <p>
            This alert will be pushed instantly to all <strong>{activeCount}</strong> active lifeguards via the mobile app.
          </p>
        </div>
        <div className="form-field">
          <label>Priority</label>
          <SelectDropdown
            value={alertPriority}
            onChange={setAlertPriority}
            options={ALERT_PRIORITY_OPTIONS}
            ariaLabel="Alert priority"
          />
        </div>
        <div className="form-field">
          <label>Alert message *</label>
          <textarea
            rows={3}
            placeholder="e.g., Child unattended in main pool — Zone 1. Respond immediately."
            className={`alert-textarea${fieldErrors.alert ? ' is-invalid' : ''}`}
            value={alertMsg}
            onChange={(e) => {
              setAlertMsg(e.target.value)
              setFieldErrors((current) => ({ ...current, alert: '' }))
            }}
          />
          {fieldErrors.alert ? <p className="field-error">{fieldErrors.alert}</p> : null}
        </div>
      </FormModal>

      <ConfirmModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        title="Deactivate Lifeguard Account"
        message={`Deactivate ${selected?.name}'s account? They will be moved to Archived and lose access. You can activate them again anytime.`}
        onConfirm={handleDeactivate}
        confirmText="Deactivate"
        cancelText="Cancel"
      />
    </div>
  )
}
