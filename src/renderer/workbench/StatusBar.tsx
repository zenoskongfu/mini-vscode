import React from 'react'
import './StatusBar.css'

interface StatusBarProps {
  className?: string
}

/**
 * Bottom status bar.
 * Phase 1: static placeholder values.
 * Phase 3+: real language mode, line/col from Monaco cursor.
 * Phase 8+: git branch from GitService.
 */
export function StatusBar({ className = '' }: StatusBarProps): React.JSX.Element {
  return (
    <footer className={`status-bar ${className}`}>
      {/* Left section */}
      <div className="status-bar__section status-bar__section--left">
        <StatusItem icon={<BranchIcon />} text="main" title="Git branch" />
        <StatusItem icon={<SyncIcon />} text="0↓ 0↑" title="Git sync" />
      </div>

      {/* Right section */}
      <div className="status-bar__section status-bar__section--right">
        <StatusItem text="Ln 1, Col 1" title="Go to Line/Column" />
        <StatusItem text="UTF-8" title="File encoding" />
        <StatusItem text="LF" title="End of line sequence" />
        <StatusItem text="TypeScript" title="Language mode" />
        <StatusItem icon={<BellIcon />} title="No notifications" />
      </div>
    </footer>
  )
}

function StatusItem({
  icon,
  text,
  title
}: {
  icon?: React.ReactNode
  text?: string
  title?: string
}): React.JSX.Element {
  return (
    <button className="status-bar__item" title={title}>
      {icon && <span className="status-bar__item-icon">{icon}</span>}
      {text && <span>{text}</span>}
    </button>
  )
}

/* ── Inline SVG icons ── */

function BranchIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
    </svg>
  )
}

function SyncIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 8A6.5 6.5 0 018 1.5V0a8 8 0 100 16v-1.5A6.5 6.5 0 011.5 8z" />
      <path d="M8 0v4l3-2-3-2zM8 16v-4l-3 2 3 2z" />
    </svg>
  )
}

function BellIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 16a2 2 0 001.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 008 16z" />
      <path d="M8 1.5A5.5 5.5 0 002.5 7v2.947c0 .346-.102.683-.294.97L1.03 12.57A.75.75 0 001.75 14h12.5a.75.75 0 00.72-.57l-1.175-1.654A1.75 1.75 0 0113.5 9.947V7A5.5 5.5 0 008 1.5z" />
    </svg>
  )
}
