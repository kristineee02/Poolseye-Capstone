import { useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { FormModal, ConfirmModal } from '../components/ui/Modal'
import { StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { lifeguards as initialLifeguards } from '../data/lifeguards'
import './LifeguardsPage.css'

const ROLES = ['Primary Lifeguard', 'Backup Lifeguard', 'Lifeguard', 'On-Duty Supervisor']
const ZONES = ['Main Pool', 'North Pool', 'Kiddie Pool', 'Entrance']

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'Lifeguard',
  assignedZones: [],
  certifications: ['Lifeguard'],
  status: 'active',
}

export default function LifeguardsPage() {
  const [guards, setGuards] = useState(initialLifeguards)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [alertMsg, setAlertMsg] = useState('')
  const [alertPriority, setAlertPriority] = useState('high')
  const [search, setSearch] = useState('')
  const { toasts, addToast, removeToast } = useToast()

  const filtered = guards.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.role.toLowerCase().includes(search.toLowerCase()) ||
      g.email.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = guards.filter((g) => g.status === 'active').length

  const toggleZone = (zone) => {
    setFormData((f) => ({
      ...f,
      assignedZones: f.assignedZones.includes(zone)
        ? f.assignedZones.filter((z) => z !== zone)
        : [...f.assignedZones, zone],
    }))
  }

  const handleAdd = () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      addToast('Name and email are required.', 'warning')
      return
    }
    const newGuard = {
      id: `lg-${Date.now()}`,
      initials: formData.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
      ...formData,
      certifications: ['Lifeguard'],
      createdAt: new Date().toISOString(),
      mobileAppStatus: 'disconnected',
      channels: [{ label: 'App push', primary: true }],
      acknowledgedAlerts: 0,
      missedAlerts: 0,
      lastAlertAcknowledgedAt: null,
      onDutySince: null,
    }
    setGuards([...guards, newGuard])
    setShowAddModal(false)
    addToast(`Account for ${formData.name} created`, 'success')
  }

  const handleUpdate = () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      addToast('Name and email are required.', 'warning')
      return
    }
    setGuards(guards.map((g) =>
      g.id === selected.id
        ? {
            ...g,
            ...formData,
            initials: formData.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
          }
        : g
    ))
    setShowEditModal(false)
    addToast(`${formData.name}'s account updated`, 'success')
  }

  const handleDelete = () => {
    setGuards(guards.filter((g) => g.id !== selected.id))
    addToast(`${selected.name}'s account removed`, 'info')
  }

  const handleToggleStatus = (guard) => {
    const newStatus = guard.status === 'active' ? 'inactive' : 'active'
    setGuards(guards.map((g) => (g.id === guard.id ? { ...g, status: newStatus } : g)))
    addToast(
      `${guard.name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`,
      newStatus === 'active' ? 'success' : 'info'
    )
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
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="pagehead">
        <div>
          <h1>Lifeguard accounts</h1>
          <div className="sub">{activeCount} active · {guards.length} total accounts</div>
        </div>
        <div className="pagehead-right">
          <button className="btn-secondary" onClick={() => setShowAlertModal(true)}>
            <Icon.Send />
            Broadcast alert
          </button>
          <button className="btn-primary" onClick={() => { setFormData(emptyForm); setShowAddModal(true) }}>
            <Icon.Plus />
            Add lifeguard
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="lg-stat-strip">
        {[
          { label: 'Total accounts', value: guards.length, icon: Icon.Users },
          { label: 'Active', value: guards.filter((g) => g.status === 'active').length, icon: Icon.Shield, accent: true },
          { label: 'Inactive', value: guards.filter((g) => g.status === 'inactive').length, icon: Icon.Power },
          { label: 'App connected', value: guards.filter((g) => g.mobileAppStatus === 'connected').length, icon: Icon.Phone },
        ].map(({ label, value, icon: SIcon, accent }) => (
          <div key={label} className={`lg-stat-card ${accent && value > 0 ? 'accent' : ''}`}>
            <SIcon />
            <div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + List */}
      <div className="panel">
        <div className="panel-head">
          <h3>Lifeguard roster</h3>
          <div className="search-box">
            <Icon.Search />
            <input
              type="text"
              placeholder="Search by name, role, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Icon.Users}
            title={search ? 'No lifeguards match your search' : 'No lifeguard accounts yet'}
            description={search ? 'Try a different search term.' : 'Create your first lifeguard account.'}
            action={!search && (
              <button className="btn-primary" onClick={() => { setFormData(emptyForm); setShowAddModal(true) }}>
                <Icon.Plus /> Add lifeguard
              </button>
            )}
          />
        ) : (
          <div className="lg-list">
            {filtered.map((guard) => (
              <div key={guard.id} className={`lg-row ${guard.status === 'inactive' ? 'inactive' : ''}`}>
                <div className="lg-avatar">{guard.initials}</div>
                <div className="lg-info">
                  <div className="lg-name">
                    {guard.name}
                    <StatusBadge status={guard.status} />
                    {guard.mobileAppStatus === 'connected' && (
                      <span className="app-connected-pill">
                        <Icon.Phone /> App
                      </span>
                    )}
                  </div>
                  <div className="lg-role">{guard.role}</div>
                  <div className="lg-meta">
                    <span><Icon.Mail /> {guard.email}</span>
                    <span><Icon.Phone /> {guard.phone}</span>
                    {guard.assignedZones.length > 0 && (
                      <span><Icon.Fence /> {guard.assignedZones.join(', ')}</span>
                    )}
                  </div>
                  {guard.certifications.length > 0 && (
                    <div className="lg-certs">
                      {guard.certifications.map((c) => (
                        <span key={c} className="cert-pill">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="lg-stats">
                  <div className="lg-stat">
                    <span className="lg-stat-val">{guard.acknowledgedAlerts}</span>
                    <span className="lg-stat-lbl">Acknowledged</span>
                  </div>
                  <div className="lg-stat">
                    <span className={`lg-stat-val ${guard.missedAlerts > 0 ? 'alarm' : ''}`}>{guard.missedAlerts}</span>
                    <span className="lg-stat-lbl">Missed</span>
                  </div>
                </div>
                <div className="lg-actions">
                  <button
                    className="btn-icon-secondary"
                    title="Edit account"
                    onClick={() => {
                      setSelected(guard)
                      setFormData({
                        name: guard.name,
                        email: guard.email,
                        phone: guard.phone,
                        role: guard.role,
                        assignedZones: [...guard.assignedZones],
                        certifications: [...guard.certifications],
                        status: guard.status,
                      })
                      setShowEditModal(true)
                    }}
                  >
                    <Icon.Edit />
                  </button>
                  <button
                    className="btn-icon-secondary"
                    title={guard.status === 'active' ? 'Deactivate' : 'Activate'}
                    onClick={() => handleToggleStatus(guard)}
                  >
                    <Icon.Power />
                  </button>
                  <button
                    className="btn-icon-secondary"
                    title="Remove account"
                    onClick={() => { setSelected(guard); setShowDeleteModal(true) }}
                  >
                    <Icon.Trash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      <FormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Lifeguard Account"
        onSubmit={handleAdd}
        submitText="Create account"
      >
        <div className="form-row-2">
          <div className="form-field">
            <label>Full Name *</label>
            <input
              type="text"
              placeholder="e.g., Jonas Ramos"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Role</label>
            <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-field">
            <label>Email Address *</label>
            <input
              type="email"
              placeholder="<email>"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Phone</label>
            <input
              type="tel"
              placeholder="<phone>"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
        </div>
        <div className="form-field">
          <label>Assigned Zones</label>
          <div className="check-group">
            {ZONES.map((z) => (
              <label key={z} className="check-pill">
                <input
                  type="checkbox"
                  checked={formData.assignedZones.includes(z)}
                  onChange={() => toggleZone(z)}
                />
                {z}
              </label>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label>Certification</label>
          <div className="cert-fixed-pill">
            <Icon.Shield /> Lifeguard
          </div>
        </div>
      </FormModal>

      {/* Edit Modal */}
      <FormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Edit: ${selected?.name}`}
        onSubmit={handleUpdate}
        submitText="Save changes"
      >
        <div className="form-row-2">
          <div className="form-field">
            <label>Full Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Role</label>
            <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
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
        <div className="form-field">
          <label>Status</label>
          <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="form-field">
          <label>Assigned Zones</label>
          <div className="check-group">
            {ZONES.map((z) => (
              <label key={z} className="check-pill">
                <input
                  type="checkbox"
                  checked={formData.assignedZones.includes(z)}
                  onChange={() => toggleZone(z)}
                />
                {z}
              </label>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label>Certification</label>
          <div className="cert-fixed-pill">
            <Icon.Shield /> Lifeguard
          </div>
        </div>
      </FormModal>

      {/* Broadcast Alert Modal */}
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
            <option value="high">🔴 High — Drowning / Immediate danger</option>
            <option value="medium">🟡 Medium — Unsupervised child</option>
            <option value="low">🟢 Low — Informational</option>
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

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Remove Lifeguard Account"
        message={`Permanently remove ${selected?.name}'s account? They will lose all access to the system.`}
        onConfirm={handleDelete}
        isDangerous
        confirmText="Remove account"
        cancelText="Keep account"
      />
    </div>
  )
}
