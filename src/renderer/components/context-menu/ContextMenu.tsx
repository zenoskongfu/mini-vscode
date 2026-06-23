import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const [pos, setPos] = useState({ x, y })

  // Clamp to the viewport after mount (measure real size, shift in if clipped).
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 4
    let nx = x
    let ny = y
    if (nx + width > window.innerWidth) nx = Math.max(margin, window.innerWidth - width - margin)
    if (ny + height > window.innerHeight) ny = Math.max(margin, window.innerHeight - height - margin)
    setPos({ x: nx, y: ny })
  }, [x, y])

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

  const style: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    top: pos.y,
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
