import React from 'react'
import './TitleBar.css'

interface TitleBarProps {
  className?: string
}

const isMac = navigator.platform.toUpperCase().includes('MAC')

/**
 * 自定义标题栏。
 *
 * macOS：红黄绿按钮由 Electron 原生渲染
 *（window-manager.ts 中的 titleBarStyle: 'hidden' + trafficLightPosition）。
 * 这里仅需在左侧留出空间，其余区域由 -webkit-app-region: drag 负责拖拽。
 *
 * Windows/Linux：渲染自己的最小化/最大化/关闭按钮，
 * 并通过 window.electronAPI.window.* 与 main 进程通信。
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
      {/* macOS：为红黄绿按钮留出占位（72px = 3 个按钮 × 12px + padding） */}
      {isMac && <div className="title-bar__mac-spacer" />}

      {/* 中间：应用名 + 文件路径（Phase 3 占位） */}
      <div className="title-bar__center">
        <span className="title-bar__app-name">Mini VSCode</span>
      </div>

      {/* Windows/Linux：自定义窗口按钮 */}
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
