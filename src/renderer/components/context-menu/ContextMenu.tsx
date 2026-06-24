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
 * 通过 portal 定位的上下文菜单。
 * 会夹取到视口范围内，避免菜单跑到屏幕外。
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // 挂载后夹取到视口内（测量真实尺寸，被裁切时向内平移）。
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

  // 点击外部或按 Escape 时关闭
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
