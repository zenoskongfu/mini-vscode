import React, { useState } from 'react'
import { useService } from '../platform/ServicesContext'
import { ICommandService } from '../services/commands/commandService'
import { ContextMenu, type ContextMenuEntry } from '../components/context-menu/ContextMenu'
import './ActivityBar.css'

interface ActivityBarProps {
  className?: string
  activeView: string
  onViewChange: (view: string) => void
  onToggleSidebar: () => void
  onTogglePanel: () => void
}

interface ViewItem {
  id: string
  title: string
  icon: React.ReactNode
}

/**
 * 最左侧的垂直图标栏。
 * 点击图标会切换侧边栏视图（Explorer、Search、SCM、Extensions）。
 * 再次点击当前活动图标会收起侧边栏。
 *
 * 底部区域放置 Settings 和 Terminal toggle（它们不是侧边栏视图）。
 */
export function ActivityBar({
  className = '',
  activeView,
  onViewChange,
  onToggleSidebar,
  onTogglePanel
}: ActivityBarProps): React.JSX.Element {
  const topViews: ViewItem[] = [
    { id: 'explorer',   title: 'Explorer (Ctrl+Shift+E)',   icon: <ExplorerIcon /> },
    { id: 'search',     title: 'Search (Ctrl+Shift+F)',     icon: <SearchIcon /> },
    { id: 'scm',        title: 'Source Control (Ctrl+Shift+G)', icon: <SCMIcon /> },
    { id: 'extensions', title: 'Extensions (Ctrl+Shift+X)', icon: <ExtensionsIcon /> },
  ]

  const commandService = useService(ICommandService)
  const [manageMenu, setManageMenu] = useState<{ x: number; y: number } | null>(null)

  const handleViewClick = (id: string): void => {
    if (id === activeView) {
      onToggleSidebar()
    } else {
      onViewChange(id)
    }
  }

  // 底部管理齿轮打开命令菜单：VSCode 的齿轮是菜单，
  // 不是直接动作。每个菜单项只分发一个 command id。
  const openManageMenu = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    setManageMenu({ x: rect.right + 2, y: rect.top })
  }

  const manageItems: ContextMenuEntry[] = [
    { label: 'Command Palette…', onClick: () => commandService.executeCommand('workbench.action.showCommands') },
    { separator: true },
    { label: 'Settings (JSON)', onClick: () => commandService.executeCommand('workbench.action.openSettingsJson') },
    { label: 'Color Theme', onClick: () => commandService.executeCommand('workbench.action.selectTheme') }
  ]

  return (
    <aside className={`activity-bar ${className}`}>
      {/* 顶部：主视图 */}
      <div className="activity-bar__top">
        {topViews.map(view => (
          <button
            key={view.id}
            className={`activity-bar__item ${activeView === view.id ? 'activity-bar__item--active' : ''}`}
            title={view.title}
            onClick={() => handleViewClick(view.id)}
          >
            {view.icon}
            {activeView === view.id && (
              <span className="activity-bar__active-indicator" />
            )}
          </button>
        ))}
      </div>

      {/* 底部：设置 + 终端 */}
      <div className="activity-bar__bottom">
        <button
          className="activity-bar__item"
          title="Toggle Panel (Ctrl+`)"
          onClick={onTogglePanel}
        >
          <TerminalIcon />
        </button>
        <button
          className={`activity-bar__item ${manageMenu ? 'activity-bar__item--active' : ''}`}
          title="Manage"
          onClick={openManageMenu}
        >
          <SettingsIcon />
        </button>
      </div>

      {manageMenu && (
        <ContextMenu
          x={manageMenu.x}
          y={manageMenu.y}
          items={manageItems}
          onClose={() => setManageMenu(null)}
        />
      )}
    </aside>
  )
}

/* ── SVG 图标组件（内联，贴近 VSCode Codicons 风格）── */

function ExplorerIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5C3 3.9 3.9 3 5 3h6l2 2h8c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5z"
        stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SCMIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 8.5v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 8.5C7 8.5 7 11 10 11h4a3 3 0 003-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function ExtensionsIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 17h8M17 13v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function TerminalIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9l4 3.5L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="13" y1="16" x2="17" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
    </svg>
  )
}
