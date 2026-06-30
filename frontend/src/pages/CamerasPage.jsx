import { useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { Modal, FormModal, ConfirmModal } from '../components/ui/Modal'
import { StatusBadge } from '../components/ui/Badge'
import { DataTable } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast, ToastContainer } from '../components/ui/Toast'
import { cameras as initialCameras } from '../data/cameras'
import './CamerasPage.css'

export default function CamerasPage() {
  const [cameraList, setCameraList] = useState(initialCameras)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedCamera, setSelectedCamera] = useState(null)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({ name: '', ipAddress: '', location: '', zone: '', connectionType: 'IP Camera (RTSP)' })
  const { toasts, addToast, removeToast } = useToast()

  const filtered = cameraList.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase()) ||
      c.zone.toLowerCase().includes(search.toLowerCase()) ||
      c.ipAddress.includes(search)
  )

  const onlineCount = cameraList.filter((c) => c.status === 'online').length

  const handleAddClick = () => {
    setFormData({ name: '', ipAddress: '', location: '', zone: '', connectionType: 'IP Camera (RTSP)' })
    setShowAddModal(true)
  }

  const handleEditClick = (camera) => {
    setSelectedCamera(camera)
    setFormData({ name: camera.name, ipAddress: camera.ipAddress, location: camera.location, zone: camera.zone, connectionType: camera.connectionType })
    setShowEditModal(true)
  }

  const handleDeleteClick = (camera) => {
    setSelectedCamera(camera)
    setShowDeleteModal(true)
  }

  const handleAddCamera = () => {
    if (!formData.name.trim() || !formData.ipAddress.trim()) {
      addToast('Camera name and IP address are required.', 'warning')
      return
    }
    const newCamera = {
      id: `cam-${Date.now()}`,
      ...formData,
      status: 'online',
      statusLabel: 'Online',
      lastHeartbeat: new Date().toISOString(),
      resolution: '1280×800',
      fps: 60,
      inferenceFrameRate: 0,
      confidence: 0,
      uptime: '—',
      activeZones: 0,
      detections: { today: 0, thisWeek: 0, thisMonth: 0 },
      meta: [{ k: 'Connection', v: formData.connectionType }, { k: 'Status', v: 'Newly Added' }],
    }
    setCameraList([...cameraList, newCamera])
    setShowAddModal(false)
    addToast(`"${formData.name}" added successfully`, 'success')
  }

  const handleUpdateCamera = () => {
    if (!formData.name.trim() || !formData.ipAddress.trim()) {
      addToast('Camera name and IP address are required.', 'warning')
      return
    }
    setCameraList(cameraList.map((c) => (c.id === selectedCamera.id ? { ...c, ...formData } : c)))
    setShowEditModal(false)
    addToast(`"${formData.name}" updated successfully`, 'success')
  }

  const handleDeleteCamera = () => {
    setCameraList(cameraList.filter((c) => c.id !== selectedCamera.id))
    addToast(`"${selectedCamera.name}" removed`, 'info')
  }

  const columns = [
    { key: 'name', label: 'Camera Name', sortable: true },
    { key: 'location', label: 'Location', sortable: true },
    { key: 'zone', label: 'Zone', sortable: true },
    { key: 'ipAddress', label: 'IP Address', sortable: true },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: 'uptime', label: 'Uptime', sortable: true },
    {
      key: 'detections',
      label: 'Detections Today',
      render: (row) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.detections.today}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn-icon-secondary" title="Edit camera" onClick={() => handleEditClick(row)}>
            <Icon.Edit />
          </button>
          <button className="btn-icon-secondary" title="Remove camera" onClick={() => handleDeleteClick(row)}>
            <Icon.Trash />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="pagehead">
        <div>
          <h1>IP Cameras</h1>
          <div className="sub">
            {onlineCount} of {cameraList.length} cameras online · Manage IP/CCTV sources
          </div>
        </div>
        <div className="pagehead-right">
          <button className="btn-primary" onClick={handleAddClick}>
            <Icon.Plus />
            Add camera
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="camera-summary-strip">
        {[
          { label: 'Total cameras', value: cameraList.length, icon: Icon.Camera },
          { label: 'Online', value: cameraList.filter((c) => c.status === 'online').length, icon: Icon.Wifi, accent: true },
          { label: 'Offline', value: cameraList.filter((c) => c.status === 'offline').length, icon: Icon.WifiOff, alarm: true },
          { label: 'Detections today', value: cameraList.reduce((a, c) => a + c.detections.today, 0), icon: Icon.Eye },
        ].map(({ label, value, icon: SIcon, accent, alarm }) => (
          <div key={label} className={`camera-stat-card ${accent ? 'accent' : ''} ${alarm && value > 0 ? 'alarm' : ''}`}>
            <SIcon />
            <div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="panel">
        <div className="panel-head">
          <h3>Camera list</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="search-box">
              <Icon.Search />
              <input
                type="text"
                placeholder="Search by name, location, IP…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Icon.Camera}
            title={search ? 'No cameras match your search' : 'No cameras connected'}
            description={search ? 'Try a different search term.' : 'Add your first IP camera to start monitoring.'}
            action={!search && (
              <button className="btn-primary" onClick={handleAddClick}>
                <Icon.Plus /> Add camera
              </button>
            )}
          />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>

      {/* Add Modal */}
      <FormModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Camera" onSubmit={handleAddCamera} submitText="Add Camera">
        <div className="form-field">
          <label>Camera Name *</label>
          <input type="text" placeholder="e.g., South Patio Pool" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div className="form-field">
          <label>IP Address *</label>
          <input type="text" placeholder="e.g., 192.168.1.101" value={formData.ipAddress} onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })} />
        </div>
        <div className="form-row-2">
          <div className="form-field">
            <label>Location</label>
            <input type="text" placeholder="e.g., South Pool Area" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Monitoring Zone</label>
            <input type="text" placeholder="e.g., Main Pool" value={formData.zone} onChange={(e) => setFormData({ ...formData, zone: e.target.value })} />
          </div>
        </div>
        <div className="form-field">
          <label>Connection Type</label>
          <select value={formData.connectionType} onChange={(e) => setFormData({ ...formData, connectionType: e.target.value })}>
            <option>IP Camera (RTSP)</option>
            <option>IP Camera (HTTP)</option>
            <option>ONVIF</option>
            <option>USB</option>
          </select>
        </div>
      </FormModal>

      {/* Edit Modal */}
      <FormModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title={`Edit: ${selectedCamera?.name}`} onSubmit={handleUpdateCamera} submitText="Save Changes">
        <div className="form-field">
          <label>Camera Name *</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div className="form-field">
          <label>IP Address *</label>
          <input type="text" value={formData.ipAddress} onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })} />
        </div>
        <div className="form-row-2">
          <div className="form-field">
            <label>Location</label>
            <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Monitoring Zone</label>
            <input type="text" value={formData.zone} onChange={(e) => setFormData({ ...formData, zone: e.target.value })} />
          </div>
        </div>
        <div className="form-field">
          <label>Connection Type</label>
          <select value={formData.connectionType} onChange={(e) => setFormData({ ...formData, connectionType: e.target.value })}>
            <option>IP Camera (RTSP)</option>
            <option>IP Camera (HTTP)</option>
            <option>ONVIF</option>
            <option>USB</option>
          </select>
        </div>
      </FormModal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Remove Camera"
        message={`Remove "${selectedCamera?.name}"? All associated geofence zone assignments will also be cleared. This cannot be undone.`}
        onConfirm={handleDeleteCamera}
        isDangerous
        confirmText="Remove camera"
        cancelText="Keep it"
      />
    </div>
  )
}
