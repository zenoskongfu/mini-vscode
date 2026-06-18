import React, { useEffect, useRef } from 'react'
import './ContextMenu.css'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  separator?: false
}

export interface ContextMenuSeparator {
  separator: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

/**
 * Portal-positioned context menu.
 * Clamps to viewport so it never clips off-screen.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Clamp position after mount so menu stays within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 'var(--z-context-menu)' as unknown as number
  }

  return (
    <div ref={menuRef} className="context-menu" style={style}>
      {items.map((item, i) => {
        if ('separator' in item && item.separator) {
          return <div key={i} className="context-menu__separator" />
        }
        const mi = item as ContextMenuItem
        return (
          <button
            key={i}
            className={`context-menu__item ${mi.danger ? 'context-menu__item--danger' : ''}`}
            disabled={mi.disabled}
            onClick={() => { mi.onClick(); onClose() }}
          >
            {mi.icon && <span className="context-menu__icon">{mi.icon}</span>}
            <span>{mi.label}</span>
          </button>
        )
      })}
    </div>
  )
}
