import { Icon } from './Icon'
import './Toast.css'
import { useCallback, useEffect, useRef, useState } from 'react'

export function Toast({ message, type = 'info', duration = 4000, onClose }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current?.(), duration)
    return () => clearTimeout(timer)
  }, [duration])

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
      <button className="toast-close" onClick={() => onCloseRef.current?.()} aria-label="Close notification">
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
let nextToastId = 1

export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = nextToastId++
    setToasts((prev) => {
      if (prev.some((t) => t.message === message && t.type === type)) return prev
      return [...prev, { id, message, type, duration }]
    })
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}
