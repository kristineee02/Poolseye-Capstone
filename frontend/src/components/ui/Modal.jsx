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

function StatusFace({ failed }) {
  return (
    <svg className="status-alert-face" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="34" height="34" rx="10" stroke="currentColor" strokeWidth="2.2" />
      <path d="M17 20h3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M27.5 20H31" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {failed ? (
        <path d="M18 31c2.2-2.4 9.8-2.4 12 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M18 28c2.2 2.6 9.8 2.6 12 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  )
}

export function StatusModal({ status, onClose }) {
  if (!status) return null
  const failed = status.tone === 'error'
  const node = (
    <div className="modal-overlay modal-overlay-front" onClick={onClose}>
      <div
        className={`status-alert ${failed ? 'is-error' : 'is-success'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-alert-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="status-alert-close" onClick={onClose} aria-label="Close">
          <Icon.X />
        </button>
        <div className="status-alert-glow" aria-hidden="true">
          <StatusFace failed={failed} />
        </div>
        <h2 id="status-alert-title">{status.title}</h2>
        {status.message ? <p>{status.message}</p> : null}
        <button type="button" className="status-alert-ok" onClick={onClose}>OK</button>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') return createPortal(node, document.body)
  return node
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
