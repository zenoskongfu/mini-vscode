import React, { useState, useCallback } from 'react'
import { TitleBar } from './TitleBar'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { Panel } from './Panel'
import { StatusBar } from './StatusBar'
import './Workbench.css'

/**
 * The main workbench shell.
 *
 * Layout mirrors VSCode's CSS Grid approach:
 *
 *   ┌──────────────────────────────────┐
 *   │           TitleBar               │ ← 28px
 *   ├────┬──────────┬───────────────────┤
 *   │ AB │ Sidebar  │   EditorArea      │ ← flex: 1
 *   │    │          ├───────────────────┤
 *   │    │          │     Panel         │ ← var(--panel-height)
 *   ├────┴──────────┴───────────────────┤
 *   │           StatusBar               │ ← 22px
 *   └──────────────────────────────────┘
 *
 * AB = ActivityBar (48px fixed)
 * Sidebar width and Panel height are user-resizable via drag handles.
 */
export function Workbench(): React.JSX.Element {
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [panelHeight, setPanelHeight] = useState(220)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [panelVisible, setPanelVisible] = useState(true)
  const [activeView, setActiveView] = useState<string>('explorer')

  // Drag-resize: sidebar width
  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMove = (me: MouseEvent): void => {
      const delta = me.clientX - startX
      setSidebarWidth(Math.max(120, Math.min(600, startWidth + delta)))
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  // Drag-resize: panel height
  const handlePanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = panelHeight

    const onMove = (me: MouseEvent): void => {
      const delta = startY - me.clientY
      setPanelHeight(Math.max(80, Math.min(600, startHeight + delta)))
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelHeight])

  return (
    <div
      className="workbench"
      style={{
        '--sidebar-width': sidebarVisible ? `${sidebarWidth}px` : '0px',
        '--panel-height': panelVisible ? `${panelHeight}px` : '0px'
      } as React.CSSProperties}
    >
      <TitleBar className="workbench__titlebar" />

      <ActivityBar
        className="workbench__activitybar"
        activeView={activeView}
        onViewChange={setActiveView}
        onToggleSidebar={() => setSidebarVisible(v => !v)}
        onTogglePanel={() => setPanelVisible(v => !v)}
      />

      {sidebarVisible && (
        <>
          <Sidebar
            className="workbench__sidebar"
            activeView={activeView}
          />
          {/* Sidebar resize handle */}
          <div
            className="workbench__resize-handle workbench__resize-handle--sidebar"
            onMouseDown={handleSidebarResize}
          />
        </>
      )}

      <div className="workbench__center">
        <EditorArea className="workbench__editor" />

        {panelVisible && (
          <>
            {/* Panel resize handle */}
            <div
              className="workbench__resize-handle workbench__resize-handle--panel"
              onMouseDown={handlePanelResize}
            />
            <Panel className="workbench__panel" />
          </>
        )}
      </div>

      <StatusBar className="workbench__statusbar" />
    </div>
  )
}
