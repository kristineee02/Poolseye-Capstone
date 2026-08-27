import { useMemo, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { FormModal, ConfirmModal } from '../components/ui/Modal'
import { StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { lifeguards as initialLifeguards } from '../data/lifeguards'
import './LifeguardsPage.css'

const ROLES = ['Primary Lifeguard', 'Backup Lifeguard', 'Lifeguard', 'On-Duty Supervisor']
const ZONES = ['Main Pool', 'North Pool', 'Kiddie Pool', 'Entrance']
const PAGE_SIZE = 4

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
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [alertMsg, setAlertMsg] = useState('')
  const [alertPriority, setAlertPriority] = useState('high')
  const [search, setSearch] = useState('')
  const [rosterView, setRosterView] = useState('active')
  const [page, setPage] = useState(1)
  const { toasts, addToast, removeToast } = useToast()

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

  const openEdit = (guard) => {
    setSelected(guard)
    setFormData({
      name: guard.name,
      email: guard.email,
      phone: guard.phone,
      role: guard.role,
      assignedZones: [...guard.assignedZones],
      certifications: [...guard.certifications],
      status: guard.status === 'archived' ? 'inactive' : guard.status,
    })
    setShowEditModal(true)
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

  const handleDeactivate = () => {
    setGuards(guards.map((g) =>
      g.id === selected.id ? { ...g, status: 'archived' } : g
    ))
    addToast(`${selected.name} deactivated and moved to Archived`, 'info')
  }

  const handleRestore = (guard) => {
    setGuards(guards.map((g) =>
      g.id === guard.id ? { ...g, status: 'active' } : g
    ))
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
            onClick={() => {
              setFormData(emptyForm)
              setShowAddModal(true)
            }}
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
                    onClick={() => {
                      setFormData(emptyForm)
                      setShowAddModal(true)
                    }}
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
                <div className="lg-avatar">{guard.initials}</div>

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
                  {guard.certifications.length > 0 ? (
                    <div className="lg-certs">
                      {guard.certifications.map((c) => (
                        <span key={c} className="cert-pill">{c}</span>
                      ))}
                    </div>
                  ) : null}
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
