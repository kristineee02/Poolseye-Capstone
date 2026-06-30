import { Icon } from './Icon'
import './Toast.css'
import { useEffect, useState } from 'react'

export function Toast({ message, type = 'info', duration = 4000, onClose }) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  if (!isVisible) return null

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
      <button className="toast-close" onClick={() => setIsVisible(false)} aria-label="Close notification">
        <Icon.X />
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = 'info', duration = 4000) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type, duration }])
    return id
  }

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return { toasts, addToast, removeToast }
}
