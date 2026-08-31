import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { FormModal, ConfirmModal } from '../components/ui/Modal'
import { StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import { useToast, ToastContainer } from '../components/ui/Toast'
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

const ROLES = ['Primary Lifeguard', 'Backup Lifeguard', 'Lifeguard', 'On-Duty Supervisor']
const ZONES = ['Main Pool', 'North Pool', 'Kiddie Pool', 'Entrance']
const PAGE_SIZE = 4
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

const emptyAddForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'Lifeguard',
  assignedZones: [],
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

function FormAvatarPicker({ name, photoUri, onPick, inputRef, onPhotoSelected }) {
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
    </div>
  )
}

function PasswordInput({ label, value, onChange, placeholder, visible, onToggle }) {
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
  const { toasts, addToast, removeToast } = useToast()

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

  const toggleZone = (zone) => {
    setFormData((f) => ({
      ...f,
      assignedZones: f.assignedZones.includes(zone)
        ? f.assignedZones.filter((z) => z !== zone)
        : [...f.assignedZones, zone],
    }))
  }

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
        addToast(result.error, 'warning')
        return
      }
      setCodeSent(true)
      setVerificationCode('')
      addToast(result.message, 'success')
      if (result.demoCode) {
        addToast(`Demo mode: verification code is ${result.demoCode}`, 'info')
      }
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
        addToast(result.error, 'warning')
        return
      }
      const normalized = formData.email.trim().toLowerCase()
      setVerifiedEmail(normalized)
      addToast(result.message, 'success')
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
      addToast('Please choose an image file.', 'warning')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      addToast('Image must be 2MB or smaller.', 'warning')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAddPhotoUri(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => addToast('Could not read that image.', 'error')
    reader.readAsDataURL(file)
  }

  const onEditPhotoSelected = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      addToast('Please choose an image file.', 'warning')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      addToast('Image must be 2MB or smaller.', 'warning')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setEditPhotoUri(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => addToast('Could not read that image.', 'error')
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
      role: guard.role,
      assignedZones: [...guard.assignedZones],
      status: guard.status === 'archived' ? 'inactive' : guard.status,
    })
    setEditPhotoUri(guard.photoUri || null)
    setShowEditModal(true)
  }

  const handleAdd = async () => {
    if (!emailVerified) {
      addToast('Verify the email address before creating an account.', 'warning')
      return
    }

    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()
    if (!firstName) {
      addToast('First name is required.', 'warning')
      return
    }
    if (!lastName) {
      addToast('Last name is required.', 'warning')
      return
    }

    if (tempPassword !== confirmTempPassword) {
      addToast('Temporary passwords do not match.', 'warning')
      return
    }

    const passwordCheck = validatePassword(tempPassword)
    if (!passwordCheck.ok) {
      addToast(passwordCheck.error, 'warning')
      return
    }

    const name = buildFullName(formData)

    const result = await createLifeguard({
      name,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
      assignedZones: formData.assignedZones,
      tempPassword,
      photoUri: addPhotoUri,
    })

    if (!result.ok) {
      addToast(result.error, 'warning')
      return
    }

    const welcome = await sendWelcomeEmail({
      email: result.guard.email,
      name: result.guard.name,
      tempPassword,
    })

    setGuards(await fetchLifeguards())
    setShowAddModal(false)
    resetAddForm()
    addToast(
      `Account for ${result.guard.name} created.${welcome.ok ? ' Welcome email sent with login details.' : ''}`,
      'success'
    )
  }

  const handleUpdate = async () => {
    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()
    if (!firstName) {
      addToast('First name is required.', 'warning')
      return
    }
    if (!lastName) {
      addToast('Last name is required.', 'warning')
      return
    }

    const name = buildFullName(formData)

    const result = await updateLifeguard(selected.id, {
      name,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
      assignedZones: formData.assignedZones,
      status: formData.status,
      photoUri: editPhotoUri,
    })

    if (!result.ok) {
      addToast(result.error, 'warning')
      return
    }

    setGuards(await fetchLifeguards())
    setShowEditModal(false)
    addToast(`${name}'s account updated`, 'success')
  }

  const handleDeactivate = async () => {
    const result = await archiveLifeguard(selected.id)
    if (!result.ok) {
      addToast(result.error, 'warning')
      return
    }
    setGuards(await fetchLifeguards())
    addToast(`${selected.name} deactivated and moved to Archived`, 'info')
  }

  const handleRestore = async (guard) => {
    const result = await restoreLifeguard(guard.id)
    if (!result.ok) {
      addToast(result.error, 'warning')
      return
    }
    setGuards(await fetchLifeguards())
    addToast(`${guard.name} activated`, 'success')
  }

  const handleSendAlert = () => {
    if (!alertMsg.trim()) {
      addToast('Please enter an alert message.', 'warning')
      return
    }
    const recipients = guards.filter((g) => g.status === 'active').length
    setShowAlertModal(false)
    setAlertMsg('')
    addToast(`Alert dispatched to ${recipients} lifeguard${recipients !== 1 ? 's' : ''}`, 'success')
  }

  return (
    <div className="page lg-page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="pagehead">
        <div>
          <h1>Lifeguard accounts</h1>
          <div className="sub">Managing accounts</div>
        </div>
        <div className="pagehead-right">
          <button type="button" className="btn-secondary" onClick={() => setShowAlertModal(true)}>
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
        submitDisabled={!emailVerified}
      >
        <FormAvatarPicker
          name={buildFullName(formData)}
          photoUri={addPhotoUri}
          onPick={pickAddPhoto}
          inputRef={addPhotoInputRef}
          onPhotoSelected={onAddPhotoSelected}
        />
        <div className="form-row-3 lg-name-row">
          <div className="form-field">
            <label>First name *</label>
            <input
              type="text"
              placeholder="e.g., Jonas"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
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
              placeholder="e.g., Ramos"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>
        </div>
        <div className="form-field">
          <label>Role</label>
          <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
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
                  className="btn-secondary lg-email-verify-confirm"
                  onClick={handleVerifyEmail}
                  disabled={verificationCode.length !== 6 || verifyingCode}
                >
                  {verifyingCode ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            ) : null}
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
        <div className="form-field">
          <label>Assigned Zones</label>
          <p className="lg-form-hint lg-zone-hint">Select one or more pool areas for this lifeguard.</p>
          <div className="lg-zone-grid" role="group" aria-label="Assigned zones">
            {ZONES.map((z) => {
              const selected = formData.assignedZones.includes(z)
              return (
                <label key={z} className={`lg-zone-card${selected ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    className="lg-zone-input"
                    checked={selected}
                    onChange={() => toggleZone(z)}
                  />
                  <span className="lg-zone-check" aria-hidden="true">
                    {selected ? <Icon.Check /> : null}
                  </span>
                  <span className="lg-zone-label">{z}</span>
                </label>
              )
            })}
          </div>
        </div>
        <PasswordInput
          label="Temporary password *"
          value={tempPassword}
          onChange={setTempPassword}
          placeholder="Admin-issued first-login password"
          visible={showTempPassword}
          onToggle={() => setShowTempPassword((v) => !v)}
        />
        <PasswordInput
          label="Confirm temporary password *"
          value={confirmTempPassword}
          onChange={setConfirmTempPassword}
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
      >
        <FormAvatarPicker
          name={buildFullName(formData)}
          photoUri={editPhotoUri}
          onPick={pickEditPhoto}
          inputRef={editPhotoInputRef}
          onPhotoSelected={onEditPhotoSelected}
        />
        <div className="form-row-3 lg-name-row">
          <div className="form-field">
            <label>First name *</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
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
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>
        </div>
        <div className="form-field">
          <label>Role</label>
          <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
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
        <div className="form-field">
          <label>Status</label>
          <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="form-field">
          <label>Assigned Zones</label>
          <p className="lg-form-hint lg-zone-hint">Select one or more pool areas for this lifeguard.</p>
          <div className="lg-zone-grid" role="group" aria-label="Assigned zones">
            {ZONES.map((z) => {
              const selected = formData.assignedZones.includes(z)
              return (
                <label key={z} className={`lg-zone-card${selected ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    className="lg-zone-input"
                    checked={selected}
                    onChange={() => toggleZone(z)}
                  />
                  <span className="lg-zone-check" aria-hidden="true">
                    {selected ? <Icon.Check /> : null}
                  </span>
                  <span className="lg-zone-label">{z}</span>
                </label>
              )
            })}
          </div>
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
          <select value={alertPriority} onChange={(e) => setAlertPriority(e.target.value)}>
            <option value="high">High — Drowning / Immediate danger</option>
            <option value="medium">Medium — Unsupervised child</option>
            <option value="low">Low — Informational</option>
          </select>
        </div>
        <div className="form-field">
          <label>Alert message *</label>
          <textarea
            className="alert-textarea"
            rows={3}
            placeholder="e.g., Child unattended in main pool — Zone 1. Respond immediately."
            value={alertMsg}
            onChange={(e) => setAlertMsg(e.target.value)}
          />
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
