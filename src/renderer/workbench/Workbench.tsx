import React, { useLayoutEffect, useState } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { TitleBar } from './TitleBar'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { Panel } from './Panel'
import { StatusBar } from './StatusBar'
import { CommandPalette } from '../components/command-palette/CommandPalette'
import { useService } from '../platform/ServicesContext'
import { useEvent } from '../platform/useEvent'
import { ILayoutService, type ActivityView } from '../services/layout/layoutService'
import { IEditorService } from '../services/editor/editorService'
import './Workbench.css'

/**
 * The main workbench shell.
 *
 * Layout:
 *   TitleBar                          (fixed top)
 *   ┌────┬─────────────────────────┐
 *   │ AB │  Allotment (horizontal) │  AB = ActivityBar (fixed 48px)
 *   │    │  [Sidebar | center]     │  center = Allotment (vertical)
 *   │    │            [Editor|Panel]│           [EditorArea | Panel]
 *   └────┴─────────────────────────┘
 *   StatusBar                         (fixed bottom)
 *
 * Pane sizes are managed by Allotment (drag the sashes). Visibility toggles
 * collapse a pane via Allotment.Pane's `visible` prop.
 */
export function Workbench(): React.JSX.Element {
  const layoutService = useService(ILayoutService)
  const editorService = useService(IEditorService)

  const restoredSidebarVisible = useEvent(
    layoutService.onDidChangeSidebarVisibility,
    () => layoutService.sidebarVisible
  )
  const restoredPanelVisible = useEvent(
    layoutService.onDidChangePanelVisibility,
    () => layoutService.panelVisible
  )
  const activeView = useEvent(
    layoutService.onDidChangeActiveView,
    () => layoutService.activeView
  )

  // Allotment lays out correctly only when panes start visible, then toggle.
  // So the first render keeps panes visible; a layout effect (pre-paint, no
  // flash) flips `mounted`, after which restored/persisted visibility applies.
  const [mounted, setMounted] = useState(false)
  useLayoutEffect(() => setMounted(true), [])
  const sidebarVisible = mounted ? restoredSidebarVisible : true
  const panelVisible = mounted ? restoredPanelVisible : true

  return (
    <div className="workbench">
      <TitleBar className="workbench__titlebar" />

      <div className="workbench__body">
        <ActivityBar
          className="workbench__activitybar"
          activeView={activeView}
          onViewChange={v => layoutService.setActiveView(v as ActivityView)}
          onToggleSidebar={() => layoutService.toggleSidebar()}
          onTogglePanel={() => layoutService.togglePanel()}
        />

        {/* Horizontal split: Sidebar | center */}
        <Allotment proportionalLayout={false} className="workbench__allotment">
          <Allotment.Pane
            preferredSize={240}
            minSize={170}
            maxSize={500}
            visible={sidebarVisible}
            snap
          >
            <Sidebar
              className="workbench__sidebar"
              activeView={activeView}
              onOpenFile={path => editorService.openEditor(path)}
            />
          </Allotment.Pane>

          <Allotment.Pane>
            {/* Vertical split: EditorArea | Panel */}
            <Allotment vertical proportionalLayout={false}>
              <Allotment.Pane minSize={100}>
                <EditorArea
                  className="workbench__editor"
                  onCursorChange={(line, column) => layoutService.setCursor({ line, column })}
                />
              </Allotment.Pane>

              <Allotment.Pane preferredSize={220} minSize={80} visible={panelVisible} snap>
                <Panel className="workbench__panel" />
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      </div>

      <StatusBar className="workbench__statusbar" />

      {/* Overlays */}
      <CommandPalette />
    </div>
  )
}
