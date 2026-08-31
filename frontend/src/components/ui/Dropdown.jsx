import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import './Dropdown.css'

function useClickOutside(ref, handler, active) {
  useEffect(() => {
    if (!active) return undefined
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        handler()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [ref, handler, active])
}

export function SelectDropdown({
  value,
  onChange,
  options,
  align = 'left',
  minWidth,
  className = '',
  disabled = false,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find((option) => option.value === value)

  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div
      className={`ui-dropdown ${className}`.trim()}
      ref={ref}
      style={minWidth ? { minWidth } : undefined}
    >
      <button
        type="button"
        className={`ui-dropdown-trigger${open ? ' open' : ''}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
      >
        <span className="ui-dropdown-trigger-label">{selected?.label ?? 'Select'}</span>
        <Icon.ChevronDown className="ui-dropdown-chevron" />
      </button>
      {open ? (
        <div className={`ui-dropdown-menu ui-dropdown-align-${align}`} role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`ui-dropdown-item${option.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function MenuDropdown({
  trigger,
  children,
  align = 'right',
  minWidth,
  className = '',
  ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div
      className={`ui-dropdown ${className}`.trim()}
      ref={ref}
      style={minWidth ? { minWidth } : undefined}
    >
      <button
        type="button"
        className={`ui-dropdown-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
      >
        {trigger}
      </button>
      {open ? (
        <div className={`ui-dropdown-menu ui-dropdown-align-${align}`} role="menu">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function DropdownItem({ children, onClick, icon: ItemIcon, className = '' }) {
  return (
    <button
      type="button"
      className={`ui-dropdown-item${className ? ` ${className}` : ''}`}
      role="menuitem"
      onClick={onClick}
    >
      {ItemIcon ? <ItemIcon className="ui-dropdown-item-icon" /> : null}
      <span>{children}</span>
    </button>
  )
}
