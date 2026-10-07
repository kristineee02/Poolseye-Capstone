import { Icon } from './Icon'
import './Toast.css'
import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_TOASTS = 3

export function Toast({ id, message, type = 'info', duration = 4000, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose?.(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  const icons = {
    success: Icon.Check,
    error: Icon.AlertCircle,
    warning: Icon.AlertTriangle,
    info: Icon.Info,
  }

  const IconComponent = icons[type] || Icon.Info

  return (
    <div className={`toast toast-${type}`} role="alert">
      <IconComponent />
      <span>{message}</span>
      <button className="toast-close" onClick={() => onClose?.(id)} aria-label="Close notification">
        <Icon.X />
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={removeToast} />
      ))}
    </div>
  )
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    nextId.current += 1
    const id = nextId.current
    setToasts((prev) => {
      // The same message already on screen is not stacked again.
      if (prev.some((t) => t.message === message)) return prev
      return [...prev, { id, message, type, duration }].slice(-MAX_TOASTS)
    })
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}
