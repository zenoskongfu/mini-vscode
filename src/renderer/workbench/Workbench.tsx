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
import { NotificationToasts } from '../components/notifications/NotificationToast'
import { useService } from '../platform/ServicesContext'
import { useEvent } from '../platform/useEvent'
import { ILayoutService, type ActivityView } from '../services/layout/layoutService'
import { IEditorService } from '../services/editor/editorService'
import './Workbench.css'

/**
 * 主 workbench 外壳。
 *
 * 布局：
 *   TitleBar                          （顶部固定）
 *   ┌────┬─────────────────────────┐
 *   │ AB │  Allotment（水平）       │  AB = ActivityBar（固定 48px）
 *   │    │  [Sidebar | center]     │  center = Allotment（垂直）
 *   │    │            [Editor|Panel]│           [EditorArea | Panel]
 *   └────┴─────────────────────────┘
 *   StatusBar                         （底部固定）
 *
 * pane 尺寸由 Allotment 管理（拖动分隔条）。可见性切换会通过
 * Allotment.Pane 的 `visible` prop 折叠对应 pane。
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

  // Allotment 只有在 pane 初始可见、随后再切换时才能正确测量布局。
  // 因此首轮 render 先保持 pane 可见；随后 layout effect（绘制前执行，
  // 不会闪烁）翻转 `mounted`，再应用恢复/持久化的可见状态。
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

        {/* 水平切分：Sidebar | 中心区域 */}
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
            {/* 垂直切分：EditorArea | Panel */}
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

      {/* 覆盖层 */}
      <CommandPalette />
      <NotificationToasts />
    </div>
  )
}
