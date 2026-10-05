import { useCallback, useState } from 'react'
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

const ALERT_TONES = {
  success: { icon: Icon.CheckCircle, color: 'safe' },
  error: { icon: Icon.AlertCircle, color: 'alarm' },
  notfound: { icon: Icon.FileSearch, color: 'alarm' },
  warning: { icon: Icon.AlertCircle, color: 'warn' },
  danger: { icon: Icon.Trash, color: 'alarm' },
  info: { icon: Icon.Info, color: 'accent' },
  processing: { icon: null, color: 'accent' },
}

export function AlertDialog({
  open = true,
  tone = 'info',
  icon,
  title,
  message,
  onClose,
  confirmText = 'OK',
  cancelText,
  onConfirm,
  confirmVariant,
}) {
  if (!open) return null
  const config = ALERT_TONES[tone] || ALERT_TONES.info
  const AlertIcon = icon || config.icon
  const isProcessing = tone === 'processing'
  const variant = confirmVariant || (tone === 'danger' ? 'danger' : 'primary')
  const dismiss = isProcessing ? undefined : onClose

  const handleConfirm = () => {
    if (onConfirm) onConfirm()
    else onClose?.()
  }

  const node = (
    <div className="modal-overlay modal-overlay-front" onClick={dismiss}>
      <div
        className={`alert-dialog color-${config.color}${isProcessing ? ' is-processing' : ''}`}
        role={isProcessing ? 'status' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {!isProcessing && onClose ? (
          <button type="button" className="alert-dialog-close" onClick={onClose} aria-label="Close">
            <Icon.X />
          </button>
        ) : null}

        {isProcessing ? (
          <span className="alert-dialog-spinner" aria-hidden="true" />
        ) : (
          <div className="alert-dialog-icon" aria-hidden="true">
            <AlertIcon />
          </div>
        )}

        <h2 id="alert-dialog-title">{title}</h2>
        {message ? <p>{message}</p> : null}

        {!isProcessing ? (
          <div className={`alert-dialog-actions${cancelText ? ' has-cancel' : ''}`}>
            {cancelText ? (
              <button type="button" className="alert-dialog-btn is-secondary" onClick={onClose}>
                {cancelText}
              </button>
            ) : null}
            <button type="button" className={`alert-dialog-btn is-${variant}`} onClick={handleConfirm} autoFocus>
              {confirmText}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )

  if (typeof document !== 'undefined') return createPortal(node, document.body)
  return node
}

export function ConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  onConfirm,
  isDangerous = false,
  tone,
  icon,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}) {
  return (
    <AlertDialog
      open={isOpen}
      tone={tone || (isDangerous ? 'danger' : 'warning')}
      icon={icon}
      title={title}
      message={message}
      onClose={onClose}
      cancelText={cancelText}
      confirmText={confirmText}
      confirmVariant={isDangerous ? 'danger' : 'primary'}
      onConfirm={() => {
        onConfirm()
        onClose()
      }}
    />
  )
}

export function useStatusModal() {
  const [status, setStatus] = useState(null)
  const showStatus = useCallback((next) => setStatus(next), [])
  const closeStatus = useCallback(() => setStatus(null), [])
  return { status, showStatus, closeStatus }
}

export function StatusModal({ status, onClose }) {
  if (!status) return null
  return (
    <AlertDialog
      tone={status.tone || 'info'}
      icon={status.icon}
      title={status.title}
      message={status.message}
      onClose={onClose}
      confirmText={status.confirmText || 'OK'}
    />
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
