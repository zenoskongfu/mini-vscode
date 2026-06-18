import React from 'react'
import './TitleBar.css'

interface TitleBarProps {
  className?: string
}

const isMac = navigator.platform.toUpperCase().includes('MAC')

/**
 * Custom title bar.
 *
 * On macOS: traffic-light buttons are rendered natively by Electron
 * (titleBarStyle: 'hidden' + trafficLightPosition in window-manager.ts).
 * We just need to leave space on the left (-webkit-app-region: drag covers the rest).
 *
 * On Windows/Linux: we render our own minimize/maximize/close buttons
 * and communicate with the main process via window.electronAPI.window.*
 */
export function TitleBar({ className = '' }: TitleBarProps): React.JSX.Element {
  const handleMinimize = (): void => {
    window.electronAPI.window.minimize()
  }
  const handleMaximize = (): void => {
    window.electronAPI.window.maximize()
  }
  const handleClose = (): void => {
    window.electronAPI.window.close()
  }

  return (
    <header className={`title-bar ${className}`}>
      {/* macOS: spacer for traffic lights (72px = 3 buttons × 12px + padding) */}
      {isMac && <div className="title-bar__mac-spacer" />}

      {/* Center: app name + file path (placeholder for Phase 3) */}
      <div className="title-bar__center">
        <span className="title-bar__app-name">Mini VSCode</span>
      </div>

      {/* Windows/Linux: custom window controls */}
      {!isMac && (
        <div className="title-bar__controls">
          <button
            className="title-bar__btn title-bar__btn--minimize"
            onClick={handleMinimize}
            title="Minimize"
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="title-bar__btn title-bar__btn--maximize"
            onClick={handleMaximize}
            title="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="0.5" y="0.5" width="9" height="9"
                fill="none" stroke="currentColor"
              />
            </svg>
          </button>
          <button
            className="title-bar__btn title-bar__btn--close"
            onClick={handleClose}
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
    </header>
  )
}
