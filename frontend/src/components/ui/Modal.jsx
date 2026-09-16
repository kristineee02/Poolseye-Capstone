import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import './Modal.css'

export function Modal({ isOpen, onClose, title, children, size = 'md', elevated = false }) {
  if (!isOpen) return null

  const node = (
    <div className={`modal-overlay${elevated ? ' modal-overlay-front' : ''}`} onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <Icon.X />
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  )

  if (elevated && typeof document !== 'undefined') {
    return createPortal(node, document.body)
  }

  return node
}

export function ConfirmModal({ isOpen, onClose, title, message, onConfirm, isDangerous = false, confirmText = 'Confirm', cancelText = 'Cancel' }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="confirm-modal-content">
        <p>{message}</p>
        <div className="confirm-modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            {cancelText}
          </button>
          <button
            className={isDangerous ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function useStatusModal() {
  const [status, setStatus] = useState(null)
  const showStatus = (next) => setStatus(next)
  const closeStatus = () => setStatus(null)
  return { status, showStatus, closeStatus }
}

export function StatusModal({ status, onClose }) {
  if (!status) return null
  const failed = status.tone === 'error'
  return (
    <Modal isOpen onClose={onClose} title={status.title} size="sm" elevated>
      <div className={`status-modal ${failed ? 'status-error' : 'status-success'}`}>
        <p>{status.message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className={failed ? 'btn-danger' : 'btn-primary'} onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function FormModal({ isOpen, onClose, title, onSubmit, submitText = 'Save', submitDisabled = false, submitting = false, children }) {
  const handleSubmit = (e) => {
    e.preventDefault()
    if (submitDisabled || submitting) return
    onSubmit()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="form-modal">
        {children}
        <div className="form-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitDisabled || submitting}>
            {submitting ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {submitting ? 'Please wait…' : submitText}
          </button>
        </div>
      </form>
    </Modal>
  )
}
