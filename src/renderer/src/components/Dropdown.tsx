// A small labelled picker used by the session toolbar.

import type React from 'react'

export function Dropdown({

  control,
  open,
  onToggle,
  onClose,
  label,
  icon,
  width,
  children
}: {
  control?:string
  open: boolean
  onToggle: () => void
  onClose: () => void
  label: React.ReactNode
  icon?: string
  width: number
  children: React.ReactNode
}) {
  return (
    <div className="picker" data-control={control}>
      <button className={`ctl ${open ? 'open' : ''}`} onClick={onToggle}>
        {icon && <span className="ctl-icon">{icon}</span>}
        <span className="ctl-label">{label}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <>
          <div className="scrim" onClick={onClose} />
          <div className="menu" style={{ minWidth: width }}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}
